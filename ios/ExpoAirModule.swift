import ExpoModulesCore

struct ShowBubbleOptions: Record {
  @Field var size: Double = 60
  @Field var color: String = "#007AFF"
}

public class ExpoAirModule: Module {
  private static func widgetBundleURL() -> URL? {
    // If a pre-built bundle exists in the pod resources, use it (production)
    if let bundled = Bundle(for: ExpoAirModule.self).url(forResource: "widget", withExtension: "jsbundle") {
      return bundled
    }
    // Otherwise, fall back to the widget's dedicated Metro dev server on port 8082
    return URL(string: "http://localhost:8082/index.bundle?platform=ios&dev=true&minify=false")
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

    Function("getServerUrl") { () -> String in
      return UserDefaults.standard.string(forKey: "expo-air-server-url") ?? "ws://localhost:3847"
    }

    View(ExpoAirView.self) {
      Prop("url") { (view: ExpoAirView, url: URL) in
        if view.webView.url != url {
          view.webView.load(URLRequest(url: url))
        }
      }

      Events("onLoad")
    }
  }
}
