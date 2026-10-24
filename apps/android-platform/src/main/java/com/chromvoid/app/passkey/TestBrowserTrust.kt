package com.chromvoid.app.passkey

import com.chromvoid.platform.BuildConfig

/**
 * A development build's device test standing in for a browser: its probe app is trusted to name
 * a website's origin, as the release browsers are, so a website's sign-in can be asked of
 * Credential Manager without a browser. Any other build refuses it.
 */
public object TestBrowserTrust {
    @Volatile
    internal var trusted: Pair<String, String>? = null
        private set

    /** Trusts [packageName] signed by the certificate whose SHA-256 is [certificateSha256], `AA:BB:…`. */
    public fun trust(packageName: String, certificateSha256: String) {
        check(BuildConfig.DEBUG) { "Only a development build trusts a test browser" }
        trusted = packageName to certificateSha256
    }

    public fun clear() {
        trusted = null
    }
}
