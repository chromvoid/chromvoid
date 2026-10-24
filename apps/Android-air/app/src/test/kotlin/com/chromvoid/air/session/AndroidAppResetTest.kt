package com.chromvoid.air.session

import android.app.ActivityManager
import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.maintenance.AppResetModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import org.robolectric.shadows.ShadowActivityManager

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
public class AndroidAppResetTest {
    private val context: Application = ApplicationProvider.getApplicationContext()

    @Test
    public fun `reset asks Android to clear only this application through the application context`() {
        val caller = object : ContextWrapper(context) {
            override fun getApplicationContext(): Context = context

            override fun getSystemService(name: String): Any = error("Use the application context")
        }
        val activityManager = context.getSystemService(ActivityManager::class.java)
        assertFalse(shadowOf(activityManager).isApplicationUserDataCleared)

        assertTrue(AndroidAppReset(caller) { }.requestReset())

        assertTrue(shadowOf(activityManager).isApplicationUserDataCleared)
    }

    @Test
    @Config(shadows = [RefusingActivityManager::class])
    public fun `Android refusal is returned without reporting a completed reset`() {
        assertFalse(AndroidAppReset(context) { }.requestReset())
        assertFalse(shadowOf(context.getSystemService(ActivityManager::class.java)).isApplicationUserDataCleared)
    }

    @Test
    public fun `adoption refusal cannot reach Android data clearing`() {
        val reset = AndroidAppReset(context) { throw BridgeException.AdoptionActionForbidden() }
        var refusal: BridgeException? = null
        try {
            reset.requestReset()
        } catch (error: BridgeException) {
            refusal = error
        }
        assertTrue(refusal is BridgeException.AdoptionActionForbidden)
        assertFalse(shadowOf(context.getSystemService(ActivityManager::class.java)).isApplicationUserDataCleared)
    }

    @Test
    public fun `missing native guard fails closed without crashing`() {
        assertFalse(AndroidAppReset(context) { throw UnsatisfiedLinkError("missing") }.requestReset())
        assertFalse(shadowOf(context.getSystemService(ActivityManager::class.java)).isApplicationUserDataCleared)
    }

    @Test
    public fun `reset recovery handles the typed adoption refusal without crashing`() {
        val reset = AndroidAppReset(context) { throw BridgeException.AdoptionActionForbidden() }
        val model = AppResetModel(reset)
        model.acknowledge(true)
        model.review()
        model.confirm()

        assertEquals(AppResetModel.Status.FAILED, model.state.value.status)
        assertEquals(AppResetModel.Issue.ADOPTION_REQUIRED, model.state.value.issue)
        assertFalse(shadowOf(context.getSystemService(ActivityManager::class.java)).isApplicationUserDataCleared)
    }

    /** Robolectric's default shadow always accepts; Android may refuse the request. */
    @Implements(ActivityManager::class)
    public class RefusingActivityManager : ShadowActivityManager() {
        @Implementation
        protected fun clearApplicationUserData(): Boolean = false
    }
}
