// Phonon-2 speech recognition on Android: the glue around Fermion Research's CPU engine (libphonon2_enc + libphonon2_tdt,
// Apache-2.0 binaries). It follows the call sequence in the engine's docs/android.md:
//
//   model.fermion -> packed matrices + tables -> encoder and decoder handles
//   audio -> log-mel [T][128] -> encoder -> [T8][1024] -> projector -> [T8][640] -> greedy TDT -> token ids
//
// The container index (names, kinds, shapes, sizes) is read by the Kotlin side, which also turns token ids into text.
// The engine is loaded with dlopen, in the instruction-set tier this processor supports, because a library built for
// instructions the core lacks faults on first use instead of failing to load.

#include <jni.h>

#include <dlfcn.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#if defined(__aarch64__)
#include <sys/auxv.h>
#endif

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <map>
#include <string>
#include <utility>
#include <vector>

#include "phonon2.h"

namespace {

// ---------- the engine, loaded at run time ----------

struct Api {
  decltype(&phonon2_cpu_set_threads) cpu_set_threads;
  decltype(&phonon2_cpu_create_onedot_wire_many) create_many;
  decltype(&phonon2_cpu_destroy) cpu_destroy;
  decltype(&phonon2_enc_create) enc_create;
  decltype(&phonon2_enc_destroy) enc_destroy;
  decltype(&phonon2_enc_set_subsampling) enc_set_subsampling;
  decltype(&phonon2_enc_set_layer) enc_set_layer;
  decltype(&phonon2_enc_out_len) enc_out_len;
  decltype(&phonon2_enc_forward) enc_forward;
  decltype(&phonon2_tdt_set_threads) tdt_set_threads;
  decltype(&phonon2_tdt_create) tdt_create;
  decltype(&phonon2_tdt_destroy) tdt_destroy;
  decltype(&phonon2_tdt_decode) tdt_decode;
};

Api api{};
bool apiReady = false;
std::string lastError;

template <typename F>
bool sym(void *lib, const char *name, F &out) {
  out = reinterpret_cast<F>(dlsym(lib, name));
  if (!out) lastError = std::string("The speech engine is missing ") + name + ".";
  return out != nullptr;
}

bool loadEngine() {
  if (apiReady) return true;
#if defined(__aarch64__)
  const unsigned long h1 = getauxval(AT_HWCAP);
  const bool dotprod = (h1 & (1UL << 20)) != 0;  // HWCAP_ASIMDDP
  const bool lse = (h1 & (1UL << 8)) != 0;       // HWCAP_ATOMICS
  const std::string tier = dotprod && lse ? "" : "-base";
  const std::string encName = "libphonon2_enc-android-arm64-v8a" + tier + ".so";
  const std::string tdtName = "libphonon2_tdt-android-arm64-v8a" + tier + ".so";
  void *enc = dlopen(encName.c_str(), RTLD_NOW | RTLD_LOCAL);
  void *tdt = enc ? dlopen(tdtName.c_str(), RTLD_NOW | RTLD_LOCAL) : nullptr;
  if (!enc || !tdt) {
    const char *why = dlerror();
    lastError = std::string("Phonon-2 can't run on this processor (") + (why ? why : "the engine didn't load") + ").";
    return false;
  }
  bool ok = sym(enc, "phonon2_cpu_set_threads", api.cpu_set_threads) && sym(enc, "phonon2_cpu_create_onedot_wire_many", api.create_many) &&
            sym(enc, "phonon2_cpu_destroy", api.cpu_destroy) && sym(enc, "phonon2_enc_create", api.enc_create) &&
            sym(enc, "phonon2_enc_destroy", api.enc_destroy) && sym(enc, "phonon2_enc_set_subsampling", api.enc_set_subsampling) &&
            sym(enc, "phonon2_enc_set_layer", api.enc_set_layer) && sym(enc, "phonon2_enc_out_len", api.enc_out_len) &&
            sym(enc, "phonon2_enc_forward", api.enc_forward) && sym(tdt, "phonon2_tdt_set_threads", api.tdt_set_threads) &&
            sym(tdt, "phonon2_tdt_create", api.tdt_create) && sym(tdt, "phonon2_tdt_destroy", api.tdt_destroy) &&
            sym(tdt, "phonon2_tdt_decode", api.tdt_decode);
  apiReady = ok;
  return ok;
#else
  lastError = "Phonon-2 runs on 64-bit ARM phones and tablets only.";
  return false;
#endif
}

// ---------- numbers ----------

float halfToFloat(uint16_t h) {
  const uint32_t sign = (h & 0x8000u) << 16;
  uint32_t exp = (h >> 10) & 0x1Fu;
  uint32_t man = h & 0x3FFu;
  uint32_t bits;
  if (exp == 0) {
    if (man == 0) {
      bits = sign;
    } else {  // subnormal: normalise
      exp = 127 - 15 + 1;
      while (!(man & 0x400u)) {
        man <<= 1;
        exp--;
      }
      man &= 0x3FFu;
      bits = sign | (exp << 23) | (man << 13);
    }
  } else if (exp == 31) {
    bits = sign | 0x7F800000u | (man << 13);
  } else {
    bits = sign | ((exp - 15 + 127) << 23) | (man << 13);
  }
  float f;
  std::memcpy(&f, &bits, sizeof f);
  return f;
}

// ---------- the container ----------

enum Kind { FIVE_VALUE = 0, INT6 = 1, FP16 = 2 };

struct Record {
  Kind kind;
  std::vector<int64_t> shape;
  const uint8_t *data;
  size_t bytes;
  int64_t count() const {
    int64_t n = 1;
    for (auto d : shape) n *= d;
    return n;
  }
};

struct Container {
  void *map = MAP_FAILED;
  size_t size = 0;
  std::map<std::string, Record> records;
  ~Container() {
    if (map != MAP_FAILED) munmap(map, size);
  }
  const Record *get(const std::string &name) const {
    auto it = records.find(name);
    return it == records.end() ? nullptr : &it->second;
  }
};

// int6: 3 bytes hold 4 codes (code = (packed >> 6k) & 63), the value is code - 32; then one fp16 scale per row.
void int6Codes(const Record &r, std::vector<int8_t> &q, std::vector<uint16_t> &scales) {
  const int64_t total = r.count();
  const int64_t rows = r.shape.empty() ? 1 : r.shape[0];
  q.resize(total);
  scales.resize(rows);
  const uint8_t *b = r.data;
  for (int64_t i = 0, g = 0; i < total; g += 3) {
    const uint32_t packed = b[g] | (uint32_t(b[g + 1]) << 8) | (uint32_t(b[g + 2]) << 16);
    for (int k = 0; k < 4 && i < total; k++, i++) q[i] = int8_t(int((packed >> (6 * k)) & 63u) - 32);
  }
  std::memcpy(scales.data(), r.data + r.bytes - 2 * rows, 2 * rows);
}

// Any record as fp32: int6 dequantised per row, fp16 converted.
std::vector<float> floats(const Record &r) {
  std::vector<float> out(r.count());
  if (r.kind == FP16) {
    const auto *h = reinterpret_cast<const uint16_t *>(r.data);
    for (size_t i = 0; i < out.size(); i++) {
      uint16_t v;
      std::memcpy(&v, h + i, 2);
      out[i] = halfToFloat(v);
    }
  } else if (r.kind == INT6) {
    std::vector<int8_t> q;
    std::vector<uint16_t> s;
    int6Codes(r, q, s);
    const int64_t rows = s.size(), cols = int64_t(out.size()) / rows;
    for (int64_t row = 0; row < rows; row++) {
      const float scale = halfToFloat(s[row]);
      for (int64_t c = 0; c < cols; c++) out[row * cols + c] = q[row * cols + c] * scale;
    }
  }
  return out;
}

// ---------- the model ----------

constexpr int L = 24, D = 1024, FF = 4096, HEADS = 8, CONV_K = 9, MELS = 128, SUB_CH = 256;
constexpr int V = 8193, E = 640, H = 640, NHEAD = 8198, NDUR = 5, BLANK = 8192, MAX_SYM = 10;

struct Model {
  void *enc = nullptr;
  void *tdt = nullptr;
  std::vector<void *> matrices;
  std::vector<float> projW, projB;  // encoder_projector [640][1024], [640]
  ~Model() {
    if (enc) api.enc_destroy(enc);
    if (tdt) api.tdt_destroy(tdt);
    for (void *m : matrices)
      if (m) api.cpu_destroy(m);
  }
};

const char *LAYER_MATS[11] = {"feed_forward1.linear1", "feed_forward1.linear2", "self_attn.q_proj", "self_attn.k_proj", "self_attn.v_proj", "self_attn.o_proj", "self_attn.relative_k_proj", "conv.pointwise_conv1", "conv.pointwise_conv2", "feed_forward2.linear1", "feed_forward2.linear2"};
const char *LAYER_VECS[17] = {"norm_feed_forward1.weight", "norm_feed_forward1.bias", "norm_self_att.weight", "norm_self_att.bias", "norm_conv.weight", "norm_conv.bias", "norm_feed_forward2.weight", "norm_feed_forward2.bias", "norm_out.weight", "norm_out.bias", "self_attn.bias_u", "self_attn.bias_v", "conv.depthwise_conv.weight", "conv.norm.weight", "conv.norm.bias", "conv.norm.running_mean", "conv.norm.running_var"};

Model *build(const Container &c, int threads) {
  auto need = [&](const std::string &name) -> const Record & {
    const Record *r = c.get(name);
    if (!r) throw std::string("The model file has no ") + name + ".";
    return *r;
  };
  auto *m = new Model();
  try {
    api.cpu_set_threads(threads);
    api.tdt_set_threads(threads);

    // The 264 packed matrices, built together on the engine's thread pool.
    std::vector<std::string> names;
    for (int l = 0; l < L; l++)
      for (const char *mod : LAYER_MATS) names.push_back("encoder.layers." + std::to_string(l) + "." + mod);
    const int n = int(names.size());
    std::vector<int> rows(n), cols(n);
    std::vector<const uint8_t *> blobs(n);
    std::vector<size_t> lens(n);
    for (int i = 0; i < n; i++) {
      const Record &r = need(names[i]);
      if (r.kind != FIVE_VALUE || r.shape.size() != 2) throw std::string("Unexpected record ") + names[i] + ".";
      rows[i] = int(r.shape[0]);
      cols[i] = int(r.shape[1]);
      blobs[i] = r.data;
      lens[i] = r.bytes;
    }
    m->matrices.assign(n, nullptr);
    if (api.create_many(n, rows.data(), cols.data(), blobs.data(), lens.data(), m->matrices.data()) != n) throw std::string("The speech engine refused the model's matrices.");

    m->enc = api.enc_create(L, D, FF, HEADS, CONV_K, MELS, SUB_CH);
    const std::string s = "encoder.subsampling.";
    auto c0w = floats(need(s + "layers.0.weight")), c0b = floats(need(s + "layers.0.bias"));
    auto dw1w = floats(need(s + "layers.2.weight")), dw1b = floats(need(s + "layers.2.bias"));
    auto pw1w = floats(need(s + "layers.3.weight")), pw1b = floats(need(s + "layers.3.bias"));
    auto dw2w = floats(need(s + "layers.5.weight")), dw2b = floats(need(s + "layers.5.bias"));
    auto pw2w = floats(need(s + "layers.6.weight")), pw2b = floats(need(s + "layers.6.bias"));
    auto linw = floats(need(s + "linear.weight")), linb = floats(need(s + "linear.bias"));
    std::vector<float> invFreq(D / 2);
    for (int i = 0; i < D / 2; i++) invFreq[i] = 1.0f / std::pow(10000.0f, float(2 * i) / float(D));
    if (api.enc_set_subsampling(m->enc, c0w.data(), c0b.data(), dw1w.data(), dw1b.data(), pw1w.data(), pw1b.data(), dw2w.data(), dw2b.data(), pw2w.data(), pw2b.data(), linw.data(), linb.data(), invFreq.data()) != 0)
      throw std::string("The speech engine refused the model's first layers.");

    for (int l = 0; l < L; l++) {
      const std::string p = "encoder.layers." + std::to_string(l) + ".";
      void *mats[11];
      for (int k = 0; k < 11; k++) mats[k] = m->matrices[l * 11 + k];
      std::vector<std::vector<float>> vecs;
      vecs.reserve(17);
      for (const char *v : LAYER_VECS) vecs.push_back(floats(need(p + v)));
      const float *ptrs[17];
      for (int k = 0; k < 17; k++) ptrs[k] = vecs[k].data();
      if (api.enc_set_layer(m->enc, l, mats, ptrs) != 0) throw std::string("The speech engine refused layer ") + std::to_string(l) + ".";
    }

    // Decoder tables: int8 codes + fp16 row scales as stored; biases stay fp16.
    struct Table {
      std::vector<int8_t> q;
      std::vector<uint16_t> s;
    };
    auto table = [&](const std::string &name) {
      Table t;
      int6Codes(need(name), t.q, t.s);
      return t;
    };
    auto half = [&](const std::string &name) {
      const Record &r = need(name);
      std::vector<uint16_t> out(r.count());
      std::memcpy(out.data(), r.data, out.size() * 2);
      return out;
    };
    Table emb = table("decoder.embedding.weight"), ih0 = table("decoder.lstm.weight_ih_l0"), hh0 = table("decoder.lstm.weight_hh_l0");
    Table ih1 = table("decoder.lstm.weight_ih_l1"), hh1 = table("decoder.lstm.weight_hh_l1"), proj = table("decoder.decoder_projector.weight");
    Table head = table("joint.head.weight");
    auto bih0 = half("decoder.lstm.bias_ih_l0"), bhh0 = half("decoder.lstm.bias_hh_l0"), bih1 = half("decoder.lstm.bias_ih_l1"), bhh1 = half("decoder.lstm.bias_hh_l1");
    auto projB = half("decoder.decoder_projector.bias"), headB = half("joint.head.bias");
    const int durations[NDUR] = {0, 1, 2, 3, 4};
    m->tdt = api.tdt_create(V, E, H, NHEAD, NDUR, durations, BLANK, MAX_SYM, emb.q.data(), emb.s.data(), ih0.q.data(), ih0.s.data(), bih0.data(), hh0.q.data(), hh0.s.data(), bhh0.data(), ih1.q.data(), ih1.s.data(), bih1.data(), hh1.q.data(), hh1.s.data(), bhh1.data(), proj.q.data(), proj.s.data(), projB.data(), head.q.data(), head.s.data(), headB.data());
    if (!m->tdt) throw std::string("The speech engine refused the decoder.");

    m->projW = floats(need("encoder_projector.weight"));
    m->projB = floats(need("encoder_projector.bias"));
    return m;
  } catch (...) {
    delete m;
    throw;
  }
}

// ---------- the log-mel front end (HF ParakeetFeatureExtractor arithmetic) ----------

constexpr int NFFT = 512, HOP = 160, WIN = 400, BINS = NFFT / 2 + 1;
constexpr double PI = 3.14159265358979323846;

struct FrontEnd {
  std::vector<float> window = std::vector<float>(NFFT, 0.0f);  // symmetric Hann 400, centred in 512
  std::vector<float> mel = std::vector<float>(MELS * BINS, 0.0f);
  std::vector<float> cosT = std::vector<float>(NFFT / 2), sinT = std::vector<float>(NFFT / 2);
  std::vector<int> rev = std::vector<int>(NFFT);

  FrontEnd() {
    const int off = (NFFT - WIN) / 2;
    for (int i = 0; i < WIN; i++) window[off + i] = float(0.5 - 0.5 * std::cos(2.0 * PI * i / (WIN - 1)));
    for (int i = 0; i < NFFT / 2; i++) {
      cosT[i] = float(std::cos(2.0 * PI * i / NFFT));
      sinT[i] = float(-std::sin(2.0 * PI * i / NFFT));
    }
    for (int i = 0, bits = 9; i < NFFT; i++) {
      int r = 0;
      for (int b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    // librosa.filters.mel(sr=16000, n_fft=512, n_mels=128, fmin=0, fmax=8000, htk=False, norm="slaney")
    auto hzToMel = [](double f) {
      const double fsp = 200.0 / 3, minLogHz = 1000.0, minLogMel = minLogHz / fsp, logstep = std::log(6.4) / 27.0;
      return f >= minLogHz ? minLogMel + std::log(f / minLogHz) / logstep : f / fsp;
    };
    auto melToHz = [](double m) {
      const double fsp = 200.0 / 3, minLogHz = 1000.0, minLogMel = minLogHz / fsp, logstep = std::log(6.4) / 27.0;
      return m >= minLogMel ? minLogHz * std::exp(logstep * (m - minLogMel)) : fsp * m;
    };
    std::vector<double> pts(MELS + 2);
    const double lo = hzToMel(0.0), hi = hzToMel(8000.0);
    for (int i = 0; i < MELS + 2; i++) pts[i] = melToHz(lo + (hi - lo) * i / (MELS + 1));
    for (int m = 0; m < MELS; m++) {
      const double l = pts[m], c = pts[m + 1], r = pts[m + 2];
      const double enorm = 2.0 / (r - l);
      for (int k = 0; k < BINS; k++) {
        const double f = 8000.0 * k / (BINS - 1);
        const double up = (f - l) / (c - l), down = (r - f) / (r - c);
        const double w = std::max(0.0, std::min(up, down));
        mel[m * BINS + k] = float(w * enorm);
      }
    }
  }

  void fft(std::vector<float> &re, std::vector<float> &im) const {
    for (int i = 0; i < NFFT; i++)
      if (i < rev[i]) {
        std::swap(re[i], re[rev[i]]);
        std::swap(im[i], im[rev[i]]);
      }
    for (int len = 2; len <= NFFT; len <<= 1) {
      const int half = len / 2, step = NFFT / len;
      for (int i = 0; i < NFFT; i += len)
        for (int j = 0; j < half; j++) {
          const float wr = cosT[j * step], wi = sinT[j * step];
          const int a = i + j, b = a + half;
          const float tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
    }
  }

  // 16 kHz mono samples -> normalised log-mel [T][128], T = 1 + n / 160.
  std::vector<float> features(const float *x, int n, int &T) const {
    T = 1 + n / HOP;
    std::vector<float> y(n);
    for (int i = 0; i < n; i++) y[i] = i ? x[i] - 0.97f * x[i - 1] : x[0];
    std::vector<float> out(size_t(T) * MELS);
    std::vector<float> re(NFFT), im(NFFT), power(BINS);
    for (int t = 0; t < T; t++) {
      const int start = t * HOP - NFFT / 2;  // centred: 256 zeros of padding on each side
      for (int i = 0; i < NFFT; i++) {
        const int s = start + i;
        re[i] = (s >= 0 && s < n ? y[s] : 0.0f) * window[i];
        im[i] = 0.0f;
      }
      fft(re, im);
      for (int k = 0; k < BINS; k++) power[k] = re[k] * re[k] + im[k] * im[k];
      for (int m = 0; m < MELS; m++) {
        const float *w = &mel[m * BINS];
        double acc = 0.0;
        for (int k = 0; k < BINS; k++) acc += double(w[k]) * power[k];
        out[size_t(t) * MELS + m] = float(std::log(acc + 5.960464477539063e-08));  // 2^-24
      }
    }
    // Per-feature normalisation over the utterance: (x - mean) / (unbiased std + 1e-5).
    for (int m = 0; m < MELS; m++) {
      double sum = 0.0;
      for (int t = 0; t < T; t++) sum += out[size_t(t) * MELS + m];
      const double mean = sum / T;
      double sq = 0.0;
      for (int t = 0; t < T; t++) {
        const double d = out[size_t(t) * MELS + m] - mean;
        sq += d * d;
      }
      const double sd = std::sqrt(T > 1 ? sq / (T - 1) : 0.0) + 1e-5;
      for (int t = 0; t < T; t++) out[size_t(t) * MELS + m] = float((out[size_t(t) * MELS + m] - mean) / sd);
    }
    return out;
  }
};

const FrontEnd &frontEnd() {
  static const FrontEnd fe;
  return fe;
}

std::vector<int32_t> run(Model &m, const float *pcm, int n) {
  int T = 0;
  std::vector<float> mel = frontEnd().features(pcm, n, T);
  if (T < 8) return {};
  const int T8 = api.enc_out_len(m.enc, T);
  std::vector<float> enc(size_t(T8) * D);
  if (api.enc_forward(m.enc, mel.data(), T, enc.data()) != 0) throw std::string("The speech engine couldn't read this audio.");
  // Projector, fp32: encp[t][j] = sum_k enc[t][k] * W[j][k] + b[j].
  std::vector<float> encp(size_t(T8) * H);
  for (int t = 0; t < T8; t++) {
    const float *row = &enc[size_t(t) * D];
    for (int j = 0; j < H; j++) {
      const float *w = &m.projW[size_t(j) * D];
      float acc = 0.0f;
      for (int k = 0; k < D; k++) acc += row[k] * w[k];
      encp[size_t(t) * H + j] = acc + m.projB[j];
    }
  }
  const int cap = 12 * T8 + 64;
  std::vector<int32_t> ids(cap);
  const int got = api.tdt_decode(m.tdt, encp.data(), T8, ids.data(), cap);
  ids.resize(got > 0 ? got : 0);
  return ids;
}

void throwJava(JNIEnv *env, const std::string &message) {
  jclass cls = env->FindClass("java/lang/IllegalStateException");
  if (cls) env->ThrowNew(cls, message.c_str());
}

}  // namespace

extern "C" {

// Builds the model from model.fermion. names/kinds/shapes/offsets/sizes describe the container's records (from its index).
JNIEXPORT jlong JNICALL Java_expo_modules_phonon_PhononNative_load(JNIEnv *env, jclass, jstring jpath, jobjectArray jnames, jintArray jkinds, jintArray jdims, jlongArray jshapes, jlongArray joffsets, jlongArray jsizes, jint threads) {
  if (!loadEngine()) {
    throwJava(env, lastError);
    return 0;
  }
  const char *cpath = env->GetStringUTFChars(jpath, nullptr);
  std::string path(cpath);
  env->ReleaseStringUTFChars(jpath, cpath);

  Container c;
  const int fd = open(path.c_str(), O_RDONLY | O_CLOEXEC);
  struct stat st {};
  if (fd < 0 || fstat(fd, &st) != 0) {
    if (fd >= 0) close(fd);
    throwJava(env, "The speech model file couldn't be opened.");
    return 0;
  }
  c.size = size_t(st.st_size);
  c.map = mmap(nullptr, c.size, PROT_READ, MAP_PRIVATE, fd, 0);
  close(fd);
  if (c.map == MAP_FAILED) {
    throwJava(env, "The speech model file couldn't be read.");
    return 0;
  }

  const jsize count = env->GetArrayLength(jnames);
  std::vector<jint> kinds(count), dims(count);
  std::vector<jlong> offsets(count), sizes(count), shapes(env->GetArrayLength(jshapes));
  env->GetIntArrayRegion(jkinds, 0, count, kinds.data());
  env->GetIntArrayRegion(jdims, 0, count, dims.data());
  env->GetLongArrayRegion(joffsets, 0, count, offsets.data());
  env->GetLongArrayRegion(jsizes, 0, count, sizes.data());
  env->GetLongArrayRegion(jshapes, 0, jsize(shapes.size()), shapes.data());
  size_t shapeAt = 0;
  for (jsize i = 0; i < count; i++) {
    auto jname = static_cast<jstring>(env->GetObjectArrayElement(jnames, i));
    const char *cname = env->GetStringUTFChars(jname, nullptr);
    Record r;
    r.kind = Kind(kinds[i]);
    r.shape.assign(shapes.begin() + shapeAt, shapes.begin() + shapeAt + dims[i]);
    shapeAt += dims[i];
    r.data = static_cast<const uint8_t *>(c.map) + offsets[i];
    r.bytes = size_t(sizes[i]);
    if (size_t(offsets[i]) + r.bytes > c.size) {
      env->ReleaseStringUTFChars(jname, cname);
      throwJava(env, "The speech model file is damaged. Delete it and download it again.");
      return 0;
    }
    c.records.emplace(cname, r);
    env->ReleaseStringUTFChars(jname, cname);
    env->DeleteLocalRef(jname);
  }

  try {
    return reinterpret_cast<jlong>(build(c, threads));
  } catch (const std::string &why) {
    throwJava(env, why);
    return 0;
  }
}

// 16 kHz mono float samples (up to about 35 seconds) -> token ids.
JNIEXPORT jintArray JNICALL Java_expo_modules_phonon_PhononNative_transcribe(JNIEnv *env, jclass, jlong handle, jfloatArray jpcm) {
  auto *m = reinterpret_cast<Model *>(handle);
  if (!m) {
    throwJava(env, "The speech model isn't loaded.");
    return nullptr;
  }
  const jsize n = env->GetArrayLength(jpcm);
  std::vector<float> pcm(n);
  env->GetFloatArrayRegion(jpcm, 0, n, pcm.data());
  try {
    std::vector<int32_t> ids = run(*m, pcm.data(), int(n));
    jintArray out = env->NewIntArray(jsize(ids.size()));
    if (!ids.empty()) env->SetIntArrayRegion(out, 0, jsize(ids.size()), reinterpret_cast<const jint *>(ids.data()));
    return out;
  } catch (const std::string &why) {
    throwJava(env, why);
    return nullptr;
  }
}

JNIEXPORT void JNICALL Java_expo_modules_phonon_PhononNative_free(JNIEnv *, jclass, jlong handle) {
  delete reinterpret_cast<Model *>(handle);
}

}  // extern "C"
