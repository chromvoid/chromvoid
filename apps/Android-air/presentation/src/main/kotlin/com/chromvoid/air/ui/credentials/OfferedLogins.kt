package com.chromvoid.air.ui.credentials

/**
 * A login another app submitted, which the person asked the system to save in ChromVoid. It
 * lives in memory only, until the vault is open and the person saves it or lets it go.
 */
public class OfferedLogin(
    public val token: String,
    public val title: String,
    public val username: String,
    public val password: String,
    /** The site or app it was typed into, as a website rule's value. */
    public val website: String,
) {
    override fun toString(): String = "OfferedLogin($title)"
}

/** The system's save requests, as the platform holds them. */
public interface OfferedLogins {
    /** The token of the newest login waiting for the shell; null when none waits. */
    public val waiting: kotlinx.coroutines.flow.StateFlow<String?>

    /** The shell took [token]: it no longer waits here. */
    public fun take(token: String)

    /** The login behind [token]; null when it expired or was already answered. */
    public suspend fun read(token: String): OfferedLogin?

    /** The person saved it or let it go; either way the offer ends and its password is dropped. */
    public suspend fun finish(token: String, saved: Boolean)
}
