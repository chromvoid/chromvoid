package com.chromvoid.air.session

import android.app.ActivityManager
import android.content.Context
import com.chromvoid.air.bridge.AirRuntimeClient
import com.chromvoid.air.ui.maintenance.AppReset

/** The system clears this installation's data and ends its process after accepting the request. */
internal class AndroidAppReset(
    context: Context,
    private val checkAllowed: (Context) -> Unit = AirRuntimeClient.Companion::checkAppResetAllowed,
) : AppReset {
    private val applicationContext = context.applicationContext

    override fun requestReset(): Boolean {
        try {
            checkAllowed(applicationContext)
        } catch (_: UnsatisfiedLinkError) {
            return false
        } catch (_: IllegalStateException) {
            return false
        }
        return applicationContext.getSystemService(ActivityManager::class.java)?.clearApplicationUserData() ?: false
    }
}
