package com.chromvoid.air.session

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.chromvoid.air.MainActivity
import com.chromvoid.air.R
import com.chromvoid.air.ui.credentials.OfferedLogin
import com.chromvoid.air.ui.credentials.OfferedLogins
import com.chromvoid.app.androidAppGraph
import com.chromvoid.app.credentialprovider.BridgeResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.getAndUpdate
import kotlinx.coroutines.withContext

/**
 * The logins the system asked ChromVoid to save. The autofill service hands each one here
 * in-process - the platform keeps the login itself in memory behind a token - and it waits
 * for the shell, however long the app takes to come forward. A notification offers the
 * review; the system would refuse to open a screen for it from the background.
 */
internal class SystemOfferedLogins(private val context: Context) : OfferedLogins {
    private val mutableWaiting = MutableStateFlow<String?>(null)
    override val waiting: StateFlow<String?> = mutableWaiting.asStateFlow()

    /** The autofill service handed over [token]; a newer offer replaces one not yet taken. */
    fun receive(token: String) {
        val replaced = mutableWaiting.getAndUpdate { token }
        if (replaced != null && replaced != token) gateway().passwordSaveFinish(replaced, false)
        val site = (gateway().passwordSaveRequest(token) as? BridgeResult.Success)?.value?.title ?: return
        notify(site)
    }

    override fun take(token: String) {
        mutableWaiting.compareAndSet(token, null)
    }

    override suspend fun read(token: String): OfferedLogin? = withContext(Dispatchers.IO) {
        when (val request = gateway().passwordSaveRequest(token)) {
            is BridgeResult.Failure -> null
            is BridgeResult.Success -> OfferedLogin(
                token = token,
                title = request.value.title,
                username = request.value.username,
                password = request.value.password,
                website = request.value.urls,
            )
        }
    }

    override suspend fun finish(token: String, saved: Boolean) {
        withContext(Dispatchers.IO) { gateway().passwordSaveFinish(token, saved) }
        manager()?.cancel(NOTIFICATION_ID)
    }

    private fun notify(site: String) {
        val manager = manager() ?: return
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.login_offer_channel),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply { setShowBadge(false) },
        )
        val open = PendingIntent.getActivity(
            context,
            REQUEST_CODE,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        manager.notify(
            NOTIFICATION_ID,
            Notification.Builder(context, CHANNEL_ID)
                .setContentTitle(context.getString(R.string.login_offer_title, site))
                .setContentText(context.getString(R.string.login_offer_text))
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setCategory(Notification.CATEGORY_RECOMMENDATION)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setContentIntent(open)
                .setAutoCancel(true)
                .build(),
        )
    }

    private fun gateway() = context.androidAppGraph().bridgeGateway

    private fun manager(): NotificationManager? = context.getSystemService(NotificationManager::class.java)

    private companion object {
        const val CHANNEL_ID = "chromvoid_login_offers"
        const val NOTIFICATION_ID = 4301
        const val REQUEST_CODE = 4301
    }
}
