package expo.modules.crashlog

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.InputStream
import java.io.PrintWriter
import java.io.Reader
import java.io.Writer
import java.io.File

internal object CrashLogIO {
  const val MAX_REPORT_CHARS = 6000
  const val MAX_TOMBSTONE_BYTES = 256 * 1024

  fun readText(reader: Reader, maxChars: Int): String {
    require(maxChars >= 0)
    val result = StringBuilder(minOf(maxChars, 1024))
    val buffer = CharArray(2048)
    while (result.length < maxChars) {
      val count = reader.read(buffer, 0, minOf(buffer.size, maxChars - result.length))
      if (count < 0) break
      if (count == 0) {
        val char = reader.read()
        if (char < 0) break
        result.append(char.toChar())
        continue
      }
      result.append(buffer, 0, count)
    }
    return result.toString()
  }

  fun readBytes(input: InputStream, maxBytes: Int): ByteArray {
    require(maxBytes >= 0)
    val result = java.io.ByteArrayOutputStream(minOf(maxBytes, 8192))
    val buffer = ByteArray(8192)
    while (result.size() < maxBytes) {
      val count = input.read(buffer, 0, minOf(buffer.size, maxBytes - result.size()))
      if (count < 0) break
      if (count == 0) {
        val byte = input.read()
        if (byte < 0) break
        result.write(byte)
        continue
      }
      result.write(buffer, 0, count)
    }
    return result.toByteArray()
  }

  fun stackTrace(error: Throwable): String {
    val bounded = BoundedStringWriter(MAX_REPORT_CHARS)
    PrintWriter(bounded).use { error.printStackTrace(it) }
    return bounded.toString()
  }
}

private class BoundedStringWriter(private val limit: Int) : Writer() {
  private val value = StringBuilder(minOf(limit, 1024))

  override fun write(str: String, offset: Int, length: Int) {
    val count = minOf(length, limit - value.length)
    if (count > 0) value.append(str, offset, offset + count)
  }

  override fun write(buffer: CharArray, offset: Int, length: Int) {
    val count = minOf(length, limit - value.length)
    if (count > 0) value.append(buffer, offset, count)
  }

  override fun flush() = Unit
  override fun close() = Unit

  override fun toString() = value.toString()
}

/**
 * Keeps the reason the app last closed unexpectedly: a Java crash (with its stack, written by an uncaught-exception
 * handler), or, from Android 11, the system's own record of a native crash, an out-of-memory kill or a freeze.
 */
class CrashLogModule : Module() {
  companion object {
    @Volatile private var installed = false
  }

  private fun file(ctx: Context) = File(ctx.filesDir, "last-crash.txt")

  override fun definition() = ModuleDefinition {
    Name("CrashLog")

    OnCreate {
      val ctx = appContext.reactContext?.applicationContext ?: return@OnCreate
      if (installed) return@OnCreate
      installed = true
      val previous = Thread.getDefaultUncaughtExceptionHandler()
      Thread.setDefaultUncaughtExceptionHandler { thread, error ->
        try {
          val metadata = "${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}\nThread: ${thread.name.take(256)}\n"
          file(ctx).writeText(metadata + CrashLogIO.stackTrace(error).take(CrashLogIO.MAX_REPORT_CHARS - metadata.length))
        } catch (_: Throwable) {
        }
        previous?.uncaughtException(thread, error)
      }
    }

    Function("take") { take() }
  }

  private fun take(): String? {
    val ctx = appContext.reactContext?.applicationContext ?: return null
    val saved = file(ctx)
    val prefs = ctx.getSharedPreferences("aihat-crashlog", Context.MODE_PRIVATE)
    var report: String? = null
    if (saved.exists()) {
      report = saved.bufferedReader().use { CrashLogIO.readText(it, CrashLogIO.MAX_REPORT_CHARS) }
      saved.delete()
    }
    if (Build.VERSION.SDK_INT < 30) return report
    val am = ctx.getSystemService(ActivityManager::class.java) ?: return report
    val last = am.getHistoricalProcessExitReasons(ctx.packageName, 0, 1).firstOrNull() ?: return report
    if (prefs.getLong("seen", 0L) >= last.timestamp) return report
    prefs.edit().putLong("seen", last.timestamp).apply()
    val why = when (last.reason) {
      ApplicationExitInfo.REASON_CRASH_NATIVE -> "A crash in native code"
      ApplicationExitInfo.REASON_LOW_MEMORY -> "The system ran out of memory and closed the app"
      ApplicationExitInfo.REASON_ANR -> "The app stopped responding"
      ApplicationExitInfo.REASON_CRASH -> "A crash"
      ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "The app used too many resources"
      ApplicationExitInfo.REASON_SIGNALED -> "The app was stopped by a signal"
      else -> return report
    }
    val sb = StringBuilder(report ?: "${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}")
    sb.append("\n\n").append(why)
    last.description?.let { sb.append(" (").append(it).append(')') }
    sb.append(" · memory in use ").append(last.pss / 1024).append(" MB")
    // A native crash's tombstone is a protobuf; its readable strings (the abort message, libraries and functions) are
    // enough to see where it happened.
    if (last.reason == ApplicationExitInfo.REASON_CRASH_NATIVE && Build.VERSION.SDK_INT >= 31) {
      try {
        last.traceInputStream?.use { input ->
          val bytes = CrashLogIO.readBytes(input, CrashLogIO.MAX_TOMBSTONE_BYTES)
          val lines = Regex("[ -~]{6,}").findAll(String(bytes, Charsets.ISO_8859_1)).map { it.value }
            .filter { it.contains(".so") || it.contains("abort", true) || it.contains("signal", true) || it.contains("Abort message", true) || it.contains("Java_") || it.contains("phonon") || it.contains("llama") || it.contains("zstd") }
            .distinct().take(40).toList()
          if (lines.isNotEmpty()) sb.append("\n\n").append(lines.joinToString("\n"))
        }
      } catch (_: Throwable) {
      }
    }
    return sb.toString().take(8000)
  }
}
