package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.maintenance.AppResetModel.Issue
import com.chromvoid.air.ui.maintenance.AppResetModel.Status
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

public class AppResetModelTest {
    private class Reset : AppReset {
        var requests = 0
        var accepted = true
        var failure: Exception? = null

        override fun requestReset(): Boolean {
            requests += 1
            failure?.let { throw it }
            return accepted
        }
    }

    private val reset = Reset()
    private val model = AppResetModel(reset)

    @Test
    public fun `the initial warning never carries consent or requests a reset`() {
        assertEquals(AppResetModel.State(), model.state.value)
        assertFalse(model.state.value.acknowledged)
        assertEquals(0, reset.requests)
    }

    @Test
    public fun `neither reviewing nor confirming can bypass the acknowledgement`() {
        model.confirm()
        assertEquals(Status.WARNING, model.state.value.status)
        assertEquals(0, reset.requests)

        model.review()

        assertEquals(Status.WARNING, model.state.value.status)
        assertEquals(Issue.ACKNOWLEDGEMENT_REQUIRED, model.state.value.issue)
        assertEquals(0, reset.requests)
    }

    @Test
    public fun `acknowledging only prepares the final confirmation`() {
        model.review()
        model.acknowledge(true)
        assertNull(model.state.value.issue)
        model.confirm()
        assertEquals(Status.WARNING, model.state.value.status)
        assertEquals(0, reset.requests)

        model.review()

        assertEquals(Status.CONFIRMING, model.state.value.status)
        assertEquals(0, reset.requests)
    }

    @Test
    public fun `withdrawing the acknowledgement makes another review explain what is missing`() {
        model.acknowledge(true)
        model.acknowledge(false)

        model.review()

        assertEquals(Issue.ACKNOWLEDGEMENT_REQUIRED, model.state.value.issue)
        assertEquals(0, reset.requests)
    }

    @Test
    public fun `cancelling the confirmation requires a fresh acknowledgement`() {
        model.acknowledge(true)
        model.review()

        model.cancelConfirmation()
        model.confirm()

        assertEquals(AppResetModel.State(), model.state.value)
        assertEquals(0, reset.requests)
        model.review()
        assertEquals(Issue.ACKNOWLEDGEMENT_REQUIRED, model.state.value.issue)
    }

    @Test
    public fun `final confirmation requests the Android reset exactly once`() {
        model.acknowledge(true)
        model.review()

        model.confirm()
        model.confirm()
        model.review()
        model.acknowledge(false)
        model.cancelConfirmation()
        model.retry()

        assertEquals(Status.REQUESTED, model.state.value.status)
        assertEquals(1, reset.requests)
    }

    @Test
    public fun `a rejected request must repeat the complete confirmation before retrying`() {
        reset.accepted = false
        model.acknowledge(true)
        model.review()
        model.confirm()
        assertEquals(Status.FAILED, model.state.value.status)

        model.confirm()
        assertEquals(1, reset.requests)
        model.retry()
        assertEquals(AppResetModel.State(), model.state.value)
        model.confirm()
        assertEquals(1, reset.requests)

        reset.accepted = true
        model.acknowledge(true)
        model.review()
        model.confirm()

        assertEquals(Status.REQUESTED, model.state.value.status)
        assertEquals(2, reset.requests)
    }

    @Test
    public fun `an adoption guard refusal explains that transfer must finish before reset`() {
        reset.failure = BridgeException.AdoptionActionForbidden()
        model.acknowledge(true)
        model.review()

        model.confirm()

        assertEquals(Status.FAILED, model.state.value.status)
        assertEquals(Issue.ADOPTION_REQUIRED, model.state.value.issue)
        assertEquals(1, reset.requests)
        assertFalse(model.state.value.acknowledged)
    }

    @Test
    public fun `an Android runtime failure becomes a recoverable failed request`() {
        reset.failure = SecurityException("reset refused")
        model.acknowledge(true)
        model.review()

        model.confirm()

        assertEquals(Status.FAILED, model.state.value.status)
        assertEquals(1, reset.requests)
        model.retry()
        assertEquals(AppResetModel.State(), model.state.value)
    }

    @Test
    public fun `leaving the confirmation drops consent and prevents a stale destructive action`() {
        model.acknowledge(true)
        model.review()

        model.revoke()
        model.confirm()
        model.review()
        model.acknowledge(true)
        model.cancelConfirmation()
        model.retry()

        assertEquals(Status.REVOKED, model.state.value.status)
        assertFalse(model.state.value.acknowledged)
        assertNull(model.state.value.issue)
        assertEquals(0, reset.requests)
    }

    @Test
    public fun `leaving an invalid warning clears its issue`() {
        model.review()

        model.revoke()

        assertEquals(AppResetModel.State(status = Status.REVOKED), model.state.value)
        assertEquals(0, reset.requests)
    }
}
