package com.chromvoid.app.main

import android.util.Log
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt
import org.json.JSONObject

internal const val ANDROID_KEYBOARD_INSETS_EVENT = "chromvoid:android-keyboard-insets-changed"

internal object AndroidKeyboardInsetsPhase {
    const val SETTLED = "settled"
}

internal data class AndroidKeyboardInsetsPayload(
    val visible: Boolean,
    val bottomInset: Int,
    val safeAreaTopInset: Int,
    val safeAreaBottomInset: Int,
    val phase: String,
) {
    fun toJson(): JSONObject =
        JSONObject()
            .put("visible", visible)
            .put("bottomInset", bottomInset.coerceAtLeast(0))
            .put("safeAreaTopInset", safeAreaTopInset.coerceAtLeast(0))
            .put("safeAreaBottomInset", safeAreaBottomInset.coerceAtLeast(0))
            .put("phase", phase)
            .put("source", "android-native")
}

internal fun androidInsetPxToCssPx(
    insetPx: Int,
    density: Float,
): Int {
    val normalizedDensity =
        if (density > 0f && !density.isNaN() && !density.isInfinite()) {
            density
        } else {
            1f
        }
    return (insetPx.coerceAtLeast(0) / normalizedDensity).roundToInt()
}

internal fun interface AndroidKeyboardInsetsEmitter {
    fun emit(
        webView: WebView,
        payload: AndroidKeyboardInsetsPayload,
    ): Boolean
}

internal class AndroidKeyboardInsetsWebViewEmitter(
    private val scriptEvaluator: WebViewScriptEvaluator = DefaultWebViewScriptEvaluator,
) : AndroidKeyboardInsetsEmitter {
    override fun emit(
        webView: WebView,
        payload: AndroidKeyboardInsetsPayload,
    ): Boolean {
        val payloadLiteral = payload.toJson().toString()
        val eventLiteral = JSONObject.quote(ANDROID_KEYBOARD_INSETS_EVENT)
        return try {
            scriptEvaluator.evaluate(
                webView,
                """
                (function () {
                  try {
                    const payload = $payloadLiteral
                    window.__chromvoidAndroidKeyboardInsets = payload
                    window.dispatchEvent(new CustomEvent($eventLiteral, { detail: payload }))
                    return true
                  } catch (_error) {
                    return false
                  }
                })();
                """.trimIndent(),
            ) {}
            true
        } catch (error: Exception) {
            Log.w(TAG, "Android keyboard insets script eval failed", error)
            false
        }
    }

    companion object {
        private const val TAG = "ChromVoid/KeyboardInsets"
    }
}

internal class AndroidKeyboardInsetsEventDispatcher(
    private val emitter: AndroidKeyboardInsetsEmitter = AndroidKeyboardInsetsWebViewEmitter(),
) {
    private var lastPayload: AndroidKeyboardInsetsPayload? = null

    fun dispatch(
        webView: WebView,
        payload: AndroidKeyboardInsetsPayload,
    ): Boolean {
        if (payload == lastPayload) return false
        if (!emitter.emit(webView, payload)) return false

        lastPayload = payload
        return true
    }

    fun replayLastPayload(webView: WebView): Boolean {
        val payload = lastPayload ?: return false
        return emitter.emit(webView, payload)
    }

    fun reset() {
        lastPayload = null
    }
}

internal class AndroidKeyboardInsetsBridge(
    private val dispatcher: AndroidKeyboardInsetsEventDispatcher = AndroidKeyboardInsetsEventDispatcher(),
) {
    fun attach(webView: WebView) {
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            dispatcher.dispatch(webView, payloadFromInsets(webView, insets))
            insets
        }
        webView.post {
            ViewCompat.requestApplyInsets(webView)
        }
    }

    fun replayCurrentInsets(webView: WebView?) {
        if (webView == null) return
        if (dispatcher.replayLastPayload(webView)) return

        ViewCompat.requestApplyInsets(webView)
    }

    fun detach(webView: WebView?) {
        if (webView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(webView, null)
            ViewCompat.setWindowInsetsAnimationCallback(webView, null)
        }
        dispatcher.reset()
    }

    companion object {
        private fun payloadFromInsets(
            webView: WebView,
            insets: WindowInsetsCompat,
        ): AndroidKeyboardInsetsPayload {
            val density = webView.resources.displayMetrics.density
            val bottomInset = androidInsetPxToCssPx(
                insets.getInsets(WindowInsetsCompat.Type.ime()).bottom,
                density,
            )
            val safeAreaTopInset = androidInsetPxToCssPx(
                insets.getInsets(WindowInsetsCompat.Type.statusBars()).top,
                density,
            )
            val safeAreaBottomInset = androidInsetPxToCssPx(
                insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom,
                density,
            )
            return AndroidKeyboardInsetsPayload(
                visible = insets.isVisible(WindowInsetsCompat.Type.ime()) || bottomInset > 0,
                bottomInset = bottomInset,
                safeAreaTopInset = safeAreaTopInset,
                safeAreaBottomInset = safeAreaBottomInset,
                phase = AndroidKeyboardInsetsPhase.SETTLED,
            )
        }
    }
}
