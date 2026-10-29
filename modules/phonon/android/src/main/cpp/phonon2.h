/* phonon2.h -- the C entry points of the Phonon-2 CPU engine libraries (binary distribution).
 *
 * Two shared objects, loaded with dlopen() / System.load():
 *   libphonon2_enc-<platform>.so   the packed int8 GEMM + the whole FastConformer encoder  (ABI: cpu 1, enc 1)
 *   libphonon2_tdt-<platform>.so   the greedy TDT decode loop (prediction network + joint)  (ABI: tdt 3)
 * Android arm64-v8a ships each in two ISA tiers; see docs/android.md for the tier choice and the call sequence.
 *
 * Conventions: every handle is an opaque void*; every function that returns an int returns 0 on success and a negative
 * value on a refused call; every create function returns NULL when it refuses (a short reason goes to stderr/logcat).
 * All matrices are row-major and tightly packed.  fp16 means IEEE binary16 passed as uint16_t.  Pointers passed to a
 * create/set call are copied by the library unless the comment says otherwise.  The libraries are not re-entrant: one
 * decode at a time per process (the thread pools and GEMM scratch are process-global).
 */
#ifndef PHONON2_H
#define PHONON2_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

/* ------------------------------------------------------------------ versions, host features, threads (libphonon2_enc) */
int      phonon2_cpu_abi_version(void);                 /* 1 */
int      phonon2_enc_abi_version(void);                 /* 1 */
int      phonon2_tdt_abi_version(void);                 /* 3 (libphonon2_tdt) */

/* CPU feature bits (the same bits on every platform): */
enum { PHONON2_F_NEON = 1u << 0, PHONON2_F_DOTPROD = 1u << 1, PHONON2_F_I8MM = 1u << 2, PHONON2_F_SVE = 1u << 3, PHONON2_F_LSE = 1u << 4 };
unsigned phonon2_cpu_features(void);                    /* what this processor provides (aarch64: getauxval AT_HWCAP/AT_HWCAP2) */
unsigned phonon2_cpu_build_features(void);              /* what this binary assumes everywhere; must be a subset of the above  */
int      phonon2_cpu_kernel_in_use(void);               /* 1 scalar, 2 NEON dotprod, 5 NEON i8mm, 8 NEON armv8.0 (the -base tier) */
void     phonon2_cpu_set_kernel(int k);                 /* force a kernel id (tests); 0 = the dispatcher's choice */
void     phonon2_cpu_set_threads(int n);                /* encoder/GEMM pool, 1..64; call before the first forward            */
void     phonon2_cpu_set_spin_iters(int n);             /* pool spin before sleeping (tuning; the default is fine)            */

/* ------------------------------------------------------------------ packed matrices (libphonon2_enc) */
/* A packed matrix is one five-value `.fermion` container record, [rows][cols] with cols % 64 == 0.
 * phonon2_cpu_create_onedot_wire builds it straight from the record's bytes (the blob between the container's index and the
 * next record: base-3 trit bytes, the hi/lo bitmask, then lo and hi fp16 row scales), re-quantised to the int8 layout of
 * this processor's kernel.  The blob is NOT retained: free or unmap it after the call.  Returns NULL on a malformed blob or
 * a length mismatch.  The "_many" form builds n records in one call (out[i] = handle or NULL) and returns the count built. */
void    *phonon2_cpu_create_onedot_wire(int rows, int cols, const uint8_t *blob, size_t len);
int      phonon2_cpu_create_onedot_wire_many(int n, const int *rows, const int *cols, const uint8_t *const *blobs, const size_t *lens, void **out);
/* The same matrix from the two 2-bit planes (4 codes per byte) + fp16 row scales, as the Python loader packs them;
 * create(copy_planes=0) keeps pointers to the planes until destroy, create_onedot copies nothing and retains nothing. */
void    *phonon2_cpu_create(int rows, int cols, const uint8_t *plane_a, const uint8_t *plane_b, const uint16_t *lo_f16, const uint16_t *hi_f16, int copy_planes);
float    phonon2_cpu_enable_onedot(void *m);            /* after create(): switch to the shipped one-dot int8 mode             */
void    *phonon2_cpu_create_onedot(int rows, int cols, const uint8_t *plane_a, const uint8_t *plane_b, const uint16_t *lo_f16, const uint16_t *hi_f16);
void     phonon2_cpu_set_onedot(void *m, int on);
/* A dense fp32 matrix [rows][cols] (cols % 4 == 0, else NULL) as a per-row symmetric int8 matrix on the same kernel (e.g. a projector). */
void    *phonon2_cpu_create_int8(int rows, int cols, const float *w);
void     phonon2_cpu_destroy(void *m);
void     phonon2_cpu_dequant_row(void *m, int n, float *out);   /* row n as fp32 (zeros for matrices built without planes) */
/* y[M][rows] = x[M][cols] . W^T on the int8 kernel (per-token activation quantisation inside); ldy = row length of y.  0; -1 on NULL. */
int      phonon2_cpu_gemm(void *m, const float *x, int M, float *y, int ldy);
/* Pre-quantised activations, reused across several matrices of the same input (what the encoder does internally). */
void    *phonon2_cpu_quantize(const float *x, int M, int K);
void     phonon2_cpu_quantized_free(void *q);
int      phonon2_cpu_gemm_q(void *m, void *q, float *y, int ldy);
int      phonon2_cpu_gemm_q_t(void *m, void *q, float *yT, int ldy);            /* transposed output yT[rows][M]            */
int      phonon2_cpu_gemm_q_acc(void *m, void *q, float *y, int ldy, float scale);   /* y += scale * (x W^T)                */

/* ------------------------------------------------------------------ encoder (libphonon2_enc) */
/* Phonon-2: L = 24, d = 1024, ff = 4096, H = 8 heads, conv_k = 9, n_mels = 128, sub_ch = 256 (from config.json). */
void    *phonon2_enc_create(int L, int d, int ff, int H, int conv_k, int n_mels, int sub_ch);
void     phonon2_enc_destroy(void *e);                  /* frees the encoder's own copies, NOT the layer matrices passed to set_layer */
/* Subsampling stack, fp32, in the HF ParakeetForTDT layout:
 *   c0_w [sub_ch][1][3][3]  c0_b [sub_ch]          (conv 3x3 stride 2 on the mel image, 1 -> sub_ch channels)
 *   dw1_w [sub_ch][1][3][3] dw1_b [sub_ch]         (depthwise 3x3 stride 2)      pw1_w [sub_ch][sub_ch] pw1_b [sub_ch] (pointwise)
 *   dw2_w [sub_ch][1][3][3] dw2_b [sub_ch]         (depthwise 3x3 stride 2)      pw2_w [sub_ch][sub_ch] pw2_b [sub_ch]
 *   lin_w [d][sub_ch * n_mels/8] lin_b [d]         (the linear after flattening [T/8][sub_ch][n_mels/8])
 *   inv_freq [d/2] = 1 / 10000^(2i/d), i = 0..d/2-1, computed in fp32 (relative position encoding).
 * Returns 0; -1 on a NULL handle; -2 when a matrix could not be built. */
int      phonon2_enc_set_subsampling(void *e, const float *c0_w, const float *c0_b, const float *dw1_w, const float *dw1_b,
                                     const float *pw1_w, const float *pw1_b, const float *dw2_w, const float *dw2_b,
                                     const float *pw2_w, const float *pw2_b, const float *lin_w, const float *lin_b, const float *inv_freq);
/* Layer l (0..L-1): returns 0; -1 on a NULL handle or l outside 0..L-1.  mats[11] = packed matrix handles (NOT copied; keep them
 * alive until phonon2_enc_destroy), in this order
 * (HF names under encoder.layers.<l>.):
 *   0 feed_forward1.linear1 [ff][d]   1 feed_forward1.linear2 [d][ff]   2 self_attn.q_proj [d][d]   3 self_attn.k_proj [d][d]
 *   4 self_attn.v_proj [d][d]         5 self_attn.o_proj [d][d]         6 self_attn.relative_k_proj [d][d]
 *   7 conv.pointwise_conv1 [2d][d]    8 conv.pointwise_conv2 [d][d]     9 feed_forward2.linear1 [ff][d]   10 feed_forward2.linear2 [d][ff]
 * vecs[17] = fp32 vectors (copied), in this order:
 *   0 norm_feed_forward1.weight [d]  1 norm_feed_forward1.bias [d]  2 norm_self_att.weight  3 norm_self_att.bias  4 norm_conv.weight
 *   5 norm_conv.bias  6 norm_feed_forward2.weight  7 norm_feed_forward2.bias  8 norm_out.weight  9 norm_out.bias
 *   10 self_attn.bias_u [d]  11 self_attn.bias_v [d]  12 conv.depthwise_conv.weight [d][conv_k]
 *   13 conv.norm.weight [d]  14 conv.norm.bias [d]  15 conv.norm.running_mean [d]  16 conv.norm.running_var [d]  (BatchNorm, eps 1e-5) */
int      phonon2_enc_set_layer(void *e, int l, void **mats, const float **vecs);
/* Output frames for T mel frames: three times (n-1)/2+1, i.e. ceil(T/8) for the shipped model. */
int      phonon2_enc_out_len(void *e, int T);
/* mel [T][n_mels] fp32 (log-mel, normalised; see docs/android.md) -> out [out_len][d] fp32.  Returns 0; -1 on a NULL handle or
 * T < 8; -2 when the scratch buffer for this T could not be allocated.  One utterance per call, no padding, no batch.  Calls are
 * serialised by the caller. */
int      phonon2_enc_forward(void *e, const float *mel, int T, float *out);

/* ------------------------------------------------------------------ greedy TDT loop (libphonon2_tdt) */
void     phonon2_tdt_set_threads(int n);                /* 1..32; its own pool, separate from the encoder's */
/* V = vocabulary size incl. blank (8193), E = embedding width (640), H = LSTM/joint width (640), nhead = V + ndur (8198),
 * durations[ndur] = {0,1,2,3,4}, blank = 8192, max_sym = 10.  E and H must be multiples of 64.
 * Tables are per-row-scaled int8: q [rows][cols] int8 + s [rows] fp16 scales; biases b [rows] fp16.
 *   emb  [V][E]      ih0 [4H][E] bih0 [4H]   hh0 [4H][H] bhh0 [4H]     (LSTM layer 0, gate order i,f,g,o)
 *                    ih1 [4H][H] bih1 [4H]   hh1 [4H][H] bhh1 [4H]     (LSTM layer 1)
 *   proj [H][H] proj_b [H]   (decoder_projector)      head [nhead][H] head_b [nhead]   (joint.head: V token scores + ndur duration scores)
 * All arrays are copied.  Returns NULL when E or H is not a multiple of 64 or the binary's ISA tier exceeds the host's. */
void    *phonon2_tdt_create(int V, int E, int H, int nhead, int ndur, const int *durations, int blank, int max_sym,
                            const int8_t *emb_q, const uint16_t *emb_s,
                            const int8_t *ih0_q, const uint16_t *ih0_s, const uint16_t *bih0, const int8_t *hh0_q, const uint16_t *hh0_s, const uint16_t *bhh0,
                            const int8_t *ih1_q, const uint16_t *ih1_s, const uint16_t *bih1, const int8_t *hh1_q, const uint16_t *hh1_s, const uint16_t *bhh1,
                            const int8_t *proj_q, const uint16_t *proj_s, const uint16_t *proj_b,
                            const int8_t *head_q, const uint16_t *head_s, const uint16_t *head_b);
void     phonon2_tdt_destroy(void *t);
/* encp [T][H] fp32 = the encoder output after the encoder_projector (d -> H, fp32 linear + bias; the app applies it).
 * Writes up to max_out token ids (blank never emitted) and returns the count; out_fr[i] = encoder frame the token was emitted
 * at (80 ms per frame), out_du[i] = the duration the head predicted (0..4 frames).  out_fr / out_du may be NULL.
 * A buffer of 12 * T + 64 entries is always enough.  State is reset per call; calls are serialised by the caller.  The handle must
 * be one phonon2_tdt_create returned (the decode calls are not NULL-checked). */
int      phonon2_tdt_decode_timed(void *t, const float *encp, int T, int32_t *out, int32_t *out_fr, int32_t *out_du, int max_out);
int      phonon2_tdt_decode(void *t, const float *encp, int T, int32_t *out, int max_out);   /* the same loop, timings discarded */
/* Hotword bias (optional, ABI 3): arms the loop with the automaton tables of the pip package's hotwords module; table == NULL
 * or lam <= 0 disarms.  The arrays are NOT copied: keep them alive while armed.  Returns 0, -1 on bad shapes. */
int      phonon2_tdt_set_bias(void *t, int S, int K, const int32_t *table, const int32_t *toks, const int32_t *col, int ncol, const int32_t *depth, float lam);

#ifdef __cplusplus
}
#endif
#endif /* PHONON2_H */
