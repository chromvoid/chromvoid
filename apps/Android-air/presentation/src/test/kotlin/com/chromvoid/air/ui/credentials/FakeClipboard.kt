package com.chromvoid.air.ui.credentials

/** Records what was copied; [clearOwned] forgets it, as the real one would clear it. */
internal class FakeClipboard : CredentialClipboard {
    val copies: MutableList<Pair<String, Boolean>> = mutableListOf()
    var current: String? = null
    var clears: Int = 0

    override fun copy(value: String, sensitive: Boolean) {
        copies += value to sensitive
        current = value
    }

    override fun clearOwned() {
        clears += 1
        current = null
    }
}
