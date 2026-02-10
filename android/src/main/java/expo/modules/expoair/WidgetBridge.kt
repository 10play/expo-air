package expo.modules.expoair

import android.content.ClipData
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.core.view.ContentInfoCompat
import androidx.core.view.OnReceiveContentListener
import androidx.core.view.ViewCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.ReactApplication
import java.io.File
import java.io.FileOutputStream

/**
 * Minimal bridge for the widget's isolated runtime.
 * Only handles clipboard image paste — no collapse/expand/pushToken.
 *
 * Uses ViewCompat.setOnReceiveContentListener() (AndroidX) to intercept
 * image paste on ReactEditText views. Emits "onClipboardImagePaste" event
 * consumed by widget/components/PromptInput.tsx.
 */
class WidgetBridge(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "WidgetBridge"
        private val MIME_TYPES = arrayOf("image/*")
    }

    override fun getName(): String = "WidgetBridge"

    // Required by NativeEventEmitter on Android
    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {}

    @ReactMethod
    fun reloadMainApp() {
        try {
            val app = reactContext.applicationContext as? ReactApplication
            val host = app?.reactHost
            host?.reload("expo-air force reload")
            Log.d(TAG, "Main app reload triggered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to reload main app", e)
        }
    }

    /**
     * Attach image paste listener to all EditText views found in the given view hierarchy.
     * Called by WidgetRuntime after the surface view is created.
     */
    fun attachToViewHierarchy(rootView: View) {
        rootView.viewTreeObserver.addOnGlobalLayoutListener(object : ViewTreeObserver.OnGlobalLayoutListener {
            private var attached = false
            override fun onGlobalLayout() {
                if (attached) return
                val editTexts = findEditTexts(rootView)
                if (editTexts.isNotEmpty()) {
                    attached = true
                    editTexts.forEach { editText ->
                        ViewCompat.setOnReceiveContentListener(
                            editText,
                            MIME_TYPES,
                            ImagePasteListener()
                        )
                    }
                    Log.d(TAG, "Attached image paste listener to ${editTexts.size} EditText(s)")
                }
            }
        })
    }

    private fun findEditTexts(view: View): List<View> {
        val result = mutableListOf<View>()
        if (view.javaClass.simpleName.contains("EditText")) {
            result.add(view)
        }
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                result.addAll(findEditTexts(view.getChildAt(i)))
            }
        }
        return result
    }

    private inner class ImagePasteListener : OnReceiveContentListener {
        override fun onReceiveContent(view: View, payload: ContentInfoCompat): ContentInfoCompat? {
            val split = payload.partition { item: ClipData.Item -> item.uri != null }
            val uriContent = split.first
            val remaining = split.second

            if (uriContent != null) {
                val clip = uriContent.clip
                for (i in 0 until clip.itemCount) {
                    val uri = clip.getItemAt(i).uri ?: continue
                    handleImageUri(uri)
                }
            }

            // Return remaining non-image content for default handling
            return remaining
        }
    }

    /**
     * Emit expand/collapse events to the widget JS.
     * Called by FloatingBubbleManager when the native bubble state changes.
     */
    fun emitExpandCollapse(expanded: Boolean) {
        try {
            val params = Arguments.createMap().apply {
                putBoolean("expanded", expanded)
            }
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onExpandCollapse", params)
            Log.d(TAG, "Emitted onExpandCollapse: expanded=$expanded")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to emit onExpandCollapse", e)
        }
    }

    private fun handleImageUri(uri: Uri) {
        try {
            val inputStream = reactContext.contentResolver.openInputStream(uri) ?: return
            val bitmap = BitmapFactory.decodeStream(inputStream)
            inputStream.close()

            if (bitmap == null) {
                Log.w(TAG, "Failed to decode image from URI: $uri")
                return
            }

            // Save to temp file
            val tempDir = File(reactContext.cacheDir, "expo-air-paste")
            tempDir.mkdirs()
            val tempFile = File(tempDir, "paste_${System.currentTimeMillis()}.jpg")
            FileOutputStream(tempFile).use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
            }

            // Emit event
            val params = Arguments.createMap().apply {
                putString("uri", "file://${tempFile.absolutePath}")
                putInt("width", bitmap.width)
                putInt("height", bitmap.height)
            }

            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onClipboardImagePaste", params)

            Log.d(TAG, "Image paste: ${bitmap.width}x${bitmap.height} -> ${tempFile.absolutePath}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to handle pasted image", e)
        }
    }
}
