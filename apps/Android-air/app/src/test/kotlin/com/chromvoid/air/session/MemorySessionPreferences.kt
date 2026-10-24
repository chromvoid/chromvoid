package com.chromvoid.air.session

import com.chromvoid.air.ui.settings.SessionPreferences

internal class MemorySessionPreferences(
    override var autoLockSeconds: Long = 0,
    override var keepScreenAwake: Boolean = false,
    override var lockOnLeave: Boolean = false,
    override var lockOnScreenOff: Boolean = false,
    override var lockNotification: Boolean = true,
) : SessionPreferences
