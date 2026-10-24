package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.CredentialOtpSummary
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordsResponse
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class CodesModelTest {
    private val clipboard = FakeClipboard()
    private val scanner = FakeScanner()
    private val store = FakeCredentialStore(listOf(summary("mail", "Mail"))).apply {
        otps["mail"] = mutableListOf(
            CredentialOtpSummary(
                algorithm = "SHA1",
                digits = 6,
                encoding = "base32",
                label = "Mail",
                otpType = "TOTP",
                period = 30,
            ),
        )
    }

    private fun TestScope.codes(): CodesModel = CodesModel(
        "mail",
        store,
        generation = 1uL,
        scope = modelScope(),
        clipboard = clipboard,
        scanner = scanner,
        now = { testScheduler.currentTime },
    ).also { advanceUntilIdle() }

    @Test
    public fun `a shown code comes from Core and is dropped a second before it expires`(): Unit = runTest {
        val model = codes()

        model.show("Mail", copy = true)
        runCurrent()
        assertEquals("123456", model.state.value.shown["Mail"]?.code)
        assertEquals(listOf("123456" to true), clipboard.copies)

        advanceTimeBy(18_500)
        assertEquals("still valid", "123456", model.state.value.shown["Mail"]?.code)
        advanceTimeBy(1_000)
        runCurrent()
        assertNull(model.state.value.shown["Mail"])
    }

    @Test
    public fun `a code asked for in its last second is not shown - the next window's code is`(): Unit = runTest {
        store.otpLeftSecondsQueue.addAll(listOf(1L, 30L))
        val model = codes()

        model.show("Mail")
        runCurrent()
        assertNull("gone at once, never shown", model.state.value.shown["Mail"])
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(2, store.otpCodeCalls)
        assertEquals(1_000L + 29_000L, model.state.value.shown["Mail"]?.expiresAt)
        assertNull(model.state.value.issue)
    }

    @Test
    public fun `a counter-based code has no deadline and stays shown`(): Unit = runTest {
        store.otpLeftSeconds = 0
        val model = codes()

        model.show("Mail")
        runCurrent()
        advanceTimeBy(120_000)
        runCurrent()
        assertEquals(CodesModel.Shown("123456", expiresAt = null), model.state.value.shown["Mail"])
        assertEquals(1, store.otpCodeCalls)
    }

    @Test
    public fun `a key that is not base32 never reaches Core`(): Unit = runTest {
        val model = codes()
        model.beginAdd()
        model.changeDraft { it.copy(label = "Work", secret = "not a key 1") }

        model.saveDraft()
        advanceUntilIdle()

        assertTrue(CodesModel.DraftError.KEY_INVALID in model.state.value.draft!!.errors)
        assertTrue(store.otpSaves.isEmpty())
    }

    @Test
    public fun `a typed key is saved under the list revision it read`(): Unit = runTest {
        val model = codes()
        model.beginAdd()
        model.changeDraft { it.copy(label = "Work", secret = "jbsw y3dp ehpk 3pxp") }

        model.saveDraft()
        advanceUntilIdle()

        val saved = store.otpSaves.single()
        assertEquals("1", saved.revision)
        assertEquals("JBSWY3DPEHPK3PXP", saved.secret)
        assertNull(model.state.value.draft)
        assertEquals(listOf("Mail", "Work"), model.state.value.records.map { it.label })
    }

    @Test
    public fun `a scanned code fills the draft through Core's parser`(): Unit = runTest {
        scanner.next = OtpScanner.Result.Scanned("otpauth://totp/GitHub:alice?secret=JBSWY3DPEHPK3PXP&issuer=GitHub")
        val model = codes()

        model.scan()
        advanceUntilIdle()

        val draft = model.state.value.draft!!
        assertEquals("GitHub" to "JBSWY3DPEHPK3PXP", draft.label to draft.secret)
    }

    @Test
    public fun `a refused camera explains itself and keeps the typed draft`(): Unit = runTest {
        scanner.next = OtpScanner.Result.PermissionDenied
        val model = codes()
        model.beginAdd()
        model.changeDraft { it.copy(label = "Work") }

        model.scan()
        advanceUntilIdle()

        assertEquals(CodesModel.Issue.CAMERA_DENIED, model.state.value.issue)
        assertEquals("Work", model.state.value.draft?.label)
    }

    @Test
    public fun `a code is deleted after a confirmation`(): Unit = runTest {
        val model = codes()

        model.requestDelete("Mail")
        model.confirmDelete()
        advanceUntilIdle()

        assertTrue(model.state.value.records.isEmpty())
    }

    @Test
    public fun `a failed read recovers only when the record is reloaded`(): Unit = runTest {
        store.failWith = CoreRefusal("INTERNAL", "passmanager:otp:records")
        val model = codes()

        assertEquals(CodesModel.Status.FAILED, model.state.value.status)
        assertTrue(model.state.value.records.isEmpty())

        store.failWith = null
        model.reload()
        advanceUntilIdle()

        assertEquals(CodesModel.Status.READY, model.state.value.status)
        assertEquals(listOf("Mail"), model.state.value.records.map { it.label })
    }

    @Test
    public fun `retrying one collection record leaves neighboring codes and the catalog intact`(): Unit = runTest {
        store.entries += summary("work", "Work")
        store.otps["work"] = store.otps.getValue("mail").map { it.copy(label = "Work") }.toMutableList()
        store.otpLeftSeconds = 0
        val requests = mutableListOf<String>()
        var failing = true
        val reader = object : CredentialStore by store {
            override suspend fun otpRecords(id: String, generation: ULong): PassmanagerOtpRecordsResponse {
                requests += id
                if (id == "mail" && failing) throw CoreRefusal("INTERNAL", "passmanager:otp:records")
                return store.otpRecords(id, generation)
            }
        }
        val collection = CodesCollection(reader, 1uL, modelScope(), clipboard, searchDelayMillis = 0)
        val failed = collection.codesFor("mail")
        val neighbor = collection.codesFor("work")
        advanceUntilIdle()
        assertEquals(CodesModel.Status.FAILED, failed.state.value.status)
        neighbor.show("Work")
        runCurrent()
        val shown = neighbor.state.value.shown
        val catalogReads = store.pageRequests.toList()

        failing = false
        failed.reload()
        advanceUntilIdle()

        assertEquals(listOf("mail", "work", "mail"), requests)
        assertEquals(CodesModel.Status.READY, failed.state.value.status)
        assertEquals(shown, neighbor.state.value.shown)
        neighbor.copyShown("Work")
        assertEquals(listOf("123456" to true), clipboard.copies)
        assertEquals(catalogReads, store.pageRequests)
        assertEquals(listOf("mail", "work"), collection.catalog.state.value.entries.map { it.id })
    }
}
