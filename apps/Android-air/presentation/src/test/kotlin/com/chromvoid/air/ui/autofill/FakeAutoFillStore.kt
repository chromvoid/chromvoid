package com.chromvoid.air.ui.autofill

import android.content.Intent

/** The AutoFill page's store as a test sets it: what it reports, and whether it fails. */
internal class FakeAutoFillStore(
    var status: AutoFillStatus = AutoFillStatus(
        system = AutoFillSystem.SELECTED,
        providerReady = true,
        vaultOpen = true,
        passkeys = PasskeyProvider.ENABLED,
    ),
    var failWith: Exception? = null,
    var settings: Intent? = Intent("com.chromvoid.test.AUTOFILL_SETTINGS"),
    var passkeySettings: Intent? = Intent("com.chromvoid.test.PASSKEY_SETTINGS"),
) : AutoFillStore {
    var reads: Int = 0
    val generations: MutableList<ULong> = mutableListOf()

    override suspend fun status(generation: ULong): AutoFillStatus {
        reads += 1
        generations += generation
        failWith?.let { throw it }
        return status
    }

    override fun settingsIntent(): Intent? = settings

    override fun passkeySettingsIntent(): Intent? = passkeySettings
}
