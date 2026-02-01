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
    private var serverUrl: String = "ws://localhost:3847"
    private var widgetMetroUrl: String = "http://localhost:8082"

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
            print("[expo-flow] Found ExpoFlow config: \(expoFlow)")
            if let auto = expoFlow["autoShow"] as? Bool {
                autoShow = auto
            }
            if let size = expoFlow["bubbleSize"] as? NSNumber {
                bubbleSize = CGFloat(size.doubleValue)
            }
            if let color = expoFlow["bubbleColor"] as? String {
                bubbleColor = color
            }
            if let url = expoFlow["serverUrl"] as? String {
                serverUrl = url
            }
            if let metroUrl = expoFlow["widgetMetroUrl"] as? String {
                widgetMetroUrl = metroUrl
                print("[expo-flow] Loaded widgetMetroUrl: \(metroUrl)")
            }
        } else {
            print("[expo-flow] WARNING: ExpoFlow config not found in Info.plist!")
        }
    }

    private func showBubble() {
        // Use env var first, then config, then default
        let metroBaseUrl = ProcessInfo.processInfo.environment["EXPO_FLOW_METRO_URL"] ?? widgetMetroUrl
        print("[expo-flow] metroBaseUrl: \(metroBaseUrl)")

        let bundleUrlString = "\(metroBaseUrl)/index.bundle?platform=ios&dev=true"
        print("[expo-flow] bundleUrlString: \(bundleUrlString)")

        guard let bundleUrl = URL(string: bundleUrlString) else {
            print("[expo-flow] ERROR: Failed to create URL from: \(bundleUrlString)")
            return
        }
        print("[expo-flow] bundleUrl: \(bundleUrl.absoluteString)")

        // Use env var first, then config value
        let effectiveServerUrl = ProcessInfo.processInfo.environment["EXPO_FLOW_SERVER_URL"] ?? serverUrl

        FloatingBubbleManager.shared.show(
            size: bubbleSize,
            color: bubbleColor,
            bundleURL: bundleUrl,
            serverUrl: effectiveServerUrl
        )

        // Also store in UserDefaults for backward compatibility
        UserDefaults.standard.set(effectiveServerUrl, forKey: "expo-flow-server-url")

        print("[expo-flow] Bubble auto-injected (size: \(bubbleSize), color: \(bubbleColor), server: \(effectiveServerUrl), widgetMetro: \(metroBaseUrl))")
    }
}
