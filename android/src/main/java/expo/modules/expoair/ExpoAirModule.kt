package expo.modules.expoair

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.preference.PreferenceManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ShowBubbleOptions : Record {
    @Field var size: Double = 60.0
    @Field var color: String = "#007AFF"
}

class ExpoAirModule : Module() {

    private fun widgetBundleURL(): String? {
        val context = appContext.reactContext ?: return null

        // 1. Pre-built bundle in assets
        try {
            context.assets.open("widget.android.bundle").close()
            return "asset:///widget.android.bundle"
        } catch (_: Exception) {
            // Not found in assets
        }

        // 2. AndroidManifest meta-data for widget metro URL
        try {
            val appInfo = context.packageManager.getApplicationInfo(
                context.packageName,
                PackageManager.GET_META_DATA
            )
            val metroUrl = appInfo.metaData?.getString("expo.modules.expoair.WIDGET_METRO_URL")
            if (!metroUrl.isNullOrEmpty()) {
                return "$metroUrl/index.bundle?platform=android&dev=true&minify=false"
            }
        } catch (_: Exception) {}

        // 3. Fallback for local development (DEBUG only)
        if (isDebugBuild(context)) {
            return "http://10.0.2.2:8082/index.bundle?platform=android&dev=true&minify=false"
        }

        return null
    }

    private fun wireManagerEvents() {
        FloatingBubbleManager.onPress = {
            sendEvent("onPress", mapOf<String, Any>())
        }
        FloatingBubbleManager.onExpand = {
            sendEvent("onExpand", mapOf<String, Any>())
        }
        FloatingBubbleManager.onCollapse = {
            sendEvent("onCollapse", mapOf<String, Any>())
        }
        FloatingBubbleManager.onDragEnd = { x, y ->
            sendEvent("onDragEnd", mapOf("x" to x, "y" to y))
        }
    }

    override fun definition() = ModuleDefinition {
        Name("ExpoAir")

        Constant("PI") {
            Math.PI
        }

        Events("onChange", "onPress", "onExpand", "onCollapse", "onDragEnd")

        Function("hello") {
            "Hello world!"
        }

        AsyncFunction("setValueAsync") { value: String ->
            sendEvent("onChange", mapOf("value" to value))
        }

        Function("show") { options: ShowBubbleOptions ->
            wireManagerEvents()
            val activity = appContext.currentActivity ?: return@Function
            val bundleURL = widgetBundleURL()
            FloatingBubbleManager.show(
                activity = activity,
                size = options.size.toFloat(),
                color = options.color,
                bundleURL = bundleURL
            )
        }

        Function("hide") {
            FloatingBubbleManager.hide()
        }

        Function("expand") {
            FloatingBubbleManager.expand()
        }

        Function("collapse") {
            FloatingBubbleManager.collapse()
        }

        Function("getServerUrl") {
            val context = appContext.reactContext ?: return@Function ""

            // Check SharedPreferences first (may be set by CLI)
            val prefs = PreferenceManager.getDefaultSharedPreferences(context)
            val cached = prefs.getString("expo-air-server-url", null)
            if (!cached.isNullOrEmpty()) {
                return@Function cached
            }

            // Check AndroidManifest meta-data (set by plugin/CLI)
            try {
                val appInfo = context.packageManager.getApplicationInfo(
                    context.packageName,
                    PackageManager.GET_META_DATA
                )
                val serverUrl = appInfo.metaData?.getString("expo.modules.expoair.SERVER_URL")
                if (!serverUrl.isNullOrEmpty()) {
                    return@Function serverUrl
                }
            } catch (_: Exception) {}

            // Fallback for local development
            if (isDebugBuild(context)) {
                return@Function "ws://10.0.2.2:3847"
            }

            return@Function ""
        }

    }

    companion object {
        fun isDebugBuild(context: Context): Boolean {
            return (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        }
    }
}
