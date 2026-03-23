package com.chromvoid.app.nativebridge

import com.chromvoid.app.shared.AndroidRuntimeAccess

internal object PasswordSaveNativeShell {
    @JvmStatic
    fun completeReview(
        token: String,
        outcome: String,
        finished: Boolean,
    ) {
        AndroidRuntimeAccess.appGraphOrNull()?.passwordSaveReviewController?.completeReview(
            token = token,
            outcome = outcome,
            finished = finished,
        )
    }
}
