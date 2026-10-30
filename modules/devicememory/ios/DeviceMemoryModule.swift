import ExpoModulesCore
import Foundation
import os

/** Provides a point-in-time memory snapshot for local model admission checks. */
public class DeviceMemoryModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeviceMemory")

    Function("getMemoryInfo") { () -> [String: Any]? in
      guard #available(iOS 13.0, *) else { return nil }
      return [
        "availableMemory": Double(os_proc_available_memory()),
        "totalMemory": Double(ProcessInfo.processInfo.physicalMemory),
      ]
    }
  }
}
