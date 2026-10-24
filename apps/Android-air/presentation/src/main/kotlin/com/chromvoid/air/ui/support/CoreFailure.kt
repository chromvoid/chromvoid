package com.chromvoid.air.ui.support

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ffi.BridgeException

/**
 * A failure as a screen reasons about it. Core answers with string codes and a
 * screen cares about a handful of kinds; the mapping lives here once, as it
 * does in the iOS client, so a new code reaches every screen together.
 */
public enum class FailureKind {
    /** The target no longer exists. */
    MISSING,

    /** The session behind the call is gone; the state holder drops everything. */
    REVOKED,

    /** The value does not fit one bridge reply on this device; retrying will not help. */
    TOO_LARGE,

    /** The request was malformed or incomplete; the user can fix the input. */
    INVALID_INPUT,

    /** The vault does not allow this change - a read-only session, for one. */
    DENIED,

    /** The name is already taken where the record would go. */
    CONFLICT,

    /** The record changed since it was read, or a prepared operation expired; start again. */
    STALE,

    /** The feature, network or provider is switched off or unreachable in this build. */
    UNAVAILABLE,

    /** The administrative password, or a fresh authorization, is required. */
    REAUTH_REQUIRED,

    /** Anything a screen explains generically and offers to retry. */
    OTHER,
}

public val Throwable.failureKind: FailureKind
    get() = when (this) {
        is CoreRefusal -> when (code) {
            "NODE_NOT_FOUND" -> FailureKind.MISSING
            "VAULT_REQUIRED", "SESSION_REVOKED" -> FailureKind.REVOKED
            "INVALID_INPUT", "EMPTY_PAYLOAD", "INVALID_PATH" -> FailureKind.INVALID_INPUT
            "ACCESS_DENIED" -> FailureKind.DENIED
            "NAME_EXIST" -> FailureKind.CONFLICT
            "SYNC_CONFLICT", "PREPARATION_STALE", "PREPARATION_EXPIRED", "PREPARATION_NOT_FOUND" ->
                FailureKind.STALE
            "WALLET_DISABLED", "UNSUPPORTED_CHAIN", "UNSUPPORTED_ACCOUNT_MODEL", "PROVIDER_UNAVAILABLE",
            "UNSUPPORTED_ASSET", "UNSUPPORTED_PROVIDER_SURFACE",
            -> FailureKind.UNAVAILABLE
            "EXPORT_REAUTH_FAILED", "CONFIRM_REQUIRED" -> FailureKind.REAUTH_REQUIRED
            else -> FailureKind.OTHER
        }
        is BridgeException.SessionRevoked -> FailureKind.REVOKED
        is BridgeException.PayloadTooLarge -> FailureKind.TOO_LARGE
        else -> FailureKind.OTHER
    }
