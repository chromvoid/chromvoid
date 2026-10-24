package com.chromvoid.air.session

import com.chromvoid.air.bridge.AirSessionRuntime

/** Named constructors so a test reads as a scenario, not as a fixture setup. */
internal object FakeSessionRuntimeAccessor {
    fun locked(): AirSessionRuntime = FakeSessionRuntime()

    fun firstRun(): AirSessionRuntime = FakeSessionRuntime(masterConfigured = false)

    fun refusing(code: String): AirSessionRuntime = FakeSessionRuntime(unlockRefusal = code)
}
