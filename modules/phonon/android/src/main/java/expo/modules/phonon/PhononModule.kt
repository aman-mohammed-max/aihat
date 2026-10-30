package expo.modules.phonon

import android.app.ActivityManager
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
private const val MIN_TOTAL = 3L shl 30
private const val MIN_FREE = 1L shl 30
private const val MAX_METADATA_BYTES = 1L shl 20

internal class ProgressThrottle(private val total: Long) {
  private val step = max(1L, total / 100)
  private var lastReported = 0L

  init {
    require(total >= 0)
  }

  fun shouldReport(written: Long): Boolean {
    val progress = written.coerceIn(0, total)
    if (progress < total && progress - lastReported < step) return false
    lastReported = progress
    return true
  }
}

class PhononModule : Module() {
  private var handle = 0L
  private var vocab: Array<String> = emptyArray()
  @Volatile private var prepareGeneration = 0L
  @Volatile private var cancelledGeneration = -1L
  private val prepareLock = Any()
  private val lock = Any()

  override fun definition() = ModuleDefinition {
    Name("Phonon")
    Events("onPrepareProgress")

    Function("isSupported") {
      Build.VERSION.SDK_INT >= 26 && Build.SUPPORTED_64_BIT_ABIS.contains("arm64-v8a") && PhononNative.loaded && memory().totalMem >= MIN_TOTAL
    }

    AsyncFunction("prepare") Coroutine { archive: String, dir: String ->
      val generation = synchronized(this@PhononModule) { ++prepareGeneration }
      withContext(Dispatchers.IO) {
        synchronized(prepareLock) {
          checkPrepareCancellation(generation)
          unpack(File(path(archive)), File(path(dir)), generation)
        }
      }
    }

    Function("cancelPrepare") {
      synchronized(this@PhononModule) { cancelledGeneration = prepareGeneration }
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

  private fun memory() = ActivityManager.MemoryInfo().also { info ->
    appContext.reactContext?.getSystemService(ActivityManager::class.java)?.getMemoryInfo(info)
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

  private fun skip(input: InputStream, count: Long, generation: Long?) {
    var left = count
    val buf = ByteArray(64 * 1024)
    while (left > 0) {
      checkPrepareCancellation(generation)
      val n = input.read(buf, 0, min(buf.size.toLong(), left).toInt())
      if (n < 0) throw PhononException("The download ended early. Delete it and download again.")
      left -= n
    }
  }

  /** The release archive is a tar compressed with zstd: bps_manifest.json, config.json and model.fermion, stored as they are. */
  internal fun unpack(
    archive: File,
    dir: File,
    generation: Long? = null,
    emitProgress: Boolean = true,
    availableSpaceOverride: Long? = null,
  ) {
    if (!archive.exists()) throw PhononException("The download is missing.")
    val parent = dir.absoluteFile.parentFile ?: throw PhononException("The model folder is invalid.")
    if (!parent.exists() && !parent.mkdirs()) throw PhononException("Could not create the model folder.")
    val staging = File(parent, "${dir.name}.installing")
    val backup = File(parent, "${dir.name}.previous")
    if (!dir.exists() && backup.exists() && !backup.renameTo(dir)) {
      throw PhononException("Could not restore the existing model. Free storage and try again.")
    }
    staging.deleteRecursively()
    if (!staging.mkdirs()) throw PhononException("Could not prepare a temporary model folder.")
    val sums = mutableMapOf<String, String>()
    try {
      ZstdInputStream(BufferedInputStream(FileInputStream(archive), 1 shl 16)).use { zin ->
        val header = ByteArray(512)
        var ended = false
        while (readFully(zin, header)) {
          checkPrepareCancellation(generation)
          if (header.all { it == 0.toByte() }) {
            val endMarker = ByteArray(512)
            if (!readFully(zin, endMarker) || endMarker.any { it != 0.toByte() }) {
              throw PhononException("The model archive is incomplete.")
            }
            ended = true
            break
          }
          verifyTarHeader(header)
          val path = String(header, 0, 100, Charsets.US_ASCII).substringBefore('\u0000')
          if (path.startsWith('/') || path.contains('\\') || path.split('/').any { it == ".." }) {
            throw PhononException("The model archive contains an unsafe path.")
          }
          // Common tar writers prefix every member with ./; normalize that harmless form before matching.
          val name = path.split('/').filter { it.isNotEmpty() && it != "." }.joinToString("/")
          val sizeField = String(header, 124, 12, Charsets.US_ASCII).substringBefore('\u0000').trim()
          val size = if (sizeField.isEmpty()) 0L else sizeField.toLongOrNull(8)
            ?: throw PhononException("The model archive contains an invalid file size.")
          if (size < 0) throw PhononException("The model archive contains an invalid file size.")
          if (name == "bps_manifest.json" || name == "config.json") {
            if (size > MAX_METADATA_BYTES) throw PhononException("The model archive metadata is too large to read safely.")
          }
          if (name == "model.fermion") {
            val reserve = 16L shl 20
            if (size > Long.MAX_VALUE - reserve) throw PhononException("The model archive contains an invalid file size.")
            val free = availableSpaceOverride ?: parent.usableSpace
            if (free >= 0 && free < size + reserve) {
              throw PhononException("There isn’t enough free storage to extract the speech model.")
            }
          }
          val type = header[156].toInt().toChar()
          if (type == '1' || type == '2') throw PhononException("The model archive contains a link, which is not allowed.")
          val padding = (512 - size % 512) % 512
          if ((type == '0' || type == '\u0000') && name in wanted) {
            if (sums.containsKey(name)) throw PhononException("The model archive contains a duplicate $name file.")
            val digest = MessageDigest.getInstance("SHA-256")
            val part = File(staging, "$name.part")
            val progress = if (name == "model.fermion") ProgressThrottle(size) else null
            FileOutputStream(part).use { out ->
              var left = size
              var written = 0L
              val buf = ByteArray(1 shl 16)
              while (left > 0) {
                checkPrepareCancellation(generation)
                val n = zin.read(buf, 0, min(buf.size.toLong(), left).toInt())
                if (n < 0) throw PhononException("The download ended early. Delete it and download again.")
                out.write(buf, 0, n)
                digest.update(buf, 0, n)
                left -= n
                written += n
                if (emitProgress && progress?.shouldReport(written) == true) {
                  sendEvent("onPrepareProgress", mapOf("file" to name, "written" to written, "total" to size))
                }
              }
            }
            val finalFile = File(staging, name)
            if (!part.renameTo(finalFile)) throw PhononException("Could not finish extracting $name.")
            sums[name] = digest.digest().joinToString("") { "%02x".format(it) }
          } else {
            skip(zin, size, generation)
          }
          skip(zin, padding, generation)
        }
        if (!ended) throw PhononException("The model archive is incomplete.")
      }
      // Require every expected model file and its published digest before exposing the install.
      if (sums.keys != wanted) throw PhononException("The download doesn't contain every required model file.")
      val manifest = JSONObject(File(staging, "bps_manifest.json").readText())
      val expected = mutableMapOf<String, String>()
      val files = manifest.getJSONArray("files")
      for (i in 0 until files.length()) {
        val f = files.getJSONObject(i)
        val name = f.optString("path")
        if (name in wanted) expected[name] = f.optString("original_sha256")
      }
      for (name in wanted - setOf("bps_manifest.json")) {
        val hash = expected[name]
        if (hash == null || !hash.matches(Regex("[0-9a-fA-F]{64}")) || sums[name] != hash.lowercase()) {
          throw PhononException("The download is damaged or unverifiable ($name). Delete it and download again.")
        }
      }
      val config = JSONObject(File(staging, "config.json").readText())
      if (!config.has("joint") && !config.has("labels")) throw PhononException("The model configuration is invalid.")
      if (!File(staging, "model.fermion").isFile || File(staging, "model.fermion").length() == 0L) {
        throw PhononException("The download doesn't contain a usable model.")
      }

      backup.deleteRecursively()
      checkPrepareCancellation(generation)
      val hadPrevious = dir.exists()
      if (hadPrevious && !dir.renameTo(backup)) throw PhononException("Could not preserve the existing model.")
      if (!staging.renameTo(dir)) {
        if (hadPrevious) backup.renameTo(dir)
        throw PhononException("Could not install the verified model.")
      }
      backup.deleteRecursively()
      // Keep the verified install even if best-effort cleanup is blocked by the filesystem.
      archive.delete()
    } catch (e: PhononException) {
      throw e
    } catch (_: Exception) {
      throw PhononException("The model archive is damaged or could not be extracted. Keep the download and try again.")
    } finally {
      staging.deleteRecursively()
      if (backup.exists() && !dir.exists()) backup.renameTo(dir)
    }
  }

  internal fun unpackForTest(archive: File, dir: File, availableSpace: Long? = null) =
    unpack(archive, dir, generation = null, emitProgress = false, availableSpaceOverride = availableSpace)

  private fun checkPrepareCancellation(generation: Long?) {
    if (generation != null && (cancelledGeneration == generation || prepareGeneration != generation)) {
      throw PhononException("Model installation was cancelled. The downloaded archive is safe to retry.")
    }
  }

  /** Reject damaged tar headers before trusting entry names or sizes. */
  private fun verifyTarHeader(header: ByteArray) {
    val field = String(header, 148, 8, Charsets.US_ASCII).trim('\u0000', ' ')
    val expected = field.toLongOrNull(8) ?: throw PhononException("The model archive has a damaged header.")
    val actual = header.indices.sumOf { if (it in 148..155) 32L else header[it].toLong() and 0xff }
    if (actual != expected) throw PhononException("The model archive has a damaged header.")
  }

  // ---------- the model ----------

  private fun loadModel(dir: File) = synchronized(lock) {
    if (handle != 0L) return@synchronized
    if (!PhononNative.loaded) throw PhononException("Phonon-2 isn't part of this build of the app.")
    // The engine holds about 0.7 GB once built and ends the whole app if an allocation fails, so it only starts with
    // room to spare.
    val mem = memory()
    if (mem.totalMem in 1 until MIN_TOTAL) throw PhononException("Phonon-2 needs a phone or tablet with at least 3 GB of memory.")
    if (mem.availMem in 1 until MIN_FREE) throw PhononException("Not enough free memory to start Phonon-2 (it needs about 1 GB). Close some other apps and try again.")
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
