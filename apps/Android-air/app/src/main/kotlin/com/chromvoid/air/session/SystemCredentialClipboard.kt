package com.chromvoid.air.session

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import android.os.SystemClock
import com.chromvoid.air.ui.credentials.CredentialClipboard
import java.util.UUID

/**
 * The system clipboard, holding a copied value for [CredentialClipboard.LIFETIME_MILLIS].
 *
 * Each copy is labelled with a fresh token, and a clear only happens while the
 * current clip still carries that label, so a value the user copied since - in
 * this app or another - is never wiped. Only the clip's description is read,
 * never another app's content.
 *
 * Android 10 and later hide even the description from an app in the
 * background. A clear that falls due there cannot prove the clip is ours, so it
 * stays pending and is finished by [finishPendingClear] when the app is next
 * in front, rather than guessed at.
 */
internal class SystemCredentialClipboard(
    context: Context,
    private val handler: Handler = Handler(Looper.getMainLooper()),
    private val now: () -> Long = SystemClock::elapsedRealtime,
) : CredentialClipboard {
    private val manager: ClipboardManager = checkNotNull(context.getSystemService(ClipboardManager::class.java))
    private var ownedLabel: String? = null
    private var expiresAt: Long = 0

    /** A clear was asked for while the clip could not be checked. */
    private var clearPending = false
    private val expiry = Runnable { clearOwned() }

    override fun copy(value: String, sensitive: Boolean) {
        val label = "$LABEL_PREFIX${UUID.randomUUID()}"
        val clip = ClipData.newPlainText(label, value)
        if (sensitive) {
            // Keeps the value out of the clipboard preview on Android 13 and later.
            clip.description.extras = PersistableBundle().apply { putBoolean(EXTRA_IS_SENSITIVE, true) }
        }
        manager.setPrimaryClip(clip)
        ownedLabel = label
        clearPending = false
        expiresAt = now() + CredentialClipboard.LIFETIME_MILLIS
        handler.removeCallbacks(expiry)
        handler.postDelayed(expiry, CredentialClipboard.LIFETIME_MILLIS)
    }

    override fun clearOwned() {
        handler.removeCallbacks(expiry)
        val label = ownedLabel ?: return
        val description: ClipDescription? = manager.primaryClipDescription
        if (description == null) {
            // Hidden while in the background, or the clipboard is empty; keep
            // the claim and finish when the app is next in front.
            clearPending = true
            return
        }
        if (description.label == label) manager.clearPrimaryClip()
        ownedLabel = null
        clearPending = false
    }

    /**
     * Called when the app comes forward: finishes a clear the background could
     * not, whether a lock asked for it or the lifetime ran out.
     */
    fun finishPendingClear() {
        if (ownedLabel != null && (clearPending || now() >= expiresAt)) clearOwned()
    }

    private companion object {
        const val LABEL_PREFIX = "chromvoid:"

        // ClipDescription.EXTRA_IS_SENSITIVE, available as a constant from API 33.
        const val EXTRA_IS_SENSITIVE = "android.content.extra.IS_SENSITIVE"
    }
}
