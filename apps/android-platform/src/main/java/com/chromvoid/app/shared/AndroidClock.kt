package com.chromvoid.app.shared

interface AndroidClock {
    fun now(): Long
}

internal object SystemAndroidClock : AndroidClock {
    override fun now(): Long = System.currentTimeMillis()
}
