package com.chromvoid.air.ui.credentials

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope

/**
 * A scope on the test's scheduler for a state holder to launch into. Not
 * `backgroundScope`: `advanceUntilIdle` treats background work as idle and
 * would never run what the holder launched.
 */
internal fun TestScope.modelScope(): CoroutineScope =
    CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
