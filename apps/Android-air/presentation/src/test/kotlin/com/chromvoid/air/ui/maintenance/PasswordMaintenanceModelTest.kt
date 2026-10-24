package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ui.credentials.modelScope
import com.chromvoid.air.ui.maintenance.PasswordMaintenanceModel.Field
import com.chromvoid.air.ui.maintenance.PasswordMaintenanceModel.Issue
import com.chromvoid.air.ui.maintenance.PasswordMaintenanceModel.Kind
import com.chromvoid.air.ui.maintenance.PasswordMaintenanceModel.Status
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class PasswordMaintenanceModelTest {
    private val store = FakeMaintenanceStore()

    private fun TestScope.model(kind: Kind = Kind.VAULT): PasswordMaintenanceModel =
        PasswordMaintenanceModel(kind, store, generation = 1uL, scope = modelScope())

    private fun PasswordMaintenanceModel.fill(
        current: String,
        replacement: String,
        confirmation: String = replacement,
    ) {
        change(Field.CURRENT, current)
        change(Field.NEW, replacement)
        change(Field.CONFIRMATION, confirmation)
    }

    @Test
    public fun `a vault password is changed and nothing is left on screen`(): Unit = runTest {
        val model = model()
        store.backupRecommended = true
        model.fill("old", "new")

        model.submit()
        advanceUntilIdle()

        assertEquals(1, store.vaultRekeys.size)
        assertEquals("old" to "new", store.vaultRekeys[0].currentPassword to store.vaultRekeys[0].newPassword)
        val state = model.state.value
        assertEquals(Status.DONE, state.status)
        assertTrue("a rekey that recommends a backup says so", state.backupRecommended)
        assertEquals("", state.current)
        assertEquals("", state.replacement)
        assertEquals("", state.confirmation)
    }

    @Test
    public fun `the administrative password uses its own command`(): Unit = runTest {
        val model = model(Kind.ADMINISTRATOR)
        model.fill("old", "new")

        model.submit()
        advanceUntilIdle()

        assertTrue(store.vaultRekeys.isEmpty())
        assertEquals("new", store.masterRekeys.single().newMasterPassword)
    }

    @Test
    public fun `an incomplete or repeated draft is refused without asking Core`(): Unit = runTest {
        val model = model()

        model.submit()
        advanceUntilIdle()
        assertEquals(Issue.CURRENT_REQUIRED, model.state.value.issue)

        model.change(Field.CURRENT, "old")
        model.submit()
        assertEquals(Issue.NEW_REQUIRED, model.state.value.issue)

        model.change(Field.NEW, "old")
        model.submit()
        assertEquals(Issue.SAME, model.state.value.issue)

        model.change(Field.NEW, "new")
        model.change(Field.CONFIRMATION, "different")
        model.submit()
        assertEquals(Issue.MISMATCH, model.state.value.issue)
        assertEquals(Field.CONFIRMATION, model.state.value.invalidField)

        assertTrue("nothing reached Core", store.vaultRekeys.isEmpty())
    }

    @Test
    public fun `a wrong current password is explained and the draft stays usable`(): Unit = runTest {
        val model = model()
        store.failWith = CoreRefusal("REKEY_INVALID_CURRENT_PASSWORD", "vault:rekey")
        model.fill("wrong", "new")

        model.submit()
        advanceUntilIdle()

        val state = model.state.value
        assertEquals(Status.EDITING, state.status)
        assertEquals(Issue.REAUTHENTICATION, state.issue)
        assertEquals(Field.CURRENT, state.invalidField)
        // The current password is not kept on screen after a refusal.
        assertEquals("", state.current)
        assertEquals("new", state.replacement)
    }

    @Test
    public fun `a rejected new password points at the field to change`(): Unit = runTest {
        val model = model()
        store.failWith = CoreRefusal("REKEY_PASSWORD_POLICY", "vault:rekey")
        model.fill("old", "short")

        model.submit()
        advanceUntilIdle()

        assertEquals(Issue.POLICY, model.state.value.issue)
        assertEquals(Field.NEW, model.state.value.invalidField)
    }

    @Test
    public fun `a change that could not be confirmed never offers another attempt`(): Unit = runTest {
        val model = model()
        store.failWith = CoreRefusal("INTERNAL", "vault:rekey")
        model.fill("old", "new")

        model.submit()
        advanceUntilIdle()

        val state = model.state.value
        assertEquals(Status.UNCERTAIN, state.status)
        assertEquals("", state.replacement)
        // Submitting again from an uncertain state would be a second write.
        model.submit()
        advanceUntilIdle()
        assertEquals(1, store.vaultRekeys.size)
    }

    @Test
    public fun `a lock leaves no password behind`(): Unit = runTest {
        val model = model()
        model.fill("old", "new")

        model.revoke()

        val state = model.state.value
        assertEquals(Status.REVOKED, state.status)
        assertEquals("", state.current)
        assertEquals("", state.replacement)
        assertEquals("", state.confirmation)
    }
}
