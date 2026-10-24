package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class GroupPickerModelTest {
    private val store = FakeCredentialStore().apply { groups += listOf("/Personal", "/Work") }

    @Test
    public fun `a new destination belongs to the browsed level and creates nothing`(): Unit = runTest {
        val picker = GroupPickerModel("/", store, 1uL, modelScope())
        picker.open("/Personal")
        advanceUntilIdle()

        picker.beginNewGroup()
        checkNotNull(picker.newGroup.value).input.setTextAndPlaceCursorAtEnd("  Travel  ")

        assertEquals("/Personal/Travel", picker.chooseNewGroup())
        assertEquals("/Personal", picker.level.value.parent)
        assertFalse("choosing a draft does not create its destination", "/Personal/Travel" in store.groups)
        assertTrue("the picker never calls group ensure", store.ensuredGroups.isEmpty())
        assertTrue(store.creates.isEmpty())
        assertTrue(store.updates.isEmpty())
        picker.close()
    }

    @Test
    public fun `a root destination has one separator and an empty name keeps the input open`(): Unit = runTest {
        val picker = GroupPickerModel("/", store, 1uL, modelScope())
        advanceUntilIdle()
        picker.beginNewGroup()
        checkNotNull(picker.newGroup.value).input.setTextAndPlaceCursorAtEnd("  ")

        assertNull(picker.chooseNewGroup())
        assertTrue(checkNotNull(picker.newGroup.value).invalid)

        checkNotNull(picker.newGroup.value).input.setTextAndPlaceCursorAtEnd("Travel")

        assertFalse(checkNotNull(picker.newGroup.value).invalid)
        assertEquals("/Travel", picker.chooseNewGroup())
        assertEquals(setOf("/Personal", "/Work"), store.groups)
        assertTrue(store.ensuredGroups.isEmpty())
        picker.close()
    }

    @Test
    public fun `cancelling a name or closing the picker discards only its pending destination`(): Unit = runTest {
        val picker = GroupPickerModel("/Personal", store, 1uL, modelScope())
        advanceUntilIdle()
        picker.beginNewGroup()
        checkNotNull(picker.newGroup.value).input.setTextAndPlaceCursorAtEnd("Travel")

        picker.cancelNewGroup()

        assertNull(picker.newGroup.value)
        assertNull(picker.chooseNewGroup())
        assertEquals("/Personal", picker.current)

        picker.beginNewGroup()
        checkNotNull(picker.newGroup.value).input.setTextAndPlaceCursorAtEnd("Receipts")
        picker.close()
        advanceUntilIdle()

        assertNull(picker.newGroup.value)
        assertEquals(setOf("/Personal", "/Work"), store.groups)
        assertTrue(store.ensuredGroups.isEmpty())
        assertTrue(store.creates.isEmpty())
    }

    @Test
    public fun `moving to another level clears the unfinished group name`(): Unit = runTest {
        val picker = GroupPickerModel("/Personal", store, 1uL, modelScope())
        advanceUntilIdle()
        picker.beginNewGroup()
        checkNotNull(picker.newGroup.value).input.setTextAndPlaceCursorAtEnd("Travel")

        picker.up()
        advanceUntilIdle()

        assertEquals("/", picker.level.value.parent)
        assertNull(picker.newGroup.value)
        assertEquals(setOf("/Personal", "/Work"), store.groups)
        assertTrue(store.ensuredGroups.isEmpty())
        picker.close()
    }
}
