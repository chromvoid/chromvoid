package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import androidx.fragment.app.FragmentActivity
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.shared.BaseFakeBridgeGateway
import com.chromvoid.app.shared.TestAndroidAppGraph
import com.chromvoid.app.shared.installTestAppGraph
import com.chromvoid.app.shared.resetTestAppGraph
import org.junit.After
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExternalIntentNativeSupportTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun tearDown() {
        resetTestAppGraph()
    }

    @Test
    fun startIntentForExternalAction_prefersForegroundActivity() {
        val graph = TestAndroidAppGraph(BaseFakeBridgeGateway())
        installTestAppGraph(graph)

        val fallbackContext = RecordingContext(context)
        val activity = RecordingFragmentActivity(context)
        graph.appGateActivityRegistry.attach(activity)

        val intent = Intent(Intent.ACTION_VIEW)
        startIntentForExternalAction(fallbackContext, intent)

        assertSame(intent, activity.startedIntent)
        assertNull(fallbackContext.startedIntent)
    }

    @Test
    fun startIntentForExternalAction_fallsBackToProvidedContext() {
        installTestAppGraph(TestAndroidAppGraph(BaseFakeBridgeGateway()))

        val fallbackContext = RecordingContext(context)
        val intent = Intent(Intent.ACTION_VIEW)
        startIntentForExternalAction(fallbackContext, intent)

        assertSame(intent, fallbackContext.startedIntent)
    }

    private class RecordingContext(
        base: Context,
    ) : ContextWrapper(base) {
        var startedIntent: Intent? = null

        override fun startActivity(intent: Intent) {
            startedIntent = intent
        }
    }

    private class RecordingFragmentActivity(
        base: Context,
    ) : FragmentActivity() {
        var startedIntent: Intent? = null

        init {
            attachBaseContext(base)
        }

        override fun startActivity(intent: Intent) {
            startedIntent = intent
        }
    }
}
