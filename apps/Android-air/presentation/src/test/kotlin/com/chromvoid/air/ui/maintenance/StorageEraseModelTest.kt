package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.modelScope
import com.chromvoid.air.ui.maintenance.StorageEraseModel.Issue
import com.chromvoid.air.ui.maintenance.StorageEraseModel.Status
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class StorageEraseModelTest {
    private class Review : EraseReview {
        val passwords = mutableListOf<String>()
        var answers = ArrayDeque<Result<EraseOutcome>>()
        var gate: CompletableDeferred<Unit>? = null
        var cancelled = 0

        override suspend fun commit(masterPassword: String): EraseOutcome {
            passwords += masterPassword
            gate?.await()
            return answers.removeFirst().getOrThrow()
        }

        override fun cancel() {
            cancelled += 1
        }
    }

    private class Store(val review: Review) : EraseStore {
        var reviews = 0
        var failures = 0
        var failure: Exception? = null

        override suspend fun reviewErase(generation: ULong): EraseReview {
            reviews += 1
            failure?.let { throw it }
            if (failures > 0) {
                failures -= 1
                throw java.io.IOException("storage unavailable")
            }
            return review
        }
    }

    private val review = Review()
    private val store = Store(review)
    private val outcomes = mutableListOf<EraseOutcome>()

    private fun TestScope.ready(): StorageEraseModel =
        StorageEraseModel(store, generation = 1uL, scope = modelScope(), onFinished = { outcomes += it }).apply {
            prepare()
            advanceUntilIdle()
        }

    @Test
    public fun `adoption blocks the erase review with an explanation and deletes nothing`(): Unit = runTest {
        store.failure = BridgeException.AdoptionActionForbidden()

        val model = ready()

        assertEquals(Status.FAILED, model.state.value.status)
        assertEquals(Issue.ADOPTION_REQUIRED, model.state.value.issue)
        assertTrue(review.passwords.isEmpty())
        assertTrue(outcomes.isEmpty())
    }

    @Test
    public fun `adoption refusal during erase releases the review and does not claim deletion`(): Unit = runTest {
        review.answers.add(Result.failure(BridgeException.AdoptionActionForbidden()))
        val model = ready()
        model.acknowledge(true)
        model.changePassword("admin")

        model.submit()
        advanceUntilIdle()

        assertEquals(Status.FAILED, model.state.value.status)
        assertEquals(Issue.ADOPTION_REQUIRED, model.state.value.issue)
        assertEquals("", model.state.value.password)
        assertEquals(1, review.cancelled)
        assertTrue(outcomes.isEmpty())
    }

    @Test
    public fun `nothing is deleted without the acknowledgement and the password`(): Unit = runTest {
        val model = ready()
        assertEquals(Status.READY, model.state.value.status)

        model.submit()
        assertEquals(Issue.ACKNOWLEDGEMENT_REQUIRED, model.state.value.issue)
        model.acknowledge(true)
        model.submit()
        assertEquals(Issue.PASSWORD_REQUIRED, model.state.value.issue)
        advanceUntilIdle()
        assertTrue(review.passwords.isEmpty())
    }

    @Test
    public fun `a completed erase reports its outcome and leaves nothing behind`(): Unit = runTest {
        review.answers.add(Result.success(EraseOutcome.COMPLETED))
        val model = ready()
        model.acknowledge(true)
        model.changePassword("admin")

        model.submit()
        assertEquals("the password leaves as the request is made", "", model.state.value.password)
        advanceUntilIdle()

        assertEquals(listOf("admin"), review.passwords)
        assertEquals(listOf(EraseOutcome.COMPLETED), outcomes)
        assertEquals(Status.REVOKED, model.state.value.status)
        assertEquals(1, review.cancelled)
    }

    @Test
    public fun `a wrong password keeps the review for another attempt`(): Unit = runTest {
        review.answers.add(Result.failure(CoreRefusal("INVALID_MASTER_PASSWORD", "admin:erase")))
        review.answers.add(Result.success(EraseOutcome.INCOMPLETE))
        val model = ready()
        model.acknowledge(true)
        model.changePassword("wrong")
        model.submit()
        advanceUntilIdle()

        assertEquals(Status.READY, model.state.value.status)
        assertEquals(Issue.INVALID_PASSWORD, model.state.value.issue)
        assertTrue(outcomes.isEmpty())

        model.changePassword("admin")
        model.submit()
        advanceUntilIdle()
        assertEquals(1, store.reviews)
        assertEquals(listOf(EraseOutcome.INCOMPLETE), outcomes)
    }

    @Test
    public fun `an erase that cannot be confirmed says so rather than offering another`(): Unit = runTest {
        review.answers.add(Result.failure(EraseUnconfirmed()))
        val model = ready()
        model.acknowledge(true)
        model.changePassword("admin")
        model.submit()
        advanceUntilIdle()

        assertEquals(listOf(EraseOutcome.UNCONFIRMED), outcomes)
        assertEquals(Status.REVOKED, model.state.value.status)
    }

    @Test
    public fun `a spent review starts again from the top`(): Unit = runTest {
        review.answers.add(Result.failure(java.io.IOException("the worker went away")))
        val model = ready()
        model.acknowledge(true)
        model.changePassword("admin")
        model.submit()
        advanceUntilIdle()

        assertEquals(Status.FAILED, model.state.value.status)
        assertEquals(Issue.REVIEW_EXPIRED, model.state.value.issue)
        assertEquals(false, model.state.value.acknowledged)
        model.prepare()
        advanceUntilIdle()
        assertEquals(Status.READY, model.state.value.status)
        assertEquals(2, store.reviews)
    }

    @Test
    public fun `a review that cannot be prepared can be asked for again`(): Unit = runTest {
        store.failures = 1
        val model = ready()
        assertEquals(Status.FAILED, model.state.value.status)
        assertEquals(Issue.REVIEW_FAILED, model.state.value.issue)

        model.prepare()
        advanceUntilIdle()
        assertEquals(Status.READY, model.state.value.status)
    }

    @Test
    public fun `closing the screen mid-deletion still delivers the outcome`(): Unit = runTest {
        review.gate = CompletableDeferred()
        review.answers.add(Result.success(EraseOutcome.COMPLETED))
        val model = ready()
        model.acknowledge(true)
        model.changePassword("admin")
        model.submit()
        advanceUntilIdle()
        assertEquals(Status.COMMITTING, model.state.value.status)

        // The erase replaces the session, which ends the scope that showed the screen.
        model.revoke()
        review.gate?.complete(Unit)
        advanceUntilIdle()

        assertEquals(listOf(EraseOutcome.COMPLETED), outcomes)
    }

    @Test
    public fun `closing the screen before deleting drops the review`(): Unit = runTest {
        val model = ready()
        model.acknowledge(true)
        model.changePassword("admin")

        model.revoke()
        advanceUntilIdle()

        assertEquals(Status.REVOKED, model.state.value.status)
        assertEquals("", model.state.value.password)
        assertEquals(1, review.cancelled)
        assertNull(outcomes.firstOrNull())
    }

    @Test
    public fun `a revoked session ends the deletion screen without an outcome`(): Unit = runTest {
        review.answers.add(Result.failure(BridgeException.SessionRevoked()))
        val model = ready()
        model.acknowledge(true)
        model.changePassword("admin")
        model.submit()
        advanceUntilIdle()

        assertEquals(Status.REVOKED, model.state.value.status)
        assertTrue(outcomes.isEmpty())
    }
}
