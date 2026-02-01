import ExpoModulesCore
import UIKit

/// Auto-injects floating bubble on app launch (DEBUG builds only).
/// Reads config from .expo-flow.json in bundle or uses defaults.
public class ExpoFlowAppDelegateSubscriber: ExpoAppDelegateSubscriber {
    private var hasShown = false

    // Config with defaults
    private var bubbleSize: CGFloat = 60
    private var bubbleColor: String = "#007AFF"
    private var autoShow: Bool = true

    public func applicationDidBecomeActive(_ application: UIApplication) {
        #if DEBUG
        guard !hasShown else { return }
        hasShown = true

        loadConfig()

        if autoShow {
            DispatchQueue.main.async {
                self.showBubble()
            }
        }
        #endif
    }

    private func loadConfig() {
        // Read from Info.plist (ExpoFlow dictionary)
        if let expoFlow = Bundle.main.object(forInfoDictionaryKey: "ExpoFlow") as? [String: Any] {
            if let auto = expoFlow["autoShow"] as? Bool {
                autoShow = auto
            }
            if let size = expoFlow["bubbleSize"] as? NSNumber {
                bubbleSize = CGFloat(size.doubleValue)
            }
            if let color = expoFlow["bubbleColor"] as? String {
                bubbleColor = color
            }
        }
    }

    private func showBubble() {
        let bundleUrl = ProcessInfo.processInfo.environment["EXPO_FLOW_METRO_URL"]
            .flatMap { URL(string: "\($0)/index.bundle?platform=ios&dev=true") }
            ?? URL(string: "http://localhost:8082/index.bundle?platform=ios&dev=true")!

        FloatingBubbleManager.shared.show(
            size: bubbleSize,
            color: bubbleColor,
            bundleURL: bundleUrl
        )

        if let serverUrl = ProcessInfo.processInfo.environment["EXPO_FLOW_SERVER_URL"] {
            UserDefaults.standard.set(serverUrl, forKey: "expo-flow-server-url")
        }

        print("[expo-flow] Bubble auto-injected (size: \(bubbleSize), color: \(bubbleColor))")
    }
}
