package com.chromvoid.air.ui

import com.chromvoid.air.ui.credentials.CatalogModel
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import com.chromvoid.air.ui.maintenance.FakeMaintenanceStore
import com.chromvoid.air.ui.maintenance.MaintenanceAction
import com.chromvoid.air.ui.maintenance.MaintenanceRoute
import com.chromvoid.air.ui.maintenance.MaintenanceServices
import com.chromvoid.air.ui.maintenance.PasswordMaintenanceModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class ShellViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val clipboard = FakeClipboard()
    private val sessionState = MutableStateFlow<AirSessionState>(AirSessionState.Locked)
    private val sessionSequence = MutableStateFlow(0uL)
    private val sessionAdministration = MutableStateFlow<ULong?>(null)
    private val session = object : AccessSession {
        override val state: StateFlow<AirSessionState> = sessionState
        override val sequence: StateFlow<ULong> = sessionSequence
        override val administration: StateFlow<ULong?> = sessionAdministration

        override suspend fun refresh(): Unit = error("not used")

        override suspend fun setUpAdministrator(password: String, confirmation: String): AccessOutcome =
            error("not used")

        override suspend fun unlock(password: String): AccessOutcome = error("not used")

        override suspend fun lock(): Unit = error("not used")
    }

    @Before
    public fun setUp(): Unit = Dispatchers.setMain(dispatcher)

    @After
    public fun tearDown(): Unit = Dispatchers.resetMain()

    @Test
    public fun `a lock closes the vault and leaves nothing it read behind`(): Unit = runTest(dispatcher) {
        val shell = ShellViewModel(session, FakeCredentialStore(listOf(summary("a", "Mail"))), clipboard, dispatcher)
        advanceUntilIdle()
        assertNull("a locked session has no vault", shell.vault.value)

        sessionState.value = AirSessionState.Unlocked(generation = 1uL)
        advanceUntilIdle()
        val opened = checkNotNull(shell.vault.value)
        assertEquals(listOf("Mail"), opened.catalog.state.value.entries.map { it.title })
        opened.catalog.search("ma")
        opened.open("a")
        advanceUntilIdle()

        sessionState.value = AirSessionState.Locked
        advanceUntilIdle()
        assertNull(shell.vault.value)
        assertEquals(CatalogModel.Status.REVOKED, opened.catalog.state.value.status)
        assertTrue(opened.catalog.state.value.entries.isEmpty())
        assertEquals("", opened.catalog.state.value.query)
        assertNull("the open record is closed too", opened.detail.value)
        assertEquals("what was copied is taken back", 1, clipboard.clears)
    }

    @Test
    public fun `the AutoFill page belongs to one unlocked generation`(): Unit = runTest(dispatcher) {
        val store = com.chromvoid.air.ui.autofill.FakeAutoFillStore()
        val shell = ShellViewModel(session, FakeCredentialStore(), clipboard, dispatcher, autoFillStore = store)
        assertTrue(shell.offersAutoFill)
        shell.openAutoFill()
        assertNull("a locked session has no AutoFill page", shell.autoFill.value)

        sessionState.value = AirSessionState.Unlocked(generation = 3uL)
        advanceUntilIdle()
        shell.openAutoFill()
        val page = checkNotNull(shell.autoFill.value)
        assertEquals(3uL, page.generation)

        sessionState.value = AirSessionState.Locked
        advanceUntilIdle()
        assertNull(shell.autoFill.value)
        assertEquals(
            com.chromvoid.air.ui.autofill.AutoFillModel.Phase.REVOKED,
            page.state.value.phase,
        )
        assertFalse(ShellViewModel(session, FakeCredentialStore(), clipboard, dispatcher).offersAutoFill)
    }

    private class Offers : com.chromvoid.air.ui.credentials.OfferedLogins {
        val finished = mutableListOf<Pair<String, Boolean>>()
        override val waiting = MutableStateFlow<String?>(null)

        fun offer(token: String) {
            waiting.value = token
        }

        override fun take(token: String) {
            waiting.compareAndSet(token, null)
        }

        override suspend fun read(token: String): com.chromvoid.air.ui.credentials.OfferedLogin? =
            if (token.startsWith("token")) {
                com.chromvoid.air.ui.credentials.OfferedLogin(
                    token,
                    "example.com",
                    "alice",
                    "pw",
                    "https://example.com",
                )
            } else {
                null
            }

        override suspend fun finish(token: String, saved: Boolean) {
            finished += token to saved
        }
    }

    @Test
    public fun `an offered login waits for the unlock, then opens in the vault`(): Unit = runTest(dispatcher) {
        val offers = Offers()
        val shell = ShellViewModel(session, FakeCredentialStore(), clipboard, dispatcher, offeredLogins = offers)
        offers.offer("expired")
        advanceUntilIdle()
        assertNull("an answered or expired offer is nothing", shell.pendingLogin.value)
        assertNull("the shell took it", offers.waiting.value)

        offers.offer("token-1")
        advanceUntilIdle()
        assertEquals("example.com", shell.pendingLogin.value?.title)

        sessionState.value = AirSessionState.Unlocked(generation = 1uL)
        advanceUntilIdle()
        assertNull(shell.pendingLogin.value)
        assertEquals(com.chromvoid.air.ui.root.AirRoot.VAULT, shell.rootRequest.value)
        val form = checkNotNull(shell.vault.value?.form?.value)
        val username = com.chromvoid.air.ui.credentials.CredentialFormModel.Field.USERNAME
        assertEquals("alice", form.state.value.value(username))

        shell.vault.value?.discardForm()
        advanceUntilIdle()
        assertEquals(listOf("token-1" to false), offers.finished)
    }

    @Test
    public fun `a waiting login let go from the lock screen ends its offer`(): Unit = runTest(dispatcher) {
        val offers = Offers()
        val shell = ShellViewModel(session, FakeCredentialStore(), clipboard, dispatcher, offeredLogins = offers)
        offers.offer("token-1")
        advanceUntilIdle()
        offers.offer("token-2")
        advanceUntilIdle()
        assertEquals("a newer offer replaces the waiting one", listOf("token-1" to false), offers.finished)

        shell.discardLogin()
        advanceUntilIdle()
        assertNull(shell.pendingLogin.value)
        assertEquals(listOf("token-1" to false, "token-2" to false), offers.finished)
    }

    @Test
    public fun `a new unlock gets a new vault, never the previous one`(): Unit = runTest(dispatcher) {
        val shell = ShellViewModel(session, FakeCredentialStore(), clipboard, dispatcher)
        sessionState.value = AirSessionState.Unlocked(generation = 1uL)
        advanceUntilIdle()
        val first = checkNotNull(shell.vault.value)

        sessionState.value = AirSessionState.Unlocked(generation = 2uL)
        advanceUntilIdle()
        val second = checkNotNull(shell.vault.value)

        assertNotSame(first, second)
        assertEquals(2uL, second.generation)
        assertEquals(CatalogModel.Status.REVOKED, first.catalog.state.value.status)
    }

    @Test
    public fun `Files follows the unlocked generation and a lock drops what it listed`(): Unit = runTest(dispatcher) {
        val store = com.chromvoid.air.ui.files.FakeFileStore().apply { file("Scan.pdf") }
        val shell = ShellViewModel(
            session,
            FakeCredentialStore(),
            clipboard,
            dispatcher,
            fileStore = store,
            fileSettings = com.chromvoid.air.ui.files.FileSettings(com.chromvoid.air.ui.files.MemoryFilePreferences()),
        )
        advanceUntilIdle()
        assertTrue(shell.offersFiles)
        assertNull(shell.files.value)

        sessionState.value = AirSessionState.Unlocked(generation = 1uL)
        advanceUntilIdle()
        val files = checkNotNull(shell.files.value)
        val root = files.top
        assertEquals(listOf("Scan.pdf"), root.state.value.items.map { it.name })

        store.file("Taxes.pdf")
        sessionSequence.value = 3uL
        advanceUntilIdle()
        assertEquals(listOf("Scan.pdf", "Taxes.pdf"), root.state.value.items.map { it.name })

        sessionState.value = AirSessionState.Locked
        advanceUntilIdle()
        assertNull(shell.files.value)
        assertEquals(com.chromvoid.air.ui.files.FolderModel.Status.REVOKED, root.state.value.status)
        assertTrue(root.state.value.items.isEmpty())
    }

    @Test
    public fun `a change in the vault makes the catalog read again`(): Unit = runTest(dispatcher) {
        val store = FakeCredentialStore(listOf(summary("a", "Mail")))
        val shell = ShellViewModel(session, store, clipboard, dispatcher)
        sessionState.value = AirSessionState.Unlocked(generation = 1uL)
        advanceUntilIdle()
        val vault = checkNotNull(shell.vault.value)
        store.entries += summary("b", "Bank")

        sessionSequence.value = 7uL
        advanceUntilIdle()

        assertEquals(listOf("Mail", "Bank"), vault.catalog.state.value.entries.map { it.title })
    }

    @Test
    public fun `administration follows its own generation, locked as well as open`(): Unit = runTest(dispatcher) {
        val passwords = FakeMaintenanceStore()
        val shell = ShellViewModel(
            session,
            FakeCredentialStore(),
            clipboard,
            dispatcher,
            maintenanceServices = MaintenanceServices(passwords = passwords),
        )
        advanceUntilIdle()
        assertNull("nothing is administered before Core admits it", shell.maintenance.value)

        sessionAdministration.value = 4uL
        advanceUntilIdle()
        val locked = checkNotNull(shell.maintenance.value)
        assertEquals(4uL, locked.generation)
        assertTrue(
            "the administrative password needs no open vault",
            locked.offers(MaintenanceAction.ADMINISTRATOR_PASSWORD),
        )
        assertFalse("the vault password does", locked.offers(MaintenanceAction.VAULT_PASSWORD))
        locked.open(MaintenanceAction.ADMINISTRATOR_PASSWORD)
        val change = (locked.route.value as MaintenanceRoute.Password).model
        change.change(PasswordMaintenanceModel.Field.CURRENT, "old")

        sessionState.value = AirSessionState.Unlocked(generation = 5uL)
        sessionAdministration.value = 5uL
        advanceUntilIdle()
        val open = checkNotNull(shell.maintenance.value)
        assertNotSame(locked, open)
        assertNull("the previous generation's screen is gone", locked.route.value)
        assertEquals(PasswordMaintenanceModel.Status.REVOKED, change.state.value.status)
        assertEquals("", change.state.value.current)
        assertTrue(open.offers(MaintenanceAction.VAULT_PASSWORD))

        sessionAdministration.value = null
        advanceUntilIdle()
        assertNull("leaving the foreground or failing ends administration", shell.maintenance.value)
    }
}
