package expo.modules.expoair

import android.app.Activity
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Bundle
import android.preference.PreferenceManager
import android.util.Log
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * Auto-injects floating bubble on app launch (DEBUG builds only).
 * Reads config from AndroidManifest <meta-data>.
 * Mirrors ios/ExpoAirAppDelegateSubscriber.swift.
 */
class ExpoAirReactActivityLifecycleListener : ReactActivityLifecycleListener {

    companion object {
        private const val TAG = "ExpoAirLifecycle"
        private const val META_PREFIX = "expo.modules.expoair."
    }

    private var hasShown = false

    override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
        if (hasShown) return
        if (!isDebugBuild(activity)) return
        hasShown = true

        val config = loadConfigFromManifest(activity)
        Log.d(TAG, "Config loaded: $config")

        if (!config.autoShow) return

        activity.window.decorView.post {
            showBubble(activity, config)
        }
    }

    private fun showBubble(activity: Activity, config: BubbleConfig) {
        // Resolve bundle URL: pre-built asset > meta-data > emulator fallback
        val bundleUrl: String = run {
            // 1. Check for pre-built bundle in assets
            try {
                activity.assets.open("widget.android.bundle").close()
                Log.d(TAG, "Using pre-built widget bundle")
                return@run "asset:///widget.android.bundle"
            } catch (_: Exception) {}

            // 2. Metro URL from meta-data
            if (config.widgetMetroUrl.isNotEmpty()) {
                Log.d(TAG, "Using widget metro URL: ${config.widgetMetroUrl}")
                return@run "${config.widgetMetroUrl}/index.bundle?platform=android&dev=true"
            }

            // 3. Fallback for local development
            Log.d(TAG, "Using emulator fallback URL")
            "http://10.0.2.2:8082/index.bundle?platform=android&dev=true"
        }

        // Resolve server URL
        val serverUrl: String = when {
            config.serverUrl.isNotEmpty() -> config.serverUrl
            else -> "ws://10.0.2.2:3847"
        }

        FloatingBubbleManager.show(
            activity = activity,
            size = config.bubbleSize,
            color = config.bubbleColor,
            bundleURL = bundleUrl,
            serverUrl = serverUrl
        )

        // Store in SharedPreferences for backward compat
        PreferenceManager.getDefaultSharedPreferences(activity)
            .edit()
            .putString("expo-air-server-url", serverUrl)
            .apply()

        Log.d(TAG, "Bubble auto-injected (size=${config.bubbleSize}, color=${config.bubbleColor}, server=$serverUrl)")
    }

    private fun loadConfigFromManifest(activity: Activity): BubbleConfig {
        val config = BubbleConfig()
        try {
            val appInfo = activity.packageManager.getApplicationInfo(
                activity.packageName,
                PackageManager.GET_META_DATA
            )
            val meta = appInfo.metaData ?: return config

            meta.getString("${META_PREFIX}AUTO_SHOW")?.let {
                config.autoShow = it.toBoolean()
            }
            meta.getFloat("${META_PREFIX}BUBBLE_SIZE", config.bubbleSize).let {
                config.bubbleSize = it
            }
            meta.getString("${META_PREFIX}BUBBLE_COLOR")?.let {
                config.bubbleColor = it
            }
            meta.getString("${META_PREFIX}SERVER_URL")?.let {
                config.serverUrl = it
            }
            meta.getString("${META_PREFIX}WIDGET_METRO_URL")?.let {
                config.widgetMetroUrl = it
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read meta-data: ${e.message}")
        }
        return config
    }

    private fun isDebugBuild(activity: Activity): Boolean {
        return (activity.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }

    private data class BubbleConfig(
        var autoShow: Boolean = true,
        var bubbleSize: Float = 60f,
        var bubbleColor: String = "#007AFF",
        var serverUrl: String = "",
        var widgetMetroUrl: String = ""
    )
}
