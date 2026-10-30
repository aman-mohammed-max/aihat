package expo.modules.devicememory

import android.app.ActivityManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Exposes one on-demand Android memory snapshot for local model load preflight. */
class DeviceMemoryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeviceMemory")

    Function("getMemoryInfo") { getMemoryInfo() }
  }

  private fun getMemoryInfo(): Map<String, Any>? {
    val context = appContext.reactContext?.applicationContext ?: return null
    val manager = context.getSystemService(ActivityManager::class.java) ?: return null
    val info = ActivityManager.MemoryInfo()
    manager.getMemoryInfo(info)
    return mapOf(
      "availableMemory" to info.availMem,
      "totalMemory" to info.totalMem,
      "lowMemory" to info.lowMemory,
    )
  }
}
