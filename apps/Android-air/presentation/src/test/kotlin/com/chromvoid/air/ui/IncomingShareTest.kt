package com.chromvoid.air.ui

import android.net.Uri
import com.chromvoid.air.bridge.wire.PassmanagerRootImportPreview
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.files.FakeFileStore
import com.chromvoid.air.ui.files.FileDestination
import com.chromvoid.air.ui.files.FileDevice
import com.chromvoid.air.ui.files.FileImportModel
import com.chromvoid.air.ui.files.FileSettings
import com.chromvoid.air.ui.files.FileSource
import com.chromvoid.air.ui.files.IncomingShareModel
import com.chromvoid.air.ui.files.MemoryFilePreferences
import com.chromvoid.air.ui.files.MemorySource
import com.chromvoid.air.ui.root.AirRoot
import com.chromvoid.air.ui.transfer.CredentialImportModel
import com.chromvoid.air.ui.transfer.ImportSource
import com.chromvoid.air.ui.transfer.TransferMode
import java.io.ByteArrayInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Routes A30 and A43: files shared from another app, locked or open, saved, cancelled or sent to Passwords. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
public class IncomingShareTest {
    private val dispatcher = StandardTestDispatcher()
    private val sessionState = MutableStateFlow<AirSessionState>(AirSessionState.Locked)
    private val session = object : AccessSession {
        override val state: StateFlow<AirSessionState> = sessionState
        override val sequence: StateFlow<ULong> = MutableStateFlow(0uL)
        override val administration: StateFlow<ULong?> = MutableStateFlow(null)

        override suspend fun refresh(): Unit = error("not used")

        override suspend fun setUpAdministrator(password: String, confirmation: String): AccessOutcome =
            error("not used")

        override suspend fun unlock(password: String): AccessOutcome = error("not used")

        override suspend fun lock(): Unit = error("not used")
    }

    private val shared = mutableMapOf<Uri, MemorySource>()
    private val device = object : FileDevice {
        override fun source(document: Uri): FileSource = shared.getValue(document)

        override fun openImageNow(document: Uri): FileSource? = null

        override fun destination(document: Uri): FileDestination = error("not used")

        override fun destination(folder: Uri, name: String, mimeType: String?): FileDestination = error("not used")

        override fun gallery(name: String, mimeType: String?): FileDestination? = null
    }
    private val store = FakeFileStore()
    private val credentials = FakeCredentialStore().apply {
        importFiles["export.csv"] = PassmanagerRootImportPreview(
            entryCount = 4,
            folderCount = 1,
            mode = "merge",
            revision = "r1",
            sshKeyCount = 0,
        )
    }

    @Before
    public fun setUp(): Unit = Dispatchers.setMain(dispatcher)

    @After
    public fun tearDown(): Unit = Dispatchers.resetMain()

    private fun document(name: String, mimeType: String = "text/plain"): Uri =
        Uri.parse("content://sharing.app/$name")
            .also { shared[it] = MemorySource(name, name.encodeToByteArray(), mimeType) }

    private fun TestScope.shell(): ShellViewModel = ShellViewModel(
        session,
        credentials,
        FakeClipboard(),
        dispatcher,
        fileStore = store,
        fileSettings = FileSettings(MemoryFilePreferences()),
        fileDevice = device,
        credentialSources = { document ->
            object : ImportSource {
                override val name = document.lastPathSegment.orEmpty()

                override fun open() = ByteArrayInputStream(ByteArray(8))
            }
        },
    ).also { advanceUntilIdle() }

    private fun ShellViewModel.incoming(): IncomingShareModel? = files.value?.incoming?.value

    @Test
    public fun `a share while locked waits in memory and opens for review after the unlock`(): Unit =
        runTest(dispatcher) {
            val shell = shell()
            shell.receiveShare(listOf(document("notes.txt"), document("beach.png", "image/png")))
            advanceUntilIdle()
            assertEquals(2, shell.pendingShare.value?.size)
            assertTrue(store.calls.isEmpty())

            sessionState.value = AirSessionState.Unlocked(generation = 1uL)
            advanceUntilIdle()
            val incoming = checkNotNull(shell.incoming())
            assertNull(shell.pendingShare.value)
            assertEquals(listOf("notes.txt", "beach.png"), incoming.state.value.names)
            assertEquals("/", incoming.state.value.destination)
            assertFalse(incoming.offersCredentials)

            incoming.save()
            advanceUntilIdle()
            val import = incoming.import.value!!
            assertEquals(FileImportModel.Phase.FINISHED, import.state.value.phase)
            assertEquals(
                listOf("beach.png", "notes.txt"),
                store.nodes.filter { it.parent == "/" }.map { it.name }.sorted(),
            )
            assertTrue(shared.values.all { it.closed })

            shell.files.value!!.closeIncoming()
            assertNull(shell.incoming())
        }

    @Test
    public fun `the files go into a folder chosen by browsing`(): Unit = runTest(dispatcher) {
        store.folder("Inbox")
        val shell = shell()
        sessionState.value = AirSessionState.Unlocked(generation = 1uL)
        advanceUntilIdle()
        shell.receiveShare(listOf(document("receipt.pdf", "application/pdf")))
        val incoming = shell.incoming()!!

        incoming.chooseDestination()
        val chooser = incoming.chooser.value!!
        advanceUntilIdle()
        chooser.openFolder(chooser.folders.value.last().state.value.items.single { it.name == "Inbox" })
        advanceUntilIdle()
        chooser.select()
        assertNull(incoming.chooser.value)
        assertEquals("/Inbox", incoming.state.value.destination)

        incoming.save()
        advanceUntilIdle()
        assertEquals("/Inbox", store.named("receipt.pdf").parent)
    }

    @Test
    public fun `Cancel stores nothing, and a lock drops a share under review`(): Unit = runTest(dispatcher) {
        val shell = shell()
        sessionState.value = AirSessionState.Unlocked(generation = 1uL)
        advanceUntilIdle()
        val first = document("a.txt")
        shell.receiveShare(listOf(first))
        shell.files.value!!.closeIncoming()
        advanceUntilIdle()
        assertNull(shell.incoming())
        assertTrue(shared.getValue(first).closed)

        val second = document("b.txt")
        shell.receiveShare(listOf(second))
        sessionState.value = AirSessionState.Locked
        advanceUntilIdle()
        assertNull(shell.files.value)
        assertTrue(shared.getValue(second).closed)
        assertTrue(store.nodes.isEmpty())

        // The share went with the session: an unlock does not bring it back.
        sessionState.value = AirSessionState.Unlocked(generation = 2uL)
        advanceUntilIdle()
        assertNull(shell.incoming())
    }

    @Test
    public fun `a waiting share can be let go, and a newer one replaces one under review`(): Unit =
        runTest(dispatcher) {
            val shell = shell()
            shell.receiveShare(listOf(document("old.txt")))
            shell.discardShare()
            sessionState.value = AirSessionState.Unlocked(generation = 1uL)
            advanceUntilIdle()
            assertNull(shell.incoming())

            val replaced = document("first.txt")
            shell.receiveShare(listOf(replaced))
            shell.receiveShare(listOf(document("second.txt")))
            advanceUntilIdle()
            assertEquals(listOf("second.txt"), shell.incoming()!!.state.value.names)
            assertTrue(shared.getValue(replaced).closed)
        }

    @Test
    public fun `a share without files has nothing to save`(): Unit = runTest(dispatcher) {
        val shell = shell()
        sessionState.value = AirSessionState.Unlocked(generation = 1uL)
        advanceUntilIdle()
        shell.receiveShare(emptyList())
        val incoming = shell.incoming()!!

        incoming.save()
        advanceUntilIdle()
        assertTrue(incoming.state.value.names.isEmpty())
        assertNull(incoming.import.value)
    }

    @Test
    public fun `one credential export can go to the Passwords import, which reviews it`(): Unit =
        runTest(dispatcher) {
            val shell = shell()
            sessionState.value = AirSessionState.Unlocked(generation = 1uL)
            advanceUntilIdle()
            shell.receiveShare(listOf(document("export.csv", "text/csv")))
            val incoming = shell.incoming()!!
            assertTrue(incoming.offersCredentials)

            incoming.importCredentials()
            advanceUntilIdle()

            assertNull(shell.incoming())
            assertEquals(AirRoot.VAULT, shell.rootRequest.value)
            val tools = shell.vault.value!!.transfers.value!!
            assertEquals(TransferMode.IMPORT, tools.mode)
            assertEquals(CredentialImportModel.Status.REVIEW, tools.import.state.value.status)
            assertEquals("export.csv", tools.import.state.value.filename)
            assertTrue(store.nodes.isEmpty())
            shell.rootRequestHandled()
            assertNull(shell.rootRequest.value)
        }

    @Test
    public fun `the Passwords import is offered only for one file that looks like an export`() {
        assertTrue(IncomingShareModel.isCredentialExport("vault.KDBX"))
        assertTrue(IncomingShareModel.isCredentialExport("1password.1pux"))
        assertFalse(IncomingShareModel.isCredentialExport("photo.jpg"))
    }
}
