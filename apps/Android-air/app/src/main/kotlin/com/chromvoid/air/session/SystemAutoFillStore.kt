package com.chromvoid.air.session

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.credentials.CredentialManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.AccessSession
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.autofill.AutoFillStatus
import com.chromvoid.air.ui.autofill.AutoFillStore
import com.chromvoid.air.ui.autofill.AutoFillSystem
import com.chromvoid.air.ui.autofill.PasskeyProvider
import com.chromvoid.app.ChromVoidCredentialProviderService
import com.chromvoid.app.androidAppGraph
import com.chromvoid.app.credentialprovider.BridgeResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The AutoFill page's status: the system's choice of autofill service and of Credential
 * Manager providers, and the provider path as another app's request would reach it - read
 * for the page's generation, so a lock in between refuses it instead of reporting a stale
 * vault.
 */
internal class SystemAutoFillStore(
    private val context: Context,
    private val session: AccessSession,
) : AutoFillStore {
    override suspend fun status(generation: ULong): AutoFillStatus {
        val provider = withContext(Dispatchers.IO) {
            (context.androidAppGraph().bridgeGateway.providerStatus() as? BridgeResult.Success)?.value
        }
        if (session.state.value != AirSessionState.Unlocked(generation)) throw BridgeException.SessionRevoked()
        return AutoFillStatus(
            system = system(),
            providerReady = provider?.runtimeReady == true,
            vaultOpen = provider?.vaultOpen == true,
            passkeys = passkeys(),
        )
    }

    override fun settingsIntent(): Intent? =
        if (manager()?.isAutofillSupported == true) {
            Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE, Uri.fromParts("package", context.packageName, null))
        } else {
            null
        }

    override fun passkeySettingsIntent(): Intent? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            Intent(Settings.ACTION_CREDENTIAL_PROVIDER, Uri.fromParts("package", context.packageName, null))
        } else {
            null
        }

    private fun passkeys(): PasskeyProvider {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return PasskeyProvider.UNSUPPORTED
        val manager = context.getSystemService(CredentialManager::class.java) ?: return PasskeyProvider.UNSUPPORTED
        val provider = ComponentName(context, ChromVoidCredentialProviderService::class.java)
        // Android 14's service can fail this question itself (a NullPointerException over its
        // own provider list); the page then says Android could not tell.
        val enabled = try {
            manager.isEnabledCredentialProviderService(provider)
        } catch (error: RuntimeException) {
            return PasskeyProvider.UNKNOWN
        }
        return if (enabled) PasskeyProvider.ENABLED else PasskeyProvider.NOT_ENABLED
    }

    private fun system(): AutoFillSystem {
        val manager = manager() ?: return AutoFillSystem.UNSUPPORTED
        return when {
            !manager.isAutofillSupported -> AutoFillSystem.UNSUPPORTED
            manager.hasEnabledAutofillServices() -> AutoFillSystem.SELECTED
            else -> AutoFillSystem.NOT_SELECTED
        }
    }

    private fun manager(): AutofillManager? = context.getSystemService(AutofillManager::class.java)
}
