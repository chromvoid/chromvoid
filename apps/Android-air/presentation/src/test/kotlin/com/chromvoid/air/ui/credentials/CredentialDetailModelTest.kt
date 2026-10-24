package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.PaymentCardMetadata
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
public class CredentialDetailModelTest {
    private val clipboard = FakeClipboard()
    private val store = FakeCredentialStore(listOf(summary("a", "Mail", "alice", "mail.example"))).apply {
        secrets["a" to "password"] = "hunter2"
    }

    private fun TestScope.detail(id: String): CredentialDetailModel =
        CredentialDetailModel(
            id,
            store,
            generation = 1uL,
            scope = modelScope(),
            clipboard = clipboard,
            cards = FakeCardRules,
        )
            .also { advanceUntilIdle() }

    @Test
    public fun `a card is drawn masked to its last four until its number and code are shown`(): Unit = runTest {
        store.entries += summary("card", "Travel").copy(entryType = "payment_card")
        store.cards["card"] = PaymentCardMetadata(
            brand = "amex",
            cardholderName = "ALICE",
            expMonth = 3,
            expYear = 2035,
            last4 = "0005",
        )
        store.secrets["card" to "card_pan"] = "378282246310005"
        store.secrets["card" to "card_cvv"] = "1234"
        val model = detail("card")

        val masked = checkNotNull(model.cardFace(model.state.value))
        assertEquals(PaymentCardBrand.AMEX, masked.brand)
        assertEquals("•••• •••••• •0005", masked.number)
        assertEquals("03/35", masked.expiry)
        assertNull(masked.code)

        model.reveal(CredentialDetailModel.CARD_NUMBER)
        advanceUntilIdle()
        assertEquals("3782 822463 10005", model.cardFace(model.state.value)?.number)
        assertEquals("3782 822463 10005", model.groupedNumber("378282246310005"))
        model.reveal(CredentialDetailModel.CARD_CODE)
        advanceUntilIdle()
        assertEquals("1234", model.cardFace(model.state.value)?.code)
        assertNull("a login has no card face", detail("a").let { it.cardFace(it.state.value) })
    }

    @Test
    public fun `the record opened is the record shown`(): Unit = runTest {
        val state = detail("a").state.value

        assertEquals(CredentialDetailModel.Status.READY, state.status)
        assertEquals("alice", state.detail?.username)
        assertEquals(listOf("mail.example"), state.detail?.websites)
    }

    @Test
    public fun `a record that no longer exists says so`(): Unit = runTest {
        val state = detail("gone").state.value

        assertEquals(CredentialDetailModel.Status.MISSING, state.status)
        assertNull(state.detail)
    }

    @Test
    public fun `a reply about another record is never shown`(): Unit = runTest {
        store.answerDetailFor = "someone-else"

        val state = detail("a").state.value

        assertEquals(CredentialDetailModel.Status.FAILED, state.status)
        assertNull(state.detail)
    }

    @Test
    public fun `a revealed secret is shown until it is hidden or the page closes`(): Unit = runTest {
        val model = detail("a")
        assertEquals(listOf("password", "note"), model.state.value.secretTypes)

        model.reveal("password")
        advanceUntilIdle()
        assertEquals("hunter2", model.state.value.revealed["password"])

        model.reveal("password")
        assertNull(model.state.value.revealed["password"])

        model.reveal("password")
        advanceUntilIdle()
        model.close()
        assertTrue(model.state.value.revealed.isEmpty())
    }

    @Test
    public fun `a copy goes to the clipboard and is never shown`(): Unit = runTest {
        val model = detail("a")

        model.copySecret("password")
        advanceUntilIdle()

        assertEquals(listOf("hunter2" to true), clipboard.copies)
        assertTrue(model.state.value.revealed.isEmpty())
        assertEquals(1, model.state.value.copies)
    }

    @Test
    public fun `a field with nothing saved says so and copies nothing`(): Unit = runTest {
        val model = detail("a")

        model.copySecret("note")
        advanceUntilIdle()

        assertTrue(clipboard.copies.isEmpty())
        assertEquals(CredentialDetailModel.FieldIssue.EMPTY, model.state.value.issues["note"])
    }

    @Test
    public fun `a field the record type does not have is never read`(): Unit = runTest {
        val model = detail("a")

        model.reveal("card_cvv")
        advanceUntilIdle()

        assertTrue(store.secretReads.isEmpty())
    }

    @Test
    public fun `a delete is confirmed first and closes the page once Core agrees`(): Unit = runTest {
        val model = detail("a")
        var closed = false

        model.confirmDelete { closed = true }
        assertTrue("nothing happens without the confirmation", store.entries.isNotEmpty())

        model.requestDelete()
        model.confirmDelete { closed = true }
        advanceUntilIdle()

        assertTrue(closed)
        assertTrue(store.entries.isEmpty())
    }

    @Test
    public fun `a refused delete keeps the record and says so`(): Unit = runTest {
        store.refuseDeleteOf += "a"
        val model = detail("a")

        model.requestDelete()
        model.confirmDelete { error("must not close") }
        advanceUntilIdle()

        assertTrue(model.state.value.deleteRefused)
        assertEquals(CredentialDetailModel.Status.READY, model.state.value.status)
    }
}
