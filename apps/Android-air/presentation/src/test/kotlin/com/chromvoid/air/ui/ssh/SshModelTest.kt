package com.chromvoid.air.ui.ssh

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.SSHKeyMetadata
import com.chromvoid.air.ui.credentials.CREDENTIAL_PAGE_SIZE
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.credentials.modelScope
import com.chromvoid.air.ui.ssh.SshCreationModel.Field
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class SshModelTest {
    private val store = FakeCredentialStore()
    private val clipboard = FakeClipboard()

    private fun TestScope.keys(): SshModel =
        SshModel(store, generation = 1uL, scope = modelScope(), clipboard = clipboard).also { advanceUntilIdle() }

    private fun TestScope.generate(model: SshModel, name: String, algorithm: SshCreationModel.Algorithm) {
        model.beginCreation()
        val form = model.creation.value!!
        form.change(Field.NAME, name)
        form.setAlgorithm(algorithm)
        form.submit()
        advanceUntilIdle()
    }

    @Test
    public fun `a generated key closes the form and appears in the list`(): Unit = runTest {
        val model = keys()
        assertTrue(model.state.value.keys.isEmpty())

        generate(model, "Server", SshCreationModel.Algorithm.ED25519)

        assertNull(model.creation.value)
        assertEquals(listOf("Server"), model.state.value.keys.map { it.key.name })
    }

    @Test
    public fun `the list narrows by type and by name`(): Unit = runTest {
        val model = keys()
        generate(model, "Server", SshCreationModel.Algorithm.ED25519)
        generate(model, "Legacy", SshCreationModel.Algorithm.RSA)

        model.setKeyType(SshModel.KeyType.RSA)
        advanceUntilIdle()
        assertEquals(listOf("Legacy"), model.state.value.keys.map { it.key.name })

        model.setKeyType(SshModel.KeyType.ALL)
        model.search("serv")
        advanceUntilIdle()
        assertEquals(listOf("Server"), model.state.value.keys.map { it.key.name })
    }

    @Test
    public fun `clearing an unmatched search and key type restores the collection`(): Unit = runTest {
        val model = keys()
        assertFalse(model.state.value.hasFilters)
        generate(model, "Server", SshCreationModel.Algorithm.ED25519)

        model.search("Missing")
        model.setKeyType(SshModel.KeyType.RSA)
        advanceUntilIdle()

        assertEquals(SshModel.Status.READY, model.state.value.status)
        assertTrue(model.state.value.keys.isEmpty())
        assertTrue(model.state.value.hasFilters)

        model.clearFilters()
        advanceUntilIdle()

        assertEquals("", model.state.value.query)
        assertEquals(SshModel.KeyType.ALL, model.state.value.keyType)
        assertFalse(model.state.value.hasFilters)
        assertEquals(listOf("Server"), model.state.value.keys.map { it.key.name })
        assertNull(model.creation.value)
    }

    @Test
    public fun `an unmatched key type remains a filtered result until cleared`(): Unit = runTest {
        val model = keys()
        generate(model, "Server", SshCreationModel.Algorithm.ED25519)

        model.setKeyType(SshModel.KeyType.RSA)
        advanceUntilIdle()

        assertEquals("", model.state.value.query)
        assertEquals(SshModel.Status.READY, model.state.value.status)
        assertTrue(model.state.value.keys.isEmpty())
        assertTrue(model.state.value.hasFilters)

        model.clearFilters()
        advanceUntilIdle()

        assertEquals(listOf("Server"), model.state.value.keys.map { it.key.name })
    }

    @Test
    public fun `stale and failed reads preserve filters for a successful reload`(): Unit = runTest {
        val model = keys()
        generate(model, "Server", SshCreationModel.Algorithm.ED25519)
        model.search("Server")
        model.setKeyType(SshModel.KeyType.ED25519)
        advanceUntilIdle()
        store.failWith = CoreRefusal("SYNC_CONFLICT", "passmanager:ssh:page")

        model.reload()
        advanceUntilIdle()

        assertEquals(SshModel.Status.STALE, model.state.value.status)
        assertTrue(model.state.value.keys.isEmpty())
        assertFalse(model.state.value.canLoadMore)
        assertEquals("Server", model.state.value.query)
        assertEquals(SshModel.KeyType.ED25519, model.state.value.keyType)

        store.failWith = CoreRefusal("INTERNAL", "passmanager:ssh:page")
        model.reload()
        advanceUntilIdle()

        assertEquals(SshModel.Status.FAILED, model.state.value.status)
        assertEquals("Server", model.state.value.query)
        assertEquals(SshModel.KeyType.ED25519, model.state.value.keyType)

        store.failWith = null
        model.reload()
        advanceUntilIdle()

        assertEquals(SshModel.Status.READY, model.state.value.status)
        assertEquals(listOf("Server"), model.state.value.keys.map { it.key.name })
    }

    @Test
    public fun `a collection changed between pages becomes stale until reloaded`(): Unit = runTest {
        repeat(CREDENTIAL_PAGE_SIZE.toInt() + 1) { index ->
            val id = "key-$index"
            store.sshKeys[id] = SSHKeyMetadata(
                comment = null,
                fingerprint = "SHA256:$id",
                id = id,
                name = "Server $index",
                type = "ed25519",
            )
        }
        val model = keys()
        assertTrue(model.state.value.canLoadMore)
        store.sshRevision += 1

        model.loadMore()
        advanceUntilIdle()

        assertEquals(SshModel.Status.STALE, model.state.value.status)
        assertTrue(model.state.value.keys.isEmpty())

        model.reload()
        advanceUntilIdle()

        assertEquals(SshModel.Status.READY, model.state.value.status)
        assertEquals(CREDENTIAL_PAGE_SIZE.toInt(), model.state.value.keys.size)
    }

    @Test
    public fun `clearing filters cannot revive a revoked collection`(): Unit = runTest {
        val model = keys()
        model.search("Server")
        advanceUntilIdle()
        model.close()

        model.clearFilters()
        advanceUntilIdle()

        assertEquals(SshModel.Status.REVOKED, model.state.value.status)
        assertFalse(model.state.value.hasFilters)
    }

    @Test
    public fun `an import needs key text and a refused key keeps the form`(): Unit = runTest {
        val model = keys()
        model.beginCreation()
        val form = model.creation.value!!
        form.setMode(SshCreationModel.Mode.IMPORT)

        form.submit()
        assertEquals(SshCreationModel.Issue.KEY_REQUIRED, form.state.value.issue)

        form.change(Field.PRIVATE_KEY, "not a key")
        form.submit()
        advanceUntilIdle()

        assertEquals(SshCreationModel.Issue.REFUSED, form.state.value.issue)
        assertEquals(SshCreationModel.Status.EDITING, form.state.value.status)
        assertEquals("not a key", form.state.value.value(Field.PRIVATE_KEY))
    }

    @Test
    public fun `an oversized file is refused before Core and a pasted key imports`(): Unit = runTest {
        val model = keys()
        model.beginCreation()
        val form = model.creation.value!!
        form.setMode(SshCreationModel.Mode.IMPORT)

        form.fileRead(null)
        assertEquals(SshCreationModel.Issue.FILE_UNREADABLE, form.state.value.issue)

        form.fileRead("-----BEGIN OPENSSH PRIVATE KEY-----\nabc")
        form.change(Field.NAME, "Laptop")
        form.submit()
        advanceUntilIdle()

        assertEquals(listOf("Laptop"), model.state.value.keys.map { it.key.name })
    }

    @Test
    public fun `a save with an unknown outcome drops the key text and does not retry`(): Unit = runTest {
        val model = keys()
        model.beginCreation()
        val form = model.creation.value!!
        form.setMode(SshCreationModel.Mode.IMPORT)
        form.change(Field.PRIVATE_KEY, "-----BEGIN OPENSSH PRIVATE KEY-----")
        store.failWith = CoreRefusal("INTERNAL", "passmanager:ssh:key:import")

        form.submit()
        advanceUntilIdle()

        assertEquals(SshCreationModel.Status.UNCERTAIN, form.state.value.status)
        assertEquals("", form.state.value.value(Field.PRIVATE_KEY))
        form.submit()
        assertEquals(SshCreationModel.Status.UNCERTAIN, form.state.value.status)
    }

    @Test
    public fun `a filled form asks before it is discarded`(): Unit = runTest {
        val model = keys()
        model.beginCreation()
        val form = model.creation.value!!
        assertTrue(form.requestClose())

        form.change(Field.NAME, "Server")
        assertFalse(form.requestClose())
        assertTrue(form.state.value.confirmingDiscard)
    }

    @Test
    public fun `a key is renamed under its revision and deleted after a confirmation`(): Unit = runTest {
        val model = keys()
        generate(model, "Server", SshCreationModel.Algorithm.ED25519)
        val id = model.state.value.keys.single().key.id
        model.select(id)
        val detail = model.selected.value!!

        detail.beginEdit()
        detail.changeName("Production")
        detail.save()
        advanceUntilIdle()
        assertEquals("Production", detail.state.value.row?.key?.name)
        assertFalse(detail.state.value.editing)

        detail.requestDelete()
        detail.confirmDelete()
        advanceUntilIdle()

        assertNull(model.selected.value)
        assertTrue(model.state.value.keys.isEmpty())
    }

    @Test
    public fun `a rename of a key changed elsewhere is not applied`(): Unit = runTest {
        val model = keys()
        generate(model, "Server", SshCreationModel.Algorithm.ED25519)
        val id = model.state.value.keys.single().key.id
        model.select(id)
        val detail = model.selected.value!!
        store.sshKeys[id] = store.sshKeys.getValue(id).copy(comment = "changed elsewhere")

        detail.beginEdit()
        detail.changeName("Production")
        detail.save()
        advanceUntilIdle()

        assertEquals(SshDetailModel.Issue.UNCERTAIN, detail.state.value.issue)
        assertEquals("Server", store.sshKeys.getValue(id).name)
    }

    @Test
    public fun `the public key is copied as ordinary text`(): Unit = runTest {
        val model = keys()
        generate(model, "Server", SshCreationModel.Algorithm.ED25519)
        model.select(model.state.value.keys.single().key.id)
        val detail = model.selected.value!!

        detail.copyPublicKey()
        advanceUntilIdle()

        assertEquals(listOf("ssh-ed25519 AAAA ssh-1" to false), clipboard.copies)
    }

    @Test
    public fun `a private key without a passphrase is saved only after a warning`(): Unit = runTest {
        val model = keys()
        generate(model, "Server", SshCreationModel.Algorithm.ED25519)
        model.select(model.state.value.keys.single().key.id)
        val detail = model.selected.value!!

        detail.beginExport(SshDetailModel.ExportKind.PRIVATE_KEY)
        detail.export()
        assertTrue(detail.state.value.confirmingPlaintext)
        assertTrue(store.sshExports.isEmpty())

        detail.export(allowPlaintext = true)
        advanceUntilIdle()
        assertEquals(SshDetailModel.Document("ssh-1", "PRIVATE ed25519"), detail.state.value.document)
        assertNull(store.sshExports.single().passphrase)

        detail.finishExport(saved = true)
        assertNull("the exported text is dropped once written", detail.state.value.document)
        assertNull(detail.state.value.issue)
    }

    @Test
    public fun `a passphrase goes with a private export and is forgotten after it`(): Unit = runTest {
        val model = keys()
        generate(model, "Server", SshCreationModel.Algorithm.ED25519)
        model.select(model.state.value.keys.single().key.id)
        val detail = model.selected.value!!

        detail.beginExport(SshDetailModel.ExportKind.PRIVATE_KEY)
        detail.changePassphrase("correct horse")
        detail.export()
        advanceUntilIdle()

        assertEquals("correct horse", store.sshExports.single().passphrase)
        assertEquals("", detail.state.value.passphrase)
        detail.finishExport(saved = false)
        assertEquals(SshDetailModel.Issue.FILE_NOT_SAVED, detail.state.value.issue)
    }

    @Test
    public fun `a revoked session drops the list and the open key`(): Unit = runTest {
        val model = keys()
        generate(model, "Server", SshCreationModel.Algorithm.ED25519)
        model.select(model.state.value.keys.single().key.id)
        store.failWith = CoreRefusal("SESSION_REVOKED", "passmanager:ssh:page")

        model.reload()
        advanceUntilIdle()

        assertEquals(SshModel.Status.REVOKED, model.state.value.status)
        assertNull(model.selected.value)
    }
}
