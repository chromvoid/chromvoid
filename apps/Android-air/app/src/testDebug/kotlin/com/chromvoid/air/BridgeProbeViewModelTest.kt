package com.chromvoid.air

import androidx.test.core.app.ApplicationProvider
import com.chromvoid.air.bridge.BridgeProbeResult
import com.chromvoid.air.bridge.BridgeProbing
import com.chromvoid.air.bridge.BridgeReport
import com.chromvoid.air.ui.BridgeProbeUiState
import com.chromvoid.air.ui.BridgeProbeViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
public class BridgeProbeViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    public fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    public fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    public fun `an unavailable bridge reports its code instead of a blank screen`(): Unit = runTest(dispatcher) {
        val model = viewModel(BridgeProbeResult.Unavailable("IncompatibleBuild", "rebuild the app"))
        testScheduler.advanceUntilIdle()

        val state = model.state.value
        assertTrue("expected a failure state, got $state", state is BridgeProbeUiState.Failed)
        assertEquals("IncompatibleBuild", (state as BridgeProbeUiState.Failed).code)
    }

    @Test
    public fun `a ready bridge reports the probe without leaking vault content`(): Unit = runTest(dispatcher) {
        val model = viewModel(BridgeProbeResult.Ready(report))
        testScheduler.advanceUntilIdle()

        val state = model.state.value
        assertTrue("expected a ready state, got $state", state is BridgeProbeUiState.Ready)
        val lines = (state as BridgeProbeUiState.Ready).lines.toMap()
        assertEquals("1", lines["protocol"])
        assertEquals("true", lines["locked after probe"])
        assertEquals("2", lines["entries"])
        // The probe reports counts, never titles or secrets.
        assertTrue(lines.values.none { it.contains("synthetic-entry") })
    }

    private fun viewModel(result: BridgeProbeResult): BridgeProbeViewModel =
        BridgeProbeViewModel(
            context = ApplicationProvider.getApplicationContext(),
            probe = BridgeProbing { result },
        )

    private val report = BridgeReport(
        protocolVersion = 1,
        fingerprint = "fingerprint",
        fixtureEnabled = true,
        storageRoot = "/data/user/0/com.chromvoid.air.dev/files/ChromVoidAir",
        initiallyLocked = true,
        entryCount = 2,
        folderCount = 1,
        lockedAfterProbe = true,
    )
}
