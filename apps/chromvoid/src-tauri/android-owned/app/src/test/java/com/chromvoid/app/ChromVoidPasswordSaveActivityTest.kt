package com.chromvoid.app

import android.content.Context
import android.content.Intent
import com.chromvoid.app.credentialprovider.BridgeError
import com.chromvoid.app.credentialprovider.BridgeResult
import com.chromvoid.app.credentialprovider.PasswordSaveReviewRequest
import com.chromvoid.app.nativebridge.PasswordSaveNativeShell
import com.chromvoid.app.shared.BaseFakeBridgeGateway
import com.chromvoid.app.shared.TestAndroidAppGraph
import com.chromvoid.app.shared.UnsupportedPasskeyMetadataStore
import com.chromvoid.app.shared.installTestAppGraph
import com.chromvoid.app.shared.resetTestAppGraph
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromVoidPasswordSaveActivityTest {
    @After
    fun tearDown() {
        resetTestAppGraph()
    }

    @Test
    fun invalidToken_finishesCancelledImmediately() {
        installTestAppGraph(TestAndroidAppGraph(FakePasswordSaveBridge(ok = false), UnsupportedPasskeyMetadataStore))

        val activity =
            Robolectric.buildActivity(
                ChromVoidPasswordSaveActivity::class.java,
                Intent().putExtra(ChromVoidPasswordSaveActivity.EXTRA_REQUEST_TOKEN, "missing"),
            )
                .setup()
                .get()

        val shadow = shadowOf(activity)
        assertEquals(android.app.Activity.RESULT_CANCELED, shadow.resultCode)
        assertNotNull(shadow.resultIntent)
    }

    @Test
    fun validToken_staysOpenUntilReviewCompletes() {
        installTestAppGraph(TestAndroidAppGraph(FakePasswordSaveBridge(ok = true), UnsupportedPasskeyMetadataStore))

        val activity =
            Robolectric.buildActivity(
                ChromVoidPasswordSaveActivity::class.java,
                Intent().putExtra(ChromVoidPasswordSaveActivity.EXTRA_REQUEST_TOKEN, "token-1"),
            )
                .setup()
                .get()

        val shadow = shadowOf(activity)
        assertNotNull(shadow.nextStartedActivity)
    }

    @Test
    fun completeReview_saved_setsResultOkAndFinishes() {
        installTestAppGraph(TestAndroidAppGraph(FakePasswordSaveBridge(ok = true), UnsupportedPasskeyMetadataStore))

        val activity =
            Robolectric.buildActivity(
                ChromVoidPasswordSaveActivity::class.java,
                Intent().putExtra(ChromVoidPasswordSaveActivity.EXTRA_REQUEST_TOKEN, "token-1"),
            )
                .setup()
                .get()

        PasswordSaveNativeShell.completeReview("token-1", "saved", true)

        val shadow = shadowOf(activity)
        assertEquals(android.app.Activity.RESULT_OK, shadow.resultCode)
        assertEquals("saved", shadow.resultIntent?.getStringExtra("outcome"))
    }

    @Test
    fun completeReview_dismissed_setsResultCanceledAndFinishes() {
        installTestAppGraph(TestAndroidAppGraph(FakePasswordSaveBridge(ok = true), UnsupportedPasskeyMetadataStore))

        val activity =
            Robolectric.buildActivity(
                ChromVoidPasswordSaveActivity::class.java,
                Intent().putExtra(ChromVoidPasswordSaveActivity.EXTRA_REQUEST_TOKEN, "token-2"),
            )
                .setup()
                .get()

        PasswordSaveNativeShell.completeReview("token-2", "dismissed", false)

        val shadow = shadowOf(activity)
        assertEquals(android.app.Activity.RESULT_CANCELED, shadow.resultCode)
        assertEquals("dismissed", shadow.resultIntent?.getStringExtra("outcome"))
    }

    private class FakePasswordSaveBridge(
        private val ok: Boolean,
    ) : BaseFakeBridgeGateway() {
        override fun passwordSaveRequest(token: String): BridgeResult<PasswordSaveReviewRequest> =
            if (ok) {
                BridgeResult.Success(
                    PasswordSaveReviewRequest(
                        title = "github.com",
                        username = "alice@example.com",
                        password = "pw-123",
                        urls = "https://github.com/login",
                    ),
                )
            } else {
                BridgeResult.Failure(BridgeError("INVALID", "invalid"))
            }

        override fun passwordSaveMarkLaunched(token: String): BridgeResult<Boolean> =
            BridgeResult.Success(true)
    }
}
