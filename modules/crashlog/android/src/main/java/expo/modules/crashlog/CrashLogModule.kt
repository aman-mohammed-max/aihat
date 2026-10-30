package expo.modules.crashlog

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

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
          file(ctx).writeText("${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}\nThread: ${thread.name}\n${Log.getStackTraceString(error)}")
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
      report = saved.readText().take(6000)
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
          val bytes = input.readBytes()
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
