package com.chromvoid.air.ui.credentials

import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class TagsModelTest {
    private val store = FakeCredentialStore(listOf(summary("mail", "Mail"), summary("bank", "Bank"))).apply {
        tags["work"] = "Work" to "blue"
        tags["home"] = "Home" to "green"
        entryTags["mail"] = setOf("work")
    }

    private fun TestScope.tags(): TagsModel =
        TagsModel(store, generation = 1uL, scope = modelScope()).also { advanceUntilIdle() }

    @Test
    public fun `the catalog lists every tag with its colour and count`(): Unit = runTest {
        val state = tags().state.value
        assertEquals(listOf("Work" to 1L, "Home" to 0L), state.tags.map { it.label to it.count })
        assertEquals("blue", state.tags.first().colorID)
    }

    @Test
    public fun `a rename keeps the key, so its records keep the tag`(): Unit = runTest {
        val model = tags()
        model.beginChange(model.state.value.tags.first())

        model.save("Office", "amber")
        advanceUntilIdle()

        val work = model.state.value.tags.single { it.key == "work" }
        assertEquals("Office" to "amber", work.label to work.colorID)
        assertEquals(1L, work.count)
    }

    @Test
    public fun `a taken name keeps the dialog and the catalog`(): Unit = runTest {
        val model = tags()
        model.beginCreate()

        model.save("Home", "violet")
        advanceUntilIdle()

        assertEquals(TagsModel.Issue.NAME_TAKEN, model.state.value.issue)
        assertEquals(TagsModel.Edit.Create, model.state.value.edit)
        assertEquals(2, model.state.value.tags.size)
    }

    @Test
    public fun `a colour Core does not know never reaches it`(): Unit = runTest {
        val model = tags()
        model.beginCreate()

        model.save("Travel", "black")
        advanceUntilIdle()

        assertEquals(TagsModel.Issue.NAME_INVALID, model.state.value.issue)
        assertEquals(2, store.tags.size)
    }

    @Test
    public fun `deleting a tag takes it off its records and out of a choice`(): Unit = runTest {
        val work = tags().state.value.tags.first()
        val model = TagsModel(store, generation = 1uL, scope = modelScope(), initialSelection = listOf(work))
        advanceUntilIdle()

        model.requestDelete(work)
        model.confirmDelete()
        advanceUntilIdle()

        assertTrue(store.entryTags.getValue("mail").isEmpty())
        assertTrue(model.state.value.selected.isEmpty())
    }
}
