package com.chromvoid.app.main

import android.content.Context
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AndroidKeyboardInsetsBridgeTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun convertsAndroidPhysicalInsetsToCssPixels() {
        assertEquals(300, androidInsetPxToCssPx(900, 3f))
        assertEquals(24, androidInsetPxToCssPx(65, 2.75f))
        assertEquals(0, androidInsetPxToCssPx(-12, 3f))
        assertEquals(120, androidInsetPxToCssPx(120, 0f))
    }

    @Test
    fun dispatcherSkipsDuplicatePayloads() {
        val emitter = RecordingEmitter()
        val dispatcher = AndroidKeyboardInsetsEventDispatcher(emitter)
        val webView = WebView(context)
        val payload =
            AndroidKeyboardInsetsPayload(
                visible = true,
                bottomInset = 284,
                safeAreaTopInset = 24,
                safeAreaBottomInset = 18,
                phase = AndroidKeyboardInsetsPhase.SETTLED,
            )

        assertTrue(dispatcher.dispatch(webView, payload))
        assertFalse(dispatcher.dispatch(webView, payload))

        assertEquals(listOf(payload), emitter.payloads)
    }

    @Test
    fun dispatcherRetriesPayloadWhenEmitFails() {
        val emitter = RecordingEmitter(failFirst = true)
        val dispatcher = AndroidKeyboardInsetsEventDispatcher(emitter)
        val webView = WebView(context)
        val payload =
            AndroidKeyboardInsetsPayload(
                visible = true,
                bottomInset = 312,
                safeAreaTopInset = 24,
                safeAreaBottomInset = 18,
                phase = AndroidKeyboardInsetsPhase.SETTLED,
            )

        assertFalse(dispatcher.dispatch(webView, payload))
        assertTrue(dispatcher.dispatch(webView, payload))

        assertEquals(listOf(payload), emitter.payloads)
    }

    @Test
    fun dispatcherCanReplayDuplicatePayloadsForNewDocuments() {
        val emitter = RecordingEmitter()
        val dispatcher = AndroidKeyboardInsetsEventDispatcher(emitter)
        val webView = WebView(context)
        val payload =
            AndroidKeyboardInsetsPayload(
                visible = false,
                bottomInset = 0,
                safeAreaTopInset = 50,
                safeAreaBottomInset = 18,
                phase = AndroidKeyboardInsetsPhase.SETTLED,
            )

        assertFalse(dispatcher.replayLastPayload(webView))
        assertTrue(dispatcher.dispatch(webView, payload))
        assertFalse(dispatcher.dispatch(webView, payload))
        assertTrue(dispatcher.replayLastPayload(webView))

        assertEquals(listOf(payload, payload), emitter.payloads)
    }

    @Test
    fun webViewEmitterDispatchesCustomEventWithPayloadDetail() {
        val evaluator = RecordingEvaluator()
        val emitter = AndroidKeyboardInsetsWebViewEmitter(evaluator)

        assertTrue(
            emitter.emit(
                WebView(context),
                AndroidKeyboardInsetsPayload(
                    visible = true,
                    bottomInset = 286,
                    safeAreaTopInset = 24,
                    safeAreaBottomInset = 18,
                    phase = AndroidKeyboardInsetsPhase.SETTLED,
                ),
            ),
        )

        val script = evaluator.lastScript
        assertNotNull(script)
        assertTrue(script?.contains(ANDROID_KEYBOARD_INSETS_EVENT) == true)
        assertTrue(script?.contains("\"source\":\"android-native\"") == true)
        assertTrue(script?.contains("\"phase\":\"settled\"") == true)
        assertTrue(script?.contains("\"bottomInset\":286") == true)
        assertTrue(script?.contains("\"safeAreaTopInset\":24") == true)
        assertTrue(script?.contains("\"safeAreaBottomInset\":18") == true)
        assertTrue(script?.contains("__chromvoidAndroidKeyboardInsets") == true)
        assertTrue(script?.contains("new CustomEvent") == true)
    }

    private class RecordingEmitter(
        private val failFirst: Boolean = false,
    ) : AndroidKeyboardInsetsEmitter {
        val payloads = mutableListOf<AndroidKeyboardInsetsPayload>()
        private var calls = 0

        override fun emit(
            webView: WebView,
            payload: AndroidKeyboardInsetsPayload,
        ): Boolean {
            calls += 1
            if (failFirst && calls == 1) return false
            payloads += payload
            return true
        }
    }

    private class RecordingEvaluator : WebViewScriptEvaluator {
        var lastScript: String? = null

        override fun evaluate(
            webView: WebView,
            script: String,
            onResult: (String?) -> Unit,
        ) {
            lastScript = script
            onResult("true")
        }
    }
}
