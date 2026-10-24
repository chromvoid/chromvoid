package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialAuditEntrySummary
import com.chromvoid.air.bridge.wire.CredentialSecurityAuditRow
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class AuditModelTest {
    private val store = FakeCredentialStore().apply {
        auditRows += row("weak", weak = true, codes = false)
        auditRows += row("fine", weak = false, codes = true)
        auditRows += CredentialSecurityAuditRow(credential = summary("unchecked", "Unchecked"))
    }

    private fun row(id: String, weak: Boolean, codes: Boolean) = CredentialSecurityAuditRow(
        audit = CredentialAuditEntrySummary(
            entryID = id,
            hasTwoFactor = codes,
            reusedPassword = false,
            weakPassword = weak,
        ),
        credential = summary(id, id.replaceFirstChar(Char::uppercase)),
    )

    private fun TestScope.audit(): AuditModel =
        AuditModel(store, generation = 1uL, scope = modelScope()).also { advanceUntilIdle() }

    @Test
    public fun `counts come from Core and an unchecked password stays unchecked`(): Unit = runTest {
        val state = audit().state.value

        assertEquals(AuditModel.Counts(total = 3, weak = 1, reused = 0, withCodes = 1, notChecked = 1), state.counts)
        assertNull("no assessment is not a safe one", state.rows.single { it.credential.id == "unchecked" }.audit)
    }

    @Test
    public fun `a filter is Core's issue parameter`(): Unit = runTest {
        val model = audit()

        model.setFilter(AuditModel.Filter.WEAK)
        advanceUntilIdle()

        assertEquals("weak", store.auditRequests.last().issue)
        assertEquals(listOf("weak"), model.state.value.rows.map { it.credential.id })
    }

    @Test
    public fun `a later page from another revision marks the list stale instead of mixing them`(): Unit = runTest {
        store.auditPageSize = 2
        val model = audit()
        assertEquals(store.auditRevision, store.auditRequests.single().revision ?: store.auditRevision)
        store.auditRevision = "b".repeat(64)

        model.loadMore()
        advanceUntilIdle()

        assertEquals("a".repeat(64), store.auditRequests.last().revision)
        assertEquals(AuditModel.Status.STALE, model.state.value.status)
        assertEquals(emptyList<CredentialSecurityAuditRow>(), model.state.value.rows)
    }
}
