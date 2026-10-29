package expo.modules.phonon

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.Build
import com.github.luben.zstd.ZstdInputStream
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** The C++ side (phonon_jni.cpp): builds the model from model.fermion and turns 16 kHz audio into token ids. */
internal object PhononNative {
  val loaded: Boolean = try {
    System.loadLibrary("aihatphonon")
    true
  } catch (e: Throwable) {
    false
  }

  @JvmStatic external fun load(path: String, names: Array<String>, kinds: IntArray, dims: IntArray, shapes: LongArray, offsets: LongArray, sizes: LongArray, threads: Int): Long
  @JvmStatic external fun transcribe(handle: Long, pcm: FloatArray): IntArray
  @JvmStatic external fun free(handle: Long)
}

class PhononException(message: String) : CodedException(message)

/**
 * Phonon-2 speech recognition on the device (English). The model download is unpacked here, built once into the
 * engine, and kept until the app lets it go.
 */
class PhononModule : Module() {
  private var handle = 0L
  private var vocab: Array<String> = emptyArray()
  private val lock = Any()

  override fun definition() = ModuleDefinition {
    Name("Phonon")

    Function("isSupported") {
      Build.VERSION.SDK_INT >= 26 && Build.SUPPORTED_64_BIT_ABIS.contains("arm64-v8a") && PhononNative.loaded
    }

    AsyncFunction("prepare") Coroutine { archive: String, dir: String ->
      withContext(Dispatchers.IO) { unpack(File(path(archive)), File(path(dir))) }
    }

    AsyncFunction("load") Coroutine { dir: String ->
      withContext(Dispatchers.Default) { loadModel(File(path(dir))) }
    }

    AsyncFunction("transcribeFile") Coroutine { uri: String ->
      withContext(Dispatchers.Default) { transcribeFile(path(uri)) }
    }

    Function("unload") { release() }

    OnDestroy { release() }
  }

  private fun path(uri: String): String = if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri else uri

  private fun release() = synchronized(lock) {
    if (handle != 0L) PhononNative.free(handle)
    handle = 0L
  }

  // ---------- unpacking the download ----------

  private val wanted = setOf("bps_manifest.json", "config.json", "model.fermion")

  private fun readFully(input: InputStream, buf: ByteArray): Boolean {
    var got = 0
    while (got < buf.size) {
      val n = input.read(buf, got, buf.size - got)
      if (n < 0) {
        if (got == 0) return false
        throw PhononException("The download ended early. Delete it and download again.")
      }
      got += n
    }
    return true
  }

  private fun skip(input: InputStream, count: Long) {
    var left = count
    val buf = ByteArray(64 * 1024)
    while (left > 0) {
      val n = input.read(buf, 0, min(buf.size.toLong(), left).toInt())
      if (n < 0) throw PhononException("The download ended early. Delete it and download again.")
      left -= n
    }
  }

  /** The release archive is a tar compressed with zstd: bps_manifest.json, config.json and model.fermion, stored as they are. */
  private fun unpack(archive: File, dir: File) {
    if (!archive.exists()) throw PhononException("The download is missing.")
    dir.mkdirs()
    val sums = mutableMapOf<String, String>()
    ZstdInputStream(BufferedInputStream(FileInputStream(archive), 1 shl 16)).use { zin ->
      val header = ByteArray(512)
      while (readFully(zin, header)) {
        if (header.all { it == 0.toByte() }) break
        val name = String(header, 0, 100, Charsets.US_ASCII).substringBefore('\u0000').substringAfterLast('/')
        val sizeField = String(header, 124, 12, Charsets.US_ASCII).substringBefore('\u0000').trim()
        val size = if (sizeField.isEmpty()) 0L else sizeField.toLong(8)
        val type = header[156].toInt().toChar()
        val padding = (512 - size % 512) % 512
        if ((type == '0' || type == '\u0000') && name in wanted) {
          val digest = MessageDigest.getInstance("SHA-256")
          val part = File(dir, "$name.part")
          FileOutputStream(part).use { out ->
            var left = size
            val buf = ByteArray(1 shl 16)
            while (left > 0) {
              val n = zin.read(buf, 0, min(buf.size.toLong(), left).toInt())
              if (n < 0) throw PhononException("The download ended early. Delete it and download again.")
              out.write(buf, 0, n)
              digest.update(buf, 0, n)
              left -= n
            }
          }
          sums[name] = digest.digest().joinToString("") { "%02x".format(it) }
          part.renameTo(File(dir, name))
        } else {
          skip(zin, size)
        }
        skip(zin, padding)
      }
    }
    // The manifest lists each file's SHA-256: a damaged download is refused before the engine reads it.
    val manifest = JSONObject(File(dir, "bps_manifest.json").readText())
    val files = manifest.getJSONArray("files")
    for (i in 0 until files.length()) {
      val f = files.getJSONObject(i)
      val name = f.getString("path")
      if (name in wanted && sums[name] != null && sums[name] != f.getString("original_sha256")) {
        File(dir, name).delete()
        throw PhononException("The download is damaged ($name). Delete it and download again.")
      }
    }
    if (!File(dir, "model.fermion").exists() || !File(dir, "config.json").exists()) throw PhononException("The download doesn't contain the model.")
    archive.delete()
  }

  // ---------- the model ----------

  private fun loadModel(dir: File) = synchronized(lock) {
    if (handle != 0L) return@synchronized
    if (!PhononNative.loaded) throw PhononException("Phonon-2 isn't part of this build of the app.")
    val config = JSONObject(File(dir, "config.json").readText())
    val words = config.optJSONObject("joint")?.optJSONArray("vocabulary") ?: config.getJSONArray("labels")
    vocab = Array(words.length()) { words.getString(it) }

    val model = File(dir, "model.fermion")
    RandomAccessFile(model, "r").use { raf ->
      val len = ByteArray(8)
      raf.readFully(len)
      val n = ByteBuffer.wrap(len).order(ByteOrder.LITTLE_ENDIAN).long
      if (n <= 0 || n > 16L shl 20) throw PhononException("The speech model file is damaged. Delete it and download it again.")
      val head = ByteArray(n.toInt())
      raf.readFully(head)
      val index = JSONObject(String(head, Charsets.UTF_8)).getJSONArray("index")
      val count = index.length()
      val names = Array(count) { "" }
      val kinds = IntArray(count)
      val dims = IntArray(count)
      val offsets = LongArray(count)
      val sizes = LongArray(count)
      val shapes = ArrayList<Long>()
      var offset = 8 + n
      for (i in 0 until count) {
        val e = index.getJSONObject(i)
        names[i] = e.getString("n")
        kinds[i] = when (e.getString("k")) {
          "five_value" -> 0
          "int6" -> 1
          "fp16" -> 2
          else -> throw PhononException("This speech model uses a format the app doesn't know (${e.getString("k")}).")
        }
        val shape = e.getJSONArray("shape")
        dims[i] = shape.length()
        for (d in 0 until shape.length()) shapes.add(shape.getLong(d))
        offsets[i] = offset
        sizes[i] = e.getLong("b")
        offset += sizes[i]
      }
      val threads = max(1, min(4, Runtime.getRuntime().availableProcessors()))
      handle = PhononNative.load(model.absolutePath, names, kinds, dims, shapes.toLongArray(), offsets, sizes, threads)
    }
  }

  private fun text(ids: IntArray): String {
    val sb = StringBuilder()
    for (id in ids) {
      if (id < 0 || id >= vocab.size) continue
      val piece = vocab[id]
      if (piece == "<unk>" || piece == "<pad>" || (piece.startsWith("<|") && piece.endsWith("|>"))) continue
      sb.append(piece)
    }
    return sb.toString().replace('▁', ' ').replace(Regex("\\s+"), " ").trim()
  }

  // ---------- audio ----------

  /** Any audio file Android can read, as 16 kHz mono samples in [-1, 1]. */
  private fun decode(path: String): FloatArray {
    val ex = MediaExtractor()
    ex.setDataSource(path)
    var track = -1
    for (i in 0 until ex.trackCount) {
      if (ex.getTrackFormat(i).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
        track = i
        break
      }
    }
    if (track < 0) throw PhononException("This recording has no sound.")
    ex.selectTrack(track)
    val format = ex.getTrackFormat(track)
    var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
    codec.configure(format, null, null, 0)
    codec.start()
    val samples = ArrayList<Float>()
    val info = MediaCodec.BufferInfo()
    var inputDone = false
    var outputDone = false
    try {
      while (!outputDone) {
        if (!inputDone) {
          val i = codec.dequeueInputBuffer(10_000)
          if (i >= 0) {
            val buf = codec.getInputBuffer(i)!!
            val n = ex.readSampleData(buf, 0)
            if (n < 0) {
              codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(i, 0, n, ex.sampleTime, 0)
              ex.advance()
            }
          }
        }
        val o = codec.dequeueOutputBuffer(info, 10_000)
        if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          val f = codec.outputFormat
          rate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        } else if (o >= 0) {
          val out = codec.getOutputBuffer(o)!!.order(ByteOrder.nativeOrder())
          out.position(info.offset)
          out.limit(info.offset + info.size)
          val pcm = out.asShortBuffer()
          val frames = pcm.remaining() / channels
          for (f in 0 until frames) {
            var sum = 0f
            for (c in 0 until channels) sum += pcm.get(f * channels + c) / 32768f
            samples.add(sum / channels)
          }
          codec.releaseOutputBuffer(o, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
        }
      }
    } finally {
      codec.stop()
      codec.release()
      ex.release()
    }
    val mono = samples.toFloatArray()
    if (rate == 16000) return mono
    // Linear resampling to 16 kHz (recordings for dictation are already made at 16 kHz).
    val outLen = (mono.size.toLong() * 16000 / rate).toInt()
    return FloatArray(outLen) { i ->
      val pos = i.toDouble() * rate / 16000
      val j = pos.toInt()
      val frac = (pos - j).toFloat()
      val a = mono[min(j, mono.size - 1)]
      val b = mono[min(j + 1, mono.size - 1)]
      a + (b - a) * frac
    }
  }

  /**
   * Long recordings are decoded in windows of up to 35 seconds, cut at the quietest moment between 25 and 35 seconds
   * (the engine's own rule for long audio).
   */
  private fun windows(pcm: FloatArray): List<Pair<Int, Int>> {
    val rate = 16000
    val block = rate / 20
    if (pcm.size <= 35 * rate) return listOf(0 to pcm.size)
    val out = ArrayList<Pair<Int, Int>>()
    var start = 0
    while (pcm.size - start > 35 * rate) {
      var best = start + 30 * rate
      var bestRms = Float.MAX_VALUE
      var at = start + 25 * rate
      while (at + block <= start + 35 * rate) {
        var sq = 0f
        for (k in at until at + block) sq += pcm[k] * pcm[k]
        val rms = sqrt(sq / block)
        if (rms < bestRms) {
          bestRms = rms
          best = at + block / 2
        }
        at += block
      }
      out.add(start to best)
      start = best
    }
    out.add(start to pcm.size)
    return out
  }

  private fun transcribeFile(path: String): String {
    val h = synchronized(lock) { handle }
    if (h == 0L) throw PhononException("The speech model isn't loaded.")
    val pcm = decode(path)
    val parts = windows(pcm).map { (a, b) -> text(PhononNative.transcribe(h, pcm.copyOfRange(a, b))) }
    return parts.filter { it.isNotEmpty() }.joinToString(" ")
  }
}
