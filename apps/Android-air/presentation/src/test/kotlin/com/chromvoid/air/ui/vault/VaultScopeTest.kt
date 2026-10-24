package com.chromvoid.air.ui.vault

import com.chromvoid.air.ui.credentials.CredentialFormModel
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import com.chromvoid.air.ui.credentials.OfferedLogin
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class VaultScopeTest {
    private val store = FakeCredentialStore().apply {
        groups += listOf("/Personal", "/Work")
        entries += summary("mail", "Mail").copy(groupPath = "/Personal")
        entries += summary("git", "GitHub")
    }

    private fun TestScope.vault(): VaultScope = VaultScope(
        store,
        generation = 1uL,
        clipboard = FakeClipboard(),
        dispatcher = StandardTestDispatcher(testScheduler),
        searchDelayMillis = 0,
    ).also { advanceUntilIdle() }

    @Test
    public fun `a group opens as its own level and back returns below it`(): Unit = runTest {
        val vault = vault()

        vault.openGroup("/Personal")
        advanceUntilIdle()
        val top = vault.levels.value.last()
        assertEquals("/Personal", top.path)
        assertEquals(listOf("Mail"), top.catalog.state.value.entries.map { it.title })

        vault.closeGroup()
        assertEquals(listOf("/"), vault.levels.value.map { it.path })
    }

    @Test
    public fun `the vault root asks for the icons of the records it shows`(): Unit = runTest {
        val git = store.entries.indexOfFirst { it.id == "git" }
        store.entries[git] = store.entries[git].copy(iconRef = "sha256:git")

        val vault = vault()

        assertEquals(listOf(listOf("sha256:git")), store.iconRequests)
        assertTrue(vault.levels.value.single().catalog.icons === vault.icons)
    }

    @Test
    public fun `a record created inside a group lands in that group`(): Unit = runTest {
        val vault = vault()
        vault.openGroup("/Work")
        vault.beginCreate(CredentialFormModel.Kind.LOGIN)
        val form = checkNotNull(vault.form.value)

        form.change(CredentialFormModel.Field.TITLE, "Jira")
        form.save()
        advanceUntilIdle()

        assertEquals("/Work", store.creates.single().groupPath)
    }

    private fun offered(): OfferedLogin =
        OfferedLogin("token-1", "example.com", "alice@example.com", "typed-there", "https://example.com")

    @Test
    public fun `a login another app offered opens filled in the root and is saved with its site`(): Unit = runTest {
        val vault = vault()
        vault.openGroup("/Work")
        val answers = mutableListOf<Boolean>()

        assertTrue(vault.offerLogin(offered()) { answers += it })
        val form = checkNotNull(vault.form.value)
        assertTrue(form.isNew)
        assertEquals("example.com", form.state.value.value(CredentialFormModel.Field.TITLE))
        assertEquals("alice@example.com", form.state.value.value(CredentialFormModel.Field.USERNAME))
        assertTrue("an offered draft asks before it is thrown away", form.state.value.isDirty)

        form.save()
        advanceUntilIdle()

        val created = store.creates.single()
        assertEquals("typed-there", created.secrets.password)
        assertEquals(null, created.groupPath)
        assertTrue(created.urls.toString().contains("https://example.com"))
        assertEquals(listOf(true), answers)
    }

    @Test
    public fun `an offered login let go, or locked away, is answered as not saved - once`(): Unit = runTest {
        val vault = vault()
        val answers = mutableListOf<Boolean>()
        vault.offerLogin(offered()) { answers += it }
        vault.dismissForm()
        vault.discardForm()
        assertEquals(listOf(false), answers)

        vault.offerLogin(offered()) { answers += it }
        vault.close()
        assertEquals(listOf(false, false), answers)
        assertTrue(store.creates.isEmpty())
    }

    @Test
    public fun `an offer waits while another form is open`(): Unit = runTest {
        val vault = vault()
        vault.beginCreate(CredentialFormModel.Kind.LOGIN)
        assertEquals(false, vault.offerLogin(offered()) { })
    }

    @Test
    public fun `a generated password reaches the draft and is saved with it`(): Unit = runTest {
        val vault = vault()
        vault.open("mail")
        advanceUntilIdle()
        vault.beginEdit()
        advanceUntilIdle()

        vault.openGenerator()
        val generator = checkNotNull(vault.generator.value)
        generator.generate()
        advanceUntilIdle()
        generator.use()
        advanceUntilIdle()

        // The sheet closes and the draft holds the candidate; nothing is saved yet.
        assertNull(vault.generator.value)
        val form = checkNotNull(vault.form.value)
        assertEquals("generated-20", form.state.value.value(CredentialFormModel.Field.PASSWORD))
        assertTrue(store.secretWrites.isEmpty())

        form.save()
        advanceUntilIdle()
        assertEquals("generated-20", store.secrets["mail" to "password"])
    }

    @Test
    public fun `a move is chosen in Edit by browsing and keeps the record's id`(): Unit = runTest {
        val vault = vault()
        vault.open("mail")
        advanceUntilIdle()
        vault.beginEdit()
        advanceUntilIdle()

        vault.chooseGroup()
        advanceUntilIdle()
        val picker = checkNotNull(vault.picker.value)
        assertEquals("/Personal", picker.level.value.parent)
        picker.up()
        advanceUntilIdle()
        picker.open("/Work")
        advanceUntilIdle()
        vault.useGroup()
        advanceUntilIdle()
        assertNull(vault.picker.value)
        checkNotNull(vault.form.value).save()
        advanceUntilIdle()

        val moved = store.entries.single { it.id == "mail" }
        assertEquals("/Work", moved.groupPath)
        assertEquals("1", store.updates.single().revision)
        assertEquals("/Work", vault.detail.value?.state?.value?.detail?.groupPath)
    }
}
