package expo.modules.expoair

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.JSBundleLoader
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.common.annotations.UnstableReactNativeAPI
import com.facebook.react.defaults.DefaultComponentsRegistry
import com.facebook.react.defaults.DefaultReactHostDelegate
import com.facebook.react.defaults.DefaultTurboModuleManagerDelegate
import com.facebook.react.fabric.ComponentFactory
import com.facebook.react.interfaces.fabric.ReactSurface
import com.facebook.react.runtime.ReactHostImpl
import com.facebook.react.runtime.ReactSurfaceImpl
import com.facebook.react.runtime.hermes.HermesInstance
import com.facebook.react.shell.MainReactPackage
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Creates an isolated React Native host for the widget bundle.
 * Mirrors ios/WidgetRuntime.mm — runs widget JS in a separate runtime
 * from the main app to prevent reload interference.
 *
 * Registers WidgetBridge as a native module in the widget runtime.
 */
@OptIn(UnstableReactNativeAPI::class)
class WidgetRuntime(
    private val context: Context,
    private val bundleUrl: String
) {
    companion object {
        private const val TAG = "WidgetRuntime"
    }

    private var reactHost: ReactHostImpl? = null
    private var surface: ReactSurface? = null
    private var widgetBridge: WidgetBridge? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    // Pending surface creation while bundle downloads
    private var pendingSurface: PendingSurface? = null

    private data class PendingSurface(
        val moduleName: String,
        val initialProps: Bundle?,
        val activityContext: Context,
        val callback: (View?) -> Unit
    )

    fun start() {
        if (reactHost != null) return

        Log.d(TAG, "Starting with bundle URL: $bundleUrl")

        val isAsset = bundleUrl.startsWith("asset://")
        if (isAsset) {
            createReactHost(JSBundleLoader.createAssetLoader(context, bundleUrl, true))
        } else {
            // Download bundle from Metro in background, then create host on main thread
            val cachedPath = "${context.cacheDir}/widget.android.bundle"
            Thread {
                val downloaded = downloadBundle(bundleUrl, cachedPath)
                mainHandler.post {
                    if (downloaded) {
                        createReactHost(JSBundleLoader.createFileLoader(cachedPath, bundleUrl, false))
                        // If a surface was requested while downloading, create it now
                        pendingSurface?.let { pending ->
                            val view = doCreateSurfaceView(pending.moduleName, pending.initialProps, pending.activityContext)
                            pending.callback(view)
                            pendingSurface = null
                        }
                    } else {
                        Log.e(TAG, "Failed to download widget bundle from $bundleUrl")
                    }
                }
            }.start()
        }
    }

    private fun createReactHost(jsBundleLoader: JSBundleLoader) {
        val componentFactory = ComponentFactory()
        DefaultComponentsRegistry.register(componentFactory)

        val tmmDelegateBuilder = DefaultTurboModuleManagerDelegate.Builder()

        val reactPackages = listOf<ReactPackage>(MainReactPackage(), WidgetBridgePackage())

        val delegate = DefaultReactHostDelegate(
            jsMainModulePath = "index",
            jsBundleLoader = jsBundleLoader,
            reactPackages = reactPackages,
            jsRuntimeFactory = HermesInstance(),
            turboModuleManagerDelegateBuilder = tmmDelegateBuilder
        )

        val host = ReactHostImpl(
            context,
            delegate,
            componentFactory,
            allowPackagerServerAccess = false,
            useDevSupport = false
        )

        reactHost = host
        // Preload the ReactInstance so it's ready before surface.start().
        // Without this, startSurface lazily creates the ReactInstance (~80ms).
        // During that window, ReactSurfaceView.onMeasure fires updateLayoutSpecs
        // into a surface that C++ hasn't registered yet — constraints are lost,
        // and Fabric renders with 0x0 so no native views appear.
        host.start()
        Log.d(TAG, "ReactHost created, preloading ReactInstance")
    }

    /**
     * Download a JS bundle from a URL to a local file.
     * Runs on a background thread. Returns true on success.
     */
    private fun downloadBundle(url: String, destPath: String): Boolean {
        Log.d(TAG, "Downloading bundle from $url")
        return try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = 30_000
            connection.readTimeout = 60_000
            connection.requestMethod = "GET"
            connection.connect()

            if (connection.responseCode != 200) {
                Log.e(TAG, "Bundle download failed: HTTP ${connection.responseCode}")
                return false
            }

            val destFile = File(destPath)
            connection.inputStream.use { input ->
                destFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
            Log.d(TAG, "Bundle downloaded to $destPath (${destFile.length()} bytes)")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Bundle download error: ${e.message}", e)
            false
        }
    }

    /**
     * Request a surface view, with callback for when the bundle finishes downloading.
     * Uses activityContext for the surface/view so Fabric's ThemedReactContext wraps an Activity
     * (required for MountingManager to properly create native views).
     */
    fun createSurfaceViewAsync(moduleName: String, initialProps: Bundle?, activityContext: Context, callback: (View?) -> Unit) {
        val host = reactHost
        if (host != null) {
            callback(doCreateSurfaceView(moduleName, initialProps, activityContext))
            return
        }
        // Host not ready yet — save request and fulfill after download
        Log.d(TAG, "ReactHost not ready, queuing surface creation for $moduleName")
        pendingSurface = PendingSurface(moduleName, initialProps, activityContext, callback)
    }

    private fun doCreateSurfaceView(moduleName: String, initialProps: Bundle?, activityContext: Context): View? {
        val host = reactHost ?: return null

        Log.d(TAG, "createSurfaceView moduleName=$moduleName")
        // createSurface() internally creates a ReactSurfaceImpl + ReactSurfaceView and
        // attaches them via surface.attachView(). We must use THAT view — creating a
        // second ReactSurfaceView would be disconnected from the surface, so Fabric
        // would render into the orphaned first view instead of the one we display.
        val reactSurface = host.createSurface(activityContext, moduleName, initialProps)
        surface = reactSurface

        val surfaceView = (reactSurface as ReactSurfaceImpl).view ?: run {
            Log.e(TAG, "createSurface returned a surface with no view")
            return null
        }

        // Notify the ReactHost that the host Activity is resumed.
        // This triggers FabricUIManager.onHostResume() → starts the ReactChoreographer
        // frame callback loop that flushes queued mount items to the UI thread.
        // Without this, Fabric queues mount items but never dispatches them because
        // the widget's isolated ReactHost has no Activity lifecycle connected to it.
        val activity = activityContext as? android.app.Activity
        if (activity != null) {
            host.onHostResume(activity)
            Log.d(TAG, "Called onHostResume for widget ReactHost")
        }

        // Start the surface — same order as standard RN app lifecycle:
        // createSurface() → start() → add view to hierarchy.
        reactSurface.start()
        Log.d(TAG, "Surface started for $moduleName")

        // Attach WidgetBridge image paste listener to the surface view
        widgetBridge?.attachToViewHierarchy(surfaceView)

        Log.d(TAG, "Created surface view: $surfaceView")
        return surfaceView
    }

    fun emitExpandCollapse(expanded: Boolean) {
        widgetBridge?.emitExpandCollapse(expanded)
    }

    fun invalidate() {
        surface?.stop()
        surface = null
        reactHost?.destroy("WidgetRuntime invalidated", null)
        reactHost = null
    }

    /**
     * Package that provides WidgetBridge to the widget runtime.
     */
    inner class WidgetBridgePackage : ReactPackage {
        override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
            val bridge = WidgetBridge(reactContext)
            widgetBridge = bridge
            return listOf(bridge)
        }

        override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
            return emptyList()
        }
    }
}
