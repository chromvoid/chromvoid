package com.chromvoid.air.ui.credentials

import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class GroupsModelTest {
    private val store = FakeCredentialStore().apply {
        groups += listOf("/Personal", "/Personal/Banks", "/Work")
        entries += summary("mail", "Mail").copy(groupPath = "/Personal")
        entries += summary("bank", "Bank").copy(groupPath = "/Personal/Banks")
    }

    private fun TestScope.groups(parent: String): GroupsModel =
        GroupsModel(parent, store, generation = 1uL, scope = modelScope()).also { advanceUntilIdle() }

    @Test
    public fun `a level lists its direct subgroups with their counts`(): Unit = runTest {
        val root = groups("/")
        assertEquals(listOf("/Personal", "/Work"), root.state.value.groups.map { it.path })

        val personal = groups("/Personal")
        assertEquals(listOf("/Personal/Banks" to 1L), personal.state.value.groups.map { it.path to it.entryCount })
    }

    @Test
    public fun `a new subgroup is created under the level it was asked from`(): Unit = runTest {
        val personal = groups("/Personal")

        personal.beginCreate()
        personal.save("  Travel ")
        advanceUntilIdle()

        assertTrue("/Personal/Travel" in store.groups)
        assertNull(personal.state.value.edit)
        assertTrue(personal.state.value.groups.any { it.path == "/Personal/Travel" })
    }

    @Test
    public fun `a name with a slash or a leading dot never reaches Core`(): Unit = runTest {
        val root = groups("/")
        root.beginCreate()

        root.save("a/b")
        root.save(".hidden")
        advanceUntilIdle()

        assertEquals(GroupsModel.Issue.NAME_INVALID, root.state.value.issue)
        assertEquals(setOf("/Personal", "/Personal/Banks", "/Work"), store.groups)
    }

    @Test
    public fun `a taken name keeps the list and the dialog`(): Unit = runTest {
        val root = groups("/")
        root.beginRename("/Work")

        root.save("Personal")
        advanceUntilIdle()

        assertEquals(GroupsModel.Issue.NAME_TAKEN, root.state.value.issue)
        assertEquals(GroupsModel.Edit.Rename("/Work"), root.state.value.edit)
        assertEquals(listOf("/Personal", "/Work"), root.state.value.groups.map { it.path })
    }

    @Test
    public fun `renaming a group updates its nested paths without changing record identities`(): Unit = runTest {
        val root = groups("/")

        root.beginRename("/Personal")
        root.save("Private")
        advanceUntilIdle()

        assertEquals(setOf("/Private", "/Private/Banks", "/Work"), store.groups)
        assertEquals(
            mapOf("mail" to "/Private", "bank" to "/Private/Banks"),
            store.entries.associate { it.id to it.groupPath },
        )
        assertNull(root.state.value.edit)
        assertEquals(listOf("/Private", "/Work"), root.state.value.groups.map { it.path })
    }

    @Test
    public fun `cancelling rename and delete keeps every group and record`(): Unit = runTest {
        val root = groups("/")
        val originalGroups = store.groups.toSet()
        val originalEntries = store.entries.toList()

        root.beginRename("/Personal")
        root.cancelEdit()
        root.save("Private")
        root.requestDelete("/Personal")
        root.cancelDelete()
        root.confirmDelete()
        advanceUntilIdle()

        assertNull(root.state.value.edit)
        assertNull(root.state.value.deleting)
        assertEquals(originalGroups, store.groups)
        assertEquals(originalEntries, store.entries)
    }

    @Test
    public fun `deleting a group takes what is nested with it, after a confirmation`(): Unit = runTest {
        val root = groups("/")

        root.requestDelete("/Personal")
        assertEquals("/Personal", root.state.value.deleting)
        root.confirmDelete()
        advanceUntilIdle()

        assertEquals(setOf("/Work"), store.groups)
        assertTrue(store.entries.isEmpty())
        assertEquals(listOf("/Work"), root.state.value.groups.map { it.path })
    }
}
