package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import androidx.fragment.app.FragmentActivity
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.shared.BaseFakeBridgeGateway
import com.chromvoid.app.shared.TestAndroidAppGraph
import com.chromvoid.app.shared.installTestAppGraph
import com.chromvoid.app.shared.resetTestAppGraph
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
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

    @Test
    fun createChooserIntentWithReadAccess_usesClipDataGrantWithoutManualPackageGrant() {
        val recordingContext = RecordingContext(context)
        val uri = Uri.parse("content://com.chromvoid.test/share/report.pdf")
        val targetIntent = Intent(Intent.ACTION_SEND).setType("application/pdf")

        val chooserIntent =
            createChooserIntentWithReadAccess(
                recordingContext,
                targetIntent,
                listOf(uri),
                "report.pdf",
            )

        assertEquals(0, recordingContext.grantUriPermissionCalls)
        assertTrue(targetIntent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertNotNull(targetIntent.clipData)
        assertTrue(chooserIntent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertNotNull(chooserIntent.clipData)
    }

    private class RecordingContext(
        base: Context,
    ) : ContextWrapper(base) {
        var startedIntent: Intent? = null
        var grantUriPermissionCalls: Int = 0

        override fun startActivity(intent: Intent) {
            startedIntent = intent
        }

        override fun grantUriPermission(
            toPackage: String?,
            uri: Uri?,
            modeFlags: Int,
        ) {
            grantUriPermissionCalls += 1
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
