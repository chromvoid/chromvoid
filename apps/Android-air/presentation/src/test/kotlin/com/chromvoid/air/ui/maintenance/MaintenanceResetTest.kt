package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.modelScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class MaintenanceResetTest {
    @Test
    public fun `missing local reset cannot open or replace the Core erase review`(): Unit = runTest {
        var cancelled = 0
        val maintenance = MaintenanceScope(
            1uL,
            MaintenanceServices(erasure = object : EraseStore {
                override suspend fun reviewErase(generation: ULong): EraseReview = object : EraseReview {
                    override suspend fun commit(masterPassword: String): EraseOutcome = error("must not delete")
                    override fun cancel() { cancelled += 1 }
                }
            }),
            modelScope(),
            { AirSessionState.Locked },
        )
        assertFalse(maintenance.offers(MaintenanceAction.APP_RESET))
        maintenance.open(MaintenanceAction.APP_RESET)
        assertNull(maintenance.route.value)
        maintenance.open(MaintenanceAction.ERASE)
        advanceUntilIdle()
        val route = maintenance.route.value as MaintenanceRoute.Erase

        maintenance.resetAppInsteadOfErasing()

        assertSame(route, maintenance.route.value)
        assertEquals(StorageEraseModel.Status.READY, route.model.state.value.status)
        assertEquals(0, cancelled)
        maintenance.close()
        assertEquals(1, cancelled)
    }

    @Test
    public fun `local reset is offered while locked and dismissing drops its confirmation`(): Unit = runTest {
        var state: AirSessionState = AirSessionState.Locked
        var resets = 0
        val maintenance = MaintenanceScope(
            1uL,
            MaintenanceServices(appReset = AppReset {
                resets += 1
                true
            }),
            modelScope(),
            { state },
        )
        assertTrue(maintenance.offers(MaintenanceAction.APP_RESET))
        maintenance.open(MaintenanceAction.APP_RESET)
        val reset = (maintenance.route.value as MaintenanceRoute.ResetApp).model
        reset.acknowledge(true)
        reset.review()

        maintenance.dismiss()
        reset.confirm()

        assertNull(maintenance.route.value)
        assertEquals(AppResetModel.Status.REVOKED, reset.state.value.status)
        assertEquals(0, resets)
        maintenance.open(MaintenanceAction.APP_RESET)
        assertEquals(AppResetModel.State(), (maintenance.route.value as MaintenanceRoute.ResetApp).model.state.value)
        maintenance.close()
        state = AirSessionState.Unlocked(1uL)
        assertTrue(maintenance.offers(MaintenanceAction.APP_RESET))
        for (unavailable in listOf(
            AirSessionState.Starting,
            AirSessionState.NeedsAdministrator,
            AirSessionState.Unavailable("STORAGE_UNAVAILABLE"),
        )) {
            state = unavailable
            assertFalse(maintenance.offers(MaintenanceAction.APP_RESET))
            maintenance.open(MaintenanceAction.APP_RESET)
            assertNull(maintenance.route.value)
        }
    }

    @Test
    public fun `forgotten password cancels Core review before offering the separate Android reset`(): Unit = runTest {
        var cancelled = 0
        var resetRequests = 0
        val review = object : EraseReview {
            override suspend fun commit(masterPassword: String): EraseOutcome = error("must not reach Core deletion")
            override fun cancel() { cancelled += 1 }
        }
        val maintenance = MaintenanceScope(
            1uL,
            MaintenanceServices(
                erasure = object : EraseStore {
                    override suspend fun reviewErase(generation: ULong): EraseReview = review
                },
                appReset = AppReset {
                    resetRequests += 1
                    true
                },
            ),
            modelScope(),
            { AirSessionState.Locked },
        )
        maintenance.open(MaintenanceAction.ERASE)
        advanceUntilIdle()
        val erase = (maintenance.route.value as MaintenanceRoute.Erase).model
        erase.acknowledge(true)
        erase.changePassword("discarded synthetic password")

        maintenance.resetAppInsteadOfErasing()

        assertEquals(1, cancelled)
        assertEquals(StorageEraseModel.State(status = StorageEraseModel.Status.REVOKED), erase.state.value)
        val reset = (maintenance.route.value as MaintenanceRoute.ResetApp).model
        assertEquals(AppResetModel.State(), reset.state.value)
        assertEquals(0, resetRequests)
        reset.acknowledge(true)
        reset.review()
        reset.confirm()
        reset.confirm()
        assertEquals(1, resetRequests)
        maintenance.close()
    }

    @Test
    public fun `an authenticated Core deletion already running cannot be replaced by reset`(): Unit = runTest {
        val completion = CompletableDeferred<EraseOutcome>()
        val maintenance = MaintenanceScope(
            1uL,
            MaintenanceServices(
                erasure = object : EraseStore {
                    override suspend fun reviewErase(generation: ULong): EraseReview = object : EraseReview {
                        override suspend fun commit(masterPassword: String): EraseOutcome = completion.await()
                        override fun cancel() = Unit
                    }
                },
                appReset = AppReset { error("must not interrupt Core deletion") },
            ),
            modelScope(),
            { AirSessionState.Locked },
        )
        maintenance.open(MaintenanceAction.ERASE)
        advanceUntilIdle()
        val route = maintenance.route.value as MaintenanceRoute.Erase
        route.model.acknowledge(true)
        route.model.changePassword("synthetic administrator")
        route.model.submit()
        advanceUntilIdle()

        maintenance.resetAppInsteadOfErasing()

        assertSame(route, maintenance.route.value)
        assertEquals(StorageEraseModel.Status.COMMITTING, route.model.state.value.status)
        completion.complete(EraseOutcome.COMPLETED)
        advanceUntilIdle()
        maintenance.close()
    }
}
