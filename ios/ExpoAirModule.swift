import ExpoModulesCore

struct ShowBubbleOptions: Record {
  @Field var size: Double = 60
  @Field var color: String = "#000000"
}

public class ExpoAirModule: Module {
  private static func widgetBundleURL() -> URL? {
    // Production: use pre-built bundle from pod resources
    if let bundled = Bundle(for: ExpoAirModule.self).url(forResource: "widget", withExtension: "jsbundle") {
      return bundled
    }

    // Development: check for metro URL override via environment variable
    if let metroUrl = ProcessInfo.processInfo.environment["EXPO_AIR_METRO_URL"],
       let url = URL(string: "\(metroUrl)/index.bundle?platform=ios&dev=true&minify=false") {
      return url
    }

    // Development: check for metro URL from Info.plist (set by CLI)
    if let expoAir = Bundle.main.object(forInfoDictionaryKey: "ExpoAir") as? [String: Any],
       let metroUrl = expoAir["widgetMetroUrl"] as? String,
       !metroUrl.isEmpty,
       let url = URL(string: "\(metroUrl)/index.bundle?platform=ios&dev=true&minify=false") {
      return url
    }

    // Final fallback for local development only
    #if DEBUG
    return URL(string: "http://localhost:8082/index.bundle?platform=ios&dev=true&minify=false")
    #else
    return nil
    #endif
  }

  private func wireManagerEvents() {
    let manager = FloatingBubbleManager.shared
    manager.onPress = { [weak self] in
      self?.sendEvent("onPress", [:])
    }
    manager.onExpand = { [weak self] in
      self?.sendEvent("onExpand", [:])
    }
    manager.onCollapse = { [weak self] in
      self?.sendEvent("onCollapse", [:])
    }
    manager.onDragEnd = { [weak self] x, y in
      self?.sendEvent("onDragEnd", ["x": x, "y": y])
    }
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoAir")

    Constant("PI") {
      Double.pi
    }

    Events("onChange", "onPress", "onExpand", "onCollapse", "onDragEnd")

    Function("hello") {
      return "Hello world!"
    }

    AsyncFunction("setValueAsync") { (value: String) in
      self.sendEvent("onChange", [
        "value": value
      ])
    }

    Function("show") { (options: ShowBubbleOptions) in
      self.wireManagerEvents()
      FloatingBubbleManager.shared.show(
        size: CGFloat(options.size),
        color: options.color,
        bundleURL: Self.widgetBundleURL()
      )
    }

    Function("hide") {
      FloatingBubbleManager.shared.hide()
    }

    Function("expand") {
      FloatingBubbleManager.shared.expand()
    }

    Function("collapse") {
      FloatingBubbleManager.shared.collapse()
    }

    Function("setServerUrl") { (url: String) in
      FloatingBubbleManager.shared.updateServerUrl(url)
    }

    Function("getServerUrl") { () -> String in
      // Check UserDefaults first (may be set by CLI)
      if let cached = UserDefaults.standard.string(forKey: "expo-air-server-url"), !cached.isEmpty {
        return cached
      }
      // Check Info.plist (set by plugin/CLI)
      if let expoAir = Bundle.main.object(forInfoDictionaryKey: "ExpoAir") as? [String: Any],
         let serverUrl = expoAir["serverUrl"] as? String,
         !serverUrl.isEmpty {
        return serverUrl
      }
      // Fallback for local development
      #if DEBUG
      return "ws://localhost:3847"
      #else
      return ""
      #endif
    }

  }
}
