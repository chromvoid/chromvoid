package com.chromvoid.app.autofill

import android.app.PendingIntent
import android.content.Context
import com.chromvoid.app.ChromVoidPasswordSaveActivity
import com.chromvoid.app.credentialprovider.AndroidBridgeGateway
import com.chromvoid.app.credentialprovider.BridgeResult
import com.chromvoid.app.credentialprovider.PasswordSaveReviewRequest
import com.chromvoid.app.shared.ActivityIntentFactory

internal class PasswordSaveLauncher(
    private val context: Context,
    private val bridgeGateway: AndroidBridgeGateway,
) {
    fun launch(parsed: ParsedPasswordSaveRequest): BridgeResult<PendingIntent> {
        val payload =
            PasswordSaveReviewRequest(
                title = parsed.domain,
                username = parsed.username,
                password = parsed.password,
                urls = parsed.origin,
            )
        return when (val start = bridgeGateway.passwordSaveStart(payload)) {
            is BridgeResult.Failure -> start
            is BridgeResult.Success -> {
                val pendingIntent =
                    PendingIntent.getActivity(
                        context,
                        0,
                        ActivityIntentFactory
                            .activityIntent(
                                context = context,
                                target = ChromVoidPasswordSaveActivity::class.java,
                                action = ACTION_PASSWORD_SAVE,
                                uniquePath = "password/save/${start.value}",
                            )
                            .putExtra(ChromVoidPasswordSaveActivity.EXTRA_REQUEST_TOKEN, start.value),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                    )
                BridgeResult.Success(pendingIntent)
            }
        }
    }

    companion object {
        private const val ACTION_PASSWORD_SAVE = "com.chromvoid.app.action.PASSWORD_SAVE"
    }
}
