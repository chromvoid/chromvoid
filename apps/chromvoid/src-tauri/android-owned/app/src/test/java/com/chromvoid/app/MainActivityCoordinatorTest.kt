package com.chromvoid.app

import android.content.Context
import android.content.Intent
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.credentialprovider.BridgeResult
import com.chromvoid.app.credentialprovider.PasswordSaveReviewRequest
import com.chromvoid.app.main.AndroidBackDispatcher
import com.chromvoid.app.main.DefaultPasswordSaveRequestStore
import com.chromvoid.app.main.MainActivityCoordinator
import com.chromvoid.app.main.PasswordSaveReviewController
import com.chromvoid.app.main.PasswordSaveWebViewBridge
import com.chromvoid.app.main.PasswordSaveWebViewEmitter
import com.chromvoid.app.main.WebViewScriptEvaluator
import com.chromvoid.app.shared.BaseFakeBridgeGateway
import com.chromvoid.app.shared.CurrentActivityRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MainActivityCoordinatorTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun passwordSavePayload_waitsForWebViewAndDeliversOnce() {
        val gateway = FakePasswordSaveGateway()
        val store = DefaultPasswordSaveRequestStore(context, FixedClock())
        val emitterEvaluator = RecordingEvaluator(result = "true")
        val coordinator =
            MainActivityCoordinator(
                bridgeGateway = gateway,
                passwordSaveRequestStore = store,
                passwordSaveReviewController = PasswordSaveReviewController(CurrentActivityRegistry()),
                passwordSaveBridge =
                    PasswordSaveWebViewBridge(
                        bridgeGateway = gateway,
                        requestStore = store,
                        reviewController = PasswordSaveReviewController(CurrentActivityRegistry()),
                        emitter = PasswordSaveWebViewEmitter(emitterEvaluator),
                    ),
            )

        coordinator.consumePasswordSavePayload(
            Intent().putExtra(ChromVoidPasswordSaveActivity.EXTRA_REQUEST_TOKEN, "token-1"),
        )
        coordinator.dispatchPendingPasswordSaveToWebView(null)
        assertNotNull(store.current())

        coordinator.dispatchPendingPasswordSaveToWebView(WebView(context))
        assertEquals(1, gateway.requestCalls)
        assertEquals(1, gateway.markLaunchedCalls)
        assertTrue(emitterEvaluator.lastScript?.contains("chromvoid:android-password-save-request") == true)
        assertNull(store.current())

        coordinator.dispatchPendingPasswordSaveToWebView(WebView(context))
        assertEquals(1, gateway.requestCalls)
        assertEquals(1, gateway.markLaunchedCalls)
    }

    @Test
    fun dispatchBackToWebView_keepsTaskWhenHandled() {
        val moveCalls = mutableListOf<Unit>()
        val coordinator = coordinatorForBackDispatch(RecordingEvaluator(result = "true"))

        coordinator.dispatchBackToWebView(WebView(context)) {
            moveCalls += Unit
        }

        assertTrue(moveCalls.isEmpty())
    }

    @Test
    fun dispatchBackToWebView_movesTaskWhenUnhandled() {
        val moveCalls = mutableListOf<Unit>()
        val coordinator = coordinatorForBackDispatch(RecordingEvaluator(result = "false"))

        coordinator.dispatchBackToWebView(WebView(context)) {
            moveCalls += Unit
        }

        assertEquals(1, moveCalls.size)
    }

    @Test
    fun dispatchBackToWebView_movesTaskWhenScriptThrows() {
        val moveCalls = mutableListOf<Unit>()
        val coordinator = coordinatorForBackDispatch(RecordingEvaluator(throwOnEvaluate = true))

        coordinator.dispatchBackToWebView(WebView(context)) {
            moveCalls += Unit
        }

        assertEquals(1, moveCalls.size)
    }

    private fun coordinatorForBackDispatch(evaluator: RecordingEvaluator): MainActivityCoordinator {
        val gateway = FakePasswordSaveGateway()
        val store = DefaultPasswordSaveRequestStore(context, FixedClock())
        return MainActivityCoordinator(
            bridgeGateway = gateway,
            passwordSaveRequestStore = store,
            passwordSaveReviewController = PasswordSaveReviewController(CurrentActivityRegistry()),
            backDispatcher = AndroidBackDispatcher(evaluator),
        )
    }

    private class FakePasswordSaveGateway : BaseFakeBridgeGateway() {
        var requestCalls = 0
        var markLaunchedCalls = 0

        override fun passwordSaveRequest(token: String): BridgeResult<PasswordSaveReviewRequest> {
            requestCalls += 1
            return BridgeResult.Success(
                PasswordSaveReviewRequest(
                    title = "github.com",
                    username = "alice@example.com",
                    password = "pw-123",
                    urls = "https://github.com/login",
                ),
            )
        }

        override fun passwordSaveMarkLaunched(token: String): BridgeResult<Boolean> {
            markLaunchedCalls += 1
            return BridgeResult.Success(true)
        }
    }

    private class RecordingEvaluator(
        private val result: String? = null,
        private val throwOnEvaluate: Boolean = false,
    ) : WebViewScriptEvaluator {
        var lastScript: String? = null

        override fun evaluate(
            webView: WebView,
            script: String,
            onResult: (String?) -> Unit,
        ) {
            if (throwOnEvaluate) {
                throw IllegalStateException("boom")
            }
            lastScript = script
            onResult(result)
        }
    }

    private class FixedClock : com.chromvoid.app.shared.AndroidClock {
        override fun now(): Long = 1_000L
    }
}
