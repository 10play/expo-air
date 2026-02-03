import ExpoModulesCore
import UIKit

/// Auto-injects floating bubble on app launch (DEBUG builds only).
/// Reads config from .expo-air.json in bundle or uses defaults.
public class ExpoAirAppDelegateSubscriber: ExpoAppDelegateSubscriber {
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
        // Read from Info.plist (ExpoAir dictionary)
        if let expoAir = Bundle.main.object(forInfoDictionaryKey: "ExpoAir") as? [String: Any] {
            print("[expo-air] Found ExpoAir config: \(expoAir)")
            if let auto = expoAir["autoShow"] as? Bool {
                autoShow = auto
            }
            if let size = expoAir["bubbleSize"] as? NSNumber {
                bubbleSize = CGFloat(size.doubleValue)
            }
            if let color = expoAir["bubbleColor"] as? String {
                bubbleColor = color
            }
            if let url = expoAir["serverUrl"] as? String {
                serverUrl = url
            }
            if let metroUrl = expoAir["widgetMetroUrl"] as? String {
                widgetMetroUrl = metroUrl
                print("[expo-air] Loaded widgetMetroUrl: \(metroUrl)")
            }
        } else {
            print("[expo-air] WARNING: ExpoAir config not found in Info.plist!")
        }
    }

    private func showBubble() {
        // Use env var first, then config, then default
        let metroBaseUrl = ProcessInfo.processInfo.environment["EXPO_AIR_METRO_URL"] ?? widgetMetroUrl
        print("[expo-air] metroBaseUrl: \(metroBaseUrl)")

        let bundleUrlString = "\(metroBaseUrl)/index.bundle?platform=ios&dev=true"
        print("[expo-air] bundleUrlString: \(bundleUrlString)")

        guard let bundleUrl = URL(string: bundleUrlString) else {
            print("[expo-air] ERROR: Failed to create URL from: \(bundleUrlString)")
            return
        }
        print("[expo-air] bundleUrl: \(bundleUrl.absoluteString)")

        // Use env var first, then config value
        let effectiveServerUrl = ProcessInfo.processInfo.environment["EXPO_AIR_SERVER_URL"] ?? serverUrl

        FloatingBubbleManager.shared.show(
            size: bubbleSize,
            color: bubbleColor,
            bundleURL: bundleUrl,
            serverUrl: effectiveServerUrl
        )

        // Also store in UserDefaults for backward compatibility
        UserDefaults.standard.set(effectiveServerUrl, forKey: "expo-air-server-url")

        print("[expo-air] Bubble auto-injected (size: \(bubbleSize), color: \(bubbleColor), server: \(effectiveServerUrl), widgetMetro: \(metroBaseUrl))")
    }
}
