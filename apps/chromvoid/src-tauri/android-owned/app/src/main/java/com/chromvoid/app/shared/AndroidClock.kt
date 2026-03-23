package com.chromvoid.app.shared

internal interface AndroidClock {
    fun now(): Long
}

internal object SystemAndroidClock : AndroidClock {
    override fun now(): Long = System.currentTimeMillis()
}
