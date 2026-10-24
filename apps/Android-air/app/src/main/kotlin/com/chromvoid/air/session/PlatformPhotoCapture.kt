package com.chromvoid.air.session

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.chromvoid.air.PhotoCaptureActivity
import com.chromvoid.air.ui.files.PhotoCapture
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CompletableDeferred

/**
 * Take Photo on this device: [PhotoCaptureActivity] owns the camera and its permission, and hands
 * the photo back here in memory, in this process - never through an intent's extras or a file.
 * Leaving the import while the camera is open - a lock does - closes it.
 */
internal class PlatformPhotoCapture(private val context: Context) : PhotoCapture {
    override val available: Boolean =
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)

    override suspend fun capture(): PhotoCapture.Result {
        val id = UUID.randomUUID().toString()
        val answer = CompletableDeferred<PhotoCapture.Result>()
        waiting[id] = answer
        val started = runCatching {
            context.startActivity(
                Intent(context, PhotoCaptureActivity::class.java)
                    .putExtra(PhotoCaptureActivity.EXTRA_CAPTURE, id)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.isSuccess
        if (!started) {
            waiting.remove(id)
            return PhotoCapture.Result.Unavailable
        }
        return try {
            answer.await()
        } finally {
            if (waiting.remove(id) != null) screens.remove(id)?.get()?.let { it.runOnUiThread(it::finish) }
        }
    }

    internal companion object {
        private val waiting = ConcurrentHashMap<String, CompletableDeferred<PhotoCapture.Result>>()
        private val screens = ConcurrentHashMap<String, WeakReference<Activity>>()

        /** The camera screen for capture [id] opened; false when nothing waits for it any more. */
        fun attach(id: String, screen: Activity): Boolean {
            if (!waiting.containsKey(id)) return false
            screens[id] = WeakReference(screen)
            return true
        }

        /** The camera screen's answer. A photo nobody waits for any more is cleared. */
        fun deliver(id: String, result: PhotoCapture.Result) {
            screens.remove(id)
            val delivered = waiting.remove(id)?.complete(result) ?: false
            if (!delivered && result is PhotoCapture.Result.Taken) result.jpeg.fill(0)
        }
    }
}
