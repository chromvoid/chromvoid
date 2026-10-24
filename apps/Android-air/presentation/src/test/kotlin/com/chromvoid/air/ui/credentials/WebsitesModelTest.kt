package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.CredentialWebsiteRule
import com.chromvoid.air.ui.credentials.CredentialFormModel.Field
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import com.chromvoid.air.ui.vault.VaultScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class WebsitesModelTest {
    private val store = FakeCredentialStore(listOf(summary("mail", "Mail")))
    private val saved = mutableListOf<List<CredentialWebsiteRule>>()

    private fun TestScope.editor(entryId: String?): WebsitesModel =
        WebsitesModel(store, 1uL, modelScope(), entryId) { saved += it }.also { advanceUntilIdle() }

    @Test
    public fun `rules for a saved record are stored under the revision they were read with`(): Unit = runTest {
        store.websiteRules["mail"] = listOf(CredentialWebsiteRule("base_domain", 0, "mail.example"))
        val model = editor("mail")
        assertEquals(listOf("mail.example"), model.state.value.rows.map { it.value })

        model.add()
        val row = model.state.value.rows.last().id
        model.change(row, value = "login.example", mode = "host")
        model.save()
        advanceUntilIdle()

        assertEquals(WebsitesModel.Status.SAVED, model.state.value.status)
        assertEquals(listOf("mail.example" to "base_domain", "login.example" to "host"),
            store.websiteRules.getValue("mail").map { it.value to it.matchMode })
        assertEquals(1, saved.size)
    }

    @Test
    public fun `Core's errors point at their rows and nothing is stored`(): Unit = runTest {
        val model = editor("mail")
        model.add()
        model.add()
        val (first, second) = model.state.value.rows.map { it.id }
        model.change(first, value = "not a site")
        model.change(second, value = "ok.example")

        model.save()
        advanceUntilIdle()

        assertEquals(WebsitesModel.Status.EDITING, model.state.value.status)
        assertEquals(mapOf(first to "invalid_url"), model.state.value.errors)
        assertNull(store.websiteRules["mail"])
    }

    @Test
    public fun `rules changed elsewhere are not overwritten`(): Unit = runTest {
        val model = editor("mail")
        store.websiteRevisions["mail"] = 5
        model.add()
        model.change(model.state.value.rows.single().id, value = "mail.example")

        model.save()
        advanceUntilIdle()

        assertEquals(WebsitesModel.Status.NEEDS_RELOAD, model.state.value.status)
        assertTrue(saved.isEmpty())
    }

    @Test
    public fun `order can change, and a changed list asks before it is discarded`(): Unit = runTest {
        val model = editor(null)
        assertTrue(model.requestDismiss())
        model.add()
        model.add()
        val (first, second) = model.state.value.rows.map { it.id }
        model.change(first, value = "a.example")
        model.change(second, value = "b.example")

        model.moveUp(second)
        assertEquals(listOf("b.example", "a.example"), model.state.value.rows.map { it.value })
        assertFalse(model.requestDismiss())
        assertTrue(model.state.value.confirmingDiscard)
    }

    @Test
    public fun `a refused vault says so and keeps the rows`(): Unit = runTest {
        val model = editor(null)
        model.add()
        model.change(model.state.value.rows.single().id, value = "a.example")
        store.failWith = CoreRefusal("ACCESS_DENIED", "passmanager:entry:websites:validate")

        model.save()
        advanceUntilIdle()

        assertEquals(WebsitesModel.Issue.DENIED, model.state.value.issue)
        assertEquals(1, model.state.value.rows.size)
    }

    @Test
    public fun `a new login is created with the websites Core validated`(): Unit = runTest {
        val vault = VaultScope(store, 1uL, FakeClipboard(), StandardTestDispatcher(testScheduler), 0)
        vault.beginCreate(CredentialFormModel.Kind.LOGIN)
        val form = vault.form.value!!
        form.change(Field.TITLE, "Git")

        vault.openWebsites()
        val editor = vault.websites.value!!
        editor.add()
        editor.change(editor.state.value.rows.single().id, value = "github.com", mode = "host")
        editor.save()
        advanceUntilIdle()
        assertNull("the editor closes once Core accepts the rules", vault.websites.value)
        assertEquals(listOf("github.com"), form.state.value.websites.map { it.value })

        form.save()
        advanceUntilIdle()

        val urls = store.creates.single().urls as JsonArray
        val rule = urls.single().jsonObject
        assertEquals("github.com" to "host", rule.getValue("value").jsonPrimitive.content to
            rule.getValue("match").jsonPrimitive.content)
        vault.close()
    }
}
