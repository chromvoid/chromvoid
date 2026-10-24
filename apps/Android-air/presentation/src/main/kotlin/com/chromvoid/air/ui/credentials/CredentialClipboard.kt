package com.chromvoid.air.ui.credentials

/**
 * Where a copied value goes. The application implements it over the system
 * clipboard; the state holders only ever copy and clear what they copied.
 *
 * An implementation marks its own clip, clears it after [LIFETIME_MILLIS] and
 * on [clearOwned], and never reads or clears what another app put there.
 */
public interface CredentialClipboard {
    /** [sensitive] hides the value from clipboard previews where the OS supports it. */
    public fun copy(value: String, sensitive: Boolean)

    /** Removes our clip if it is still the current one; anything newer is left alone. */
    public fun clearOwned()

    public companion object {
        /** How long a copied value stays, as in the iOS client. */
        public const val LIFETIME_MILLIS: Long = 15_000
    }
}
