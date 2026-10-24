package com.chromvoid.air.ui.files

import com.chromvoid.air.bridge.CoreRefusal
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class NoteCreationDeniedTest {
    @Test
    public fun `a denied note save is a known refusal and keeps the draft`(): Unit = runTest {
        val store = FakeFileStore()
        val note = NoteCreationModel(store, "/", 1uL, this)
        note.setName("Packing")
        note.setText("Passport")
        store.failNext = CoreRefusal("ACCESS_DENIED", "file_create_note")

        note.save()
        advanceUntilIdle()

        assertEquals(FileIssue.DENIED, note.state.value.refusal)
        assertEquals(NoteCreationModel.Phase.EDITING, note.state.value.phase)
        assertEquals("Packing", note.state.value.name)
        assertEquals("Passport", note.state.value.text)
        assertEquals(1, note.state.value.attempts)
        assertTrue(store.nodes.isEmpty())
    }
}
