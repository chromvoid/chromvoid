package com.chromvoid.air.ui.autofill

import android.content.Intent

/** Whether the system fills other apps from ChromVoid. */
public enum class AutoFillSystem {
    /** ChromVoid is the device's autofill service. */
    SELECTED,

    /** The device fills from another service, or from none. */
    NOT_SELECTED,

    /** The device offers no autofill at all - a work profile or a policy may turn it off. */
    UNSUPPORTED,
}

/** Whether Credential Manager offers passkeys and passwords from ChromVoid (Android 14+). */
public enum class PasskeyProvider {
    ENABLED,
    NOT_ENABLED,

    /** Android did not answer; its own setting shows the choice. */
    UNKNOWN,

    /** The device predates Credential Manager's providers. */
    UNSUPPORTED,
}

/**
 * A setup snapshot for the AutoFill page, never an authorization: each request another app
 * makes is answered, or refused, by Core when it arrives.
 */
public data class AutoFillStatus(
    val system: AutoFillSystem,
    /** Whether the provider paths reach this vault's runtime at all. */
    val providerReady: Boolean,
    val vaultOpen: Boolean,
    val passkeys: PasskeyProvider = PasskeyProvider.UNSUPPORTED,
)

public interface AutoFillStore {
    /** The system's side and Core's, read now under [generation]. */
    public suspend fun status(generation: ULong): AutoFillStatus

    /** The system screen that makes ChromVoid the autofill service; null where the device has none. */
    public fun settingsIntent(): Intent?

    /** The system screen that turns ChromVoid on for passkeys; null before Android 14. */
    public fun passkeySettingsIntent(): Intent? = null
}
