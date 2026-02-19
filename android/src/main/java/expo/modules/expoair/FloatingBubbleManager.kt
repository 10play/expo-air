package expo.modules.expoair

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.widget.FrameLayout
import java.lang.ref.WeakReference

/**
 * Singleton managing floating bubble lifecycle.
 * Mirrors ios/FloatingBubbleManager.swift.
 */
object FloatingBubbleManager {

    private const val TAG = "FloatingBubbleManager"

    private var bubbleView: FloatingBubbleView? = null
    private var widgetRuntime: WidgetRuntime? = null
    private var activityRef: WeakReference<Activity>? = null

    private var currentSize: Double = 60.0
    private var currentColor: String = "#000000"
    private var currentExpanded: Boolean = false
    private var currentServerUrl: String? = null

    var onPress: (() -> Unit)? = null
    var onExpand: (() -> Unit)? = null
    var onCollapse: (() -> Unit)? = null
    var onDragEnd: ((Float, Float) -> Unit)? = null

    fun show(
        activity: Activity,
        size: Float = 60f,
        color: String = "#000000",
        bundleURL: String? = null,
        serverUrl: String? = null
    ) {
        activity.runOnUiThread {
            // If already showing, just make sure it's visible
            if (bubbleView != null) {
                bubbleView?.visibility = android.view.View.VISIBLE
                return@runOnUiThread
            }

            Log.d(TAG, "show() bundleURL=$bundleURL serverUrl=$serverUrl")

            currentSize = size.toDouble()
            currentColor = color
            currentExpanded = false
            currentServerUrl = serverUrl

            val bubble = FloatingBubbleView(activity)
            bubble.onPress = { onPress?.invoke() }
            bubble.onExpand = {
                currentExpanded = true
                onExpand?.invoke()
                widgetRuntime?.emitExpandCollapse(true)
            }
            bubble.onCollapse = {
                currentExpanded = false
                onCollapse?.invoke()
                widgetRuntime?.emitExpandCollapse(false)
            }

            // Create widget runtime and surface view if we have a bundle URL
            if (bundleURL != null) {
                if (widgetRuntime == null) {
                    widgetRuntime = WidgetRuntime(activity.applicationContext, bundleURL)
                    widgetRuntime?.start()
                }

                val initialProps = buildSurfaceProps()

                // Use async surface creation — bundle may still be downloading from Metro
                // Pass Activity context for Fabric's ThemedReactContext (needed for native view mounting)
                widgetRuntime?.createSurfaceViewAsync("ExpoAirBubble", initialProps, activity) { surfaceView ->
                    if (surfaceView != null) {
                        bubble.setSurfaceView(surfaceView)
                    }
                }
            }

            // Add to DecorView
            val decorView = activity.window.decorView as? FrameLayout
            decorView?.addView(bubble)

            bubbleView = bubble
            activityRef = WeakReference(activity)
        }
    }

    fun hide() {
        val activity = activityRef?.get() ?: return
        activity.runOnUiThread {
            bubbleView?.cleanup()
            (bubbleView?.parent as? ViewGroup)?.removeView(bubbleView)
            bubbleView = null
            // Note: widgetRuntime is kept alive intentionally so it survives app reloads
        }
    }

    fun expand() {
        val activity = activityRef?.get() ?: return
        activity.runOnUiThread {
            bubbleView?.expand()
        }
    }

    fun collapse() {
        val activity = activityRef?.get() ?: return
        activity.runOnUiThread {
            bubbleView?.collapse()
        }
    }

    fun updateServerUrl(serverUrl: String) {
        val activity = activityRef?.get() ?: return
        activity.runOnUiThread {
            currentServerUrl = serverUrl
            widgetRuntime?.updateSurfaceProps(buildSurfaceProps())
            android.preference.PreferenceManager.getDefaultSharedPreferences(activity)
                .edit()
                .putString("expo-air-server-url", serverUrl)
                .apply()
        }
    }

    private fun buildSurfaceProps(): Bundle = Bundle().apply {
        putDouble("size", currentSize)
        putString("color", currentColor)
        putBoolean("expanded", currentExpanded)
        currentServerUrl?.let { putString("serverUrl", it) }
    }
}
