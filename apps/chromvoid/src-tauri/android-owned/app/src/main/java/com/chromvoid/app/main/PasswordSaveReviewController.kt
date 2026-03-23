package com.chromvoid.app.main

import android.app.Activity
import android.content.Intent
import android.os.Looper
import com.chromvoid.app.ChromVoidPasswordSaveActivity
import com.chromvoid.app.shared.CurrentActivityRegistry

internal class PasswordSaveReviewController(
    private val registry: CurrentActivityRegistry<ChromVoidPasswordSaveActivity>,
) {
    fun completeReview(
        token: String,
        outcome: String,
        finished: Boolean,
    ) {
        val activity = registry.current() ?: return
        val currentToken = activity.currentReviewToken
        if (token.isNotBlank() && currentToken != token) {
            return
        }

        val resultIntent =
            Intent()
                .putExtra("token", currentToken.orEmpty())
                .putExtra("outcome", outcome)
                .putExtra("finished", finished)

        val finishActivity = {
            val resultCode =
                if (finished && outcome == "saved") {
                    Activity.RESULT_OK
                } else {
                    Activity.RESULT_CANCELED
                }
            activity.setResult(resultCode, resultIntent)
            activity.finish()
        }

        if (Looper.myLooper() == Looper.getMainLooper()) {
            finishActivity()
        } else {
            activity.runOnUiThread(finishActivity)
        }
    }
}
