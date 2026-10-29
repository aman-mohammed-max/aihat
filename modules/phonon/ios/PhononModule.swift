import ExpoModulesCore

/**
 * Phonon-2 speech recognition on the device (English), on the Neural Engine. The model is Fermion Research's Core ML
 * package, downloaded by the app; it is compiled for this device the first time it loads. Needs iOS 18.
 */
public class PhononModule: Module {
  private var transcriber: AnyObject?
  private let queue = DispatchQueue(label: "com.amanm.aihat.phonon", qos: .userInitiated)

  private static func path(_ uri: String) -> String {
    uri.hasPrefix("file://") ? (URL(string: uri)?.path ?? uri) : uri
  }

  public func definition() -> ModuleDefinition {
    Name("Phonon")

    Function("isSupported") { () -> Bool in
      if #available(iOS 18.0, *) { return true }
      return false
    }

    // The files are downloaded one by one on iOS: there is nothing to unpack.
    AsyncFunction("prepare") { (_: String, _: String) in }

    AsyncFunction("load") { (dir: String, promise: Promise) in
      self.queue.async {
        guard #available(iOS 18.0, *) else {
          promise.reject("ERR_PHONON", "Phonon-2 needs iOS 18 or later.")
          return
        }
        if self.transcriber != nil {
          promise.resolve(nil)
          return
        }
        do {
          self.transcriber = try Transcriber(bundle: URL(fileURLWithPath: Self.path(dir)))
          promise.resolve(nil)
        } catch {
          promise.reject("ERR_PHONON", error.localizedDescription)
        }
      }
    }

    AsyncFunction("transcribeFile") { (uri: String, promise: Promise) in
      self.queue.async {
        guard #available(iOS 18.0, *), let t = self.transcriber as? Transcriber else {
          promise.reject("ERR_PHONON", "The speech model isn't loaded.")
          return
        }
        do {
          let result = try t.transcribe(url: URL(fileURLWithPath: Self.path(uri)))
          promise.resolve(result.text.trimmingCharacters(in: .whitespacesAndNewlines))
        } catch {
          promise.reject("ERR_PHONON", error.localizedDescription)
        }
      }
    }

    Function("unload") {
      self.queue.async { self.transcriber = nil }
    }
  }
}
