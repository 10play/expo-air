package expo.modules.expoair

import android.content.Context
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * Registers ExpoAirReactActivityLifecycleListener with the Expo module system.
 * Auto-discovered by Expo autolinking (scans for *Package.kt files).
 */
class ExpoAirPackage : Package {
    override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> {
        return listOf(ExpoAirReactActivityLifecycleListener())
    }
}
