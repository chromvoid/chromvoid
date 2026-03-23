package com.chromvoid.app.shared

import android.content.Context
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.ChromVoidPasswordSaveActivity
import com.chromvoid.app.credentialprovider.AndroidBridgeGateway
import com.chromvoid.app.credentialprovider.CredentialProviderNativeRuntime
import com.chromvoid.app.credentialprovider.JniAndroidBridgeGateway
import com.chromvoid.app.main.DefaultPasswordSaveRequestStore
import com.chromvoid.app.main.PasswordSaveRequestStore
import com.chromvoid.app.main.PasswordSaveReviewController
import com.chromvoid.app.autofill.AutofillSessionStore
import com.chromvoid.app.autofill.InMemoryAutofillSessionStore
import com.chromvoid.app.passkey.PasskeyRequestRegistry
import com.chromvoid.app.passkey.PersistentPasskeyRequestRegistry
import com.chromvoid.app.security.BiometricPromptRunner
import com.chromvoid.app.security.KeystoreKeyProvider
import com.chromvoid.app.security.PasskeyMetadataStore
import com.chromvoid.app.security.PepperStore
import com.chromvoid.app.security.SystemPasskeyMetadataStore
import com.chromvoid.app.security.SystemPepperStore

internal interface AndroidAppGraph {
    val clock: AndroidClock
    val bridgeGateway: AndroidBridgeGateway
    val appGateActivityRegistry: CurrentActivityRegistry<FragmentActivity>
    val passwordSaveActivityRegistry: CurrentActivityRegistry<ChromVoidPasswordSaveActivity>
    val biometricPromptRunner: BiometricPromptRunner
    val autofillSessionStore: AutofillSessionStore
    val passkeyRequestRegistry: PasskeyRequestRegistry
    val passwordSaveRequestStore: PasswordSaveRequestStore
    val passwordSaveReviewController: PasswordSaveReviewController
    val passkeyMetadataStore: PasskeyMetadataStore
    val pepperStore: PepperStore
}

internal class DefaultAndroidAppGraph(
    context: Context,
) : AndroidAppGraph {
    private val appContext = context.applicationContext

    override val clock: AndroidClock = SystemAndroidClock
    override val appGateActivityRegistry = CurrentActivityRegistry<FragmentActivity>()
    override val passwordSaveActivityRegistry = CurrentActivityRegistry<ChromVoidPasswordSaveActivity>()
    override val biometricPromptRunner = BiometricPromptRunner(appGateActivityRegistry)
    override val autofillSessionStore: AutofillSessionStore = InMemoryAutofillSessionStore(clock)
    override val passkeyRequestRegistry = PersistentPasskeyRequestRegistry(appContext, clock)
    override val passwordSaveRequestStore: PasswordSaveRequestStore =
        DefaultPasswordSaveRequestStore(appContext, clock)
    override val passwordSaveReviewController =
        PasswordSaveReviewController(passwordSaveActivityRegistry)
    override val bridgeGateway: AndroidBridgeGateway =
        JniAndroidBridgeGateway(appContext, CredentialProviderNativeRuntime)
    override val passkeyMetadataStore: PasskeyMetadataStore =
        SystemPasskeyMetadataStore(appContext)
    override val pepperStore: PepperStore = SystemPepperStore(appContext)
}
