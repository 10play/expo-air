import ExpoModulesCore
import UIKit

/// Auto-injects floating bubble on app launch (DEBUG builds only).
/// Reads config from .expo-air.json in bundle or uses defaults.
public class ExpoAirAppDelegateSubscriber: ExpoAppDelegateSubscriber {
    private var hasShown = false

    // Config with defaults (localhost fallbacks only used in SDK development)
    private var bubbleSize: CGFloat = 60
    private var bubbleColor: String = "#007AFF"
    private var autoShow: Bool = true
    private var serverUrl: String = ""
    private var widgetMetroUrl: String = ""

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
        // Resolve bundle URL with priority: pre-built bundle > env var > config > localhost fallback
        let bundleUrl: URL

        // 1. Check for pre-built bundle first (production/npm installs)
        if let prebuiltBundle = Bundle(for: ExpoAirAppDelegateSubscriber.self).url(forResource: "widget", withExtension: "jsbundle") {
            print("[expo-air] Using pre-built widget bundle")
            bundleUrl = prebuiltBundle
        } else {
            // 2. Development mode: use Metro URL
            let metroBaseUrl: String
            if let envUrl = ProcessInfo.processInfo.environment["EXPO_AIR_METRO_URL"], !envUrl.isEmpty {
                metroBaseUrl = envUrl
            } else if !widgetMetroUrl.isEmpty {
                metroBaseUrl = widgetMetroUrl
            } else {
                // Final fallback for SDK development
                metroBaseUrl = "http://localhost:8082"
            }

            print("[expo-air] metroBaseUrl: \(metroBaseUrl)")
            let bundleUrlString = "\(metroBaseUrl)/index.bundle?platform=ios&dev=true"
            print("[expo-air] bundleUrlString: \(bundleUrlString)")

            guard let url = URL(string: bundleUrlString) else {
                print("[expo-air] ERROR: Failed to create URL from: \(bundleUrlString)")
                return
            }
            bundleUrl = url
        }

        print("[expo-air] bundleUrl: \(bundleUrl.absoluteString)")

        // Resolve server URL with priority: env var > config > localhost fallback
        let effectiveServerUrl: String
        if let envUrl = ProcessInfo.processInfo.environment["EXPO_AIR_SERVER_URL"], !envUrl.isEmpty {
            effectiveServerUrl = envUrl
        } else if !serverUrl.isEmpty {
            effectiveServerUrl = serverUrl
        } else {
            // Final fallback for SDK development
            effectiveServerUrl = "ws://localhost:3847"
        }

        FloatingBubbleManager.shared.show(
            size: bubbleSize,
            color: bubbleColor,
            bundleURL: bundleUrl,
            serverUrl: effectiveServerUrl
        )

        // Also store in UserDefaults for backward compatibility
        UserDefaults.standard.set(effectiveServerUrl, forKey: "expo-air-server-url")

        print("[expo-air] Bubble auto-injected (size: \(bubbleSize), color: \(bubbleColor), server: \(effectiveServerUrl))")
    }

    // Handle device token for push notifications
    public func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        #if DEBUG
        let tokenParts = deviceToken.map { data in String(format: "%02.2hhx", data) }
        let token = tokenParts.joined()
        print("[expo-air] Device token received: \(token)")
        UserDefaults.standard.set(token, forKey: "expo-air-device-token")
        #endif
    }

    public func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        #if DEBUG
        print("[expo-air] Failed to register for remote notifications: \(error)")
        #endif
    }
}
