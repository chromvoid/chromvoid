package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.WalletConfirmStatus
import com.chromvoid.air.bridge.wire.WalletFeeTier
import com.chromvoid.air.bridge.wire.WalletStatusResponse
import com.chromvoid.air.bridge.wire.WalletWarning
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.modelScope
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
public class WalletSendModelTest {
    private val store = FakeWalletStore().apply { wallet("Main", listOf("ton", "bitcoin")) }
    private val ton = store.accounts.first { it.network == "ton" }
    private val bitcoin = store.accounts.first { it.network == "bitcoin" }
    private var ids = 0

    private fun status() = WalletStatusResponse(
        enabled = true,
        initialized = true,
        networks = store.networks,
        walletCount = 1,
    )

    private fun TestScope.send(followAddress: Boolean = true): WalletSendModel = WalletSendModel(
        ton.walletID,
        ton.accountID,
        WalletNetwork.of("ton")!!,
        status(),
        store,
        1uL,
        modelScope(),
        newId = { "r${ids++}" },
        accountFor = if (followAddress) {
            { network ->
                val account = store.accounts.firstOrNull { it.network == network }
                account?.let { it.accountID to WalletNetwork.of(network)!! }
            }
        } else {
            null
        },
    )

    private val WalletSendModel.now: WalletSendModel.State get() = state.value

    private fun WalletSendModel.fill(address: String, amount: String) {
        val id = now.recipients.first().id
        change(WalletSendModel.Field.Address(id), address)
        change(WalletSendModel.Field.Amount(id), amount)
    }

    @Test
    public fun `a transfer is prepared, reviewed and authorized with the administrative password`(): Unit = runTest {
        val model = send()
        model.fill("UQrecipient", "1.5")
        model.change(WalletSendModel.Field.Comment, " thanks ")
        advanceUntilIdle()
        assertEquals("ton", model.now.detectedNetwork)

        model.prepare()
        assertEquals(WalletSendModel.Phase.PREPARING, model.now.phase)
        advanceUntilIdle()
        assertEquals(WalletSendModel.Phase.REVIEWING, model.now.phase)
        val request = store.prepared.single()
        assertEquals("1500000000", request.outputs.single().amount)
        assertEquals("thanks", request.outputs.single().comment)
        assertEquals(WalletFeeTier.Standard, request.feePolicy.tier)
        assertEquals("1505000000", model.now.prepared?.preview?.totalDebit)

        model.confirm()
        assertEquals(WalletSendModel.Issue.Required(WalletSendModel.Field.Password), model.now.issue)
        model.change(WalletSendModel.Field.Password, "admin")
        model.confirm()
        assertEquals("", model.now.password)
        advanceUntilIdle()

        assertEquals(WalletSendModel.Phase.SUBMITTED, model.now.phase)
        assertEquals("admin", store.confirmed.single().masterPassword)
        assertEquals("hash-tx1", model.now.confirmation?.txHash)
    }

    @Test
    public fun `the address moves the draft to the network it belongs to, or says the wallet has none there`(): Unit =
        runTest {
            val model = send()
            model.change(WalletSendModel.Field.Comment, "note")
            model.fill("bc1recipient", "0.001")
            advanceUntilIdle()
            assertEquals(bitcoin.accountID, model.now.accountId)
            assertEquals("bitcoin", model.now.network.network)
            assertEquals("", model.now.comment)

            model.change(WalletSendModel.Field.Address(model.now.recipients.first().id), "0xrecipient")
            advanceUntilIdle()
            assertEquals("ethereum", model.now.networkMismatch)
            assertEquals("bitcoin", model.now.network.network)
        }

    @Test
    public fun `every recipient needs an address and a positive exact amount`(): Unit = runTest {
        val model = send(followAddress = false)
        model.prepare()
        val first = model.now.recipients.first().id
        assertEquals(WalletSendModel.Issue.Required(WalletSendModel.Field.Address(first)), model.now.issue)
        assertEquals(WalletSendModel.Field.Address(first), model.now.focus)

        model.fill("UQrecipient", "0")
        model.prepare()
        assertEquals(WalletSendModel.Issue.InvalidAmount(first), model.now.issue)
        model.change(WalletSendModel.Field.Amount(first), "0.0000000001")
        model.prepare()
        assertEquals(WalletSendModel.Issue.InvalidAmount(first), model.now.issue)
        assertTrue(store.prepared.isEmpty())
    }

    @Test
    public fun `use maximum asks Core and fills the amount, and a stale maximum is quoted again`(): Unit = runTest {
        val model = send(followAddress = false)
        model.fill("UQrecipient", "")
        val id = model.now.recipients.first().id

        model.calculateQuote(maximumFor = id)
        advanceUntilIdle()
        assertEquals("1.995", model.now.value(WalletSendModel.Field.Amount(id)))
        assertEquals(id, model.now.maximumRecipientId)

        store.quoteLifetime = 0
        model.calculateQuote(maximumFor = id)
        advanceUntilIdle()
        model.prepare()
        assertEquals(WalletSendModel.Issue.QuoteRequired, model.now.issue)

        model.change(WalletSendModel.Field.Amount(id), "1")
        assertNull(model.now.quote)
        assertNull(model.now.maximumRecipientId)
    }

    @Test
    public fun `warnings must each be accepted before the transfer is authorized`(): Unit = runTest {
        store.warnings = listOf(WalletWarning("destination_uninitialized_bounceable", "uninitialized"))
        val model = send(followAddress = false)
        model.fill("UQrecipient", "1")
        model.prepare()
        advanceUntilIdle()
        model.change(WalletSendModel.Field.Password, "admin")

        model.confirm()
        assertEquals(WalletSendModel.Issue.Warnings, model.now.issue)
        model.toggleWarning("destination_uninitialized_bounceable")
        model.confirm()
        advanceUntilIdle()

        assertEquals(listOf("destination_uninitialized_bounceable"), store.confirmed.single().acceptedWarnings)
    }

    @Test
    public fun `a wrong password keeps the review, a lapsed preparation asks to review again`(): Unit = runTest {
        val model = send(followAddress = false)
        model.fill("UQrecipient", "1")
        model.prepare()
        advanceUntilIdle()

        model.change(WalletSendModel.Field.Password, "wrong")
        model.confirm()
        advanceUntilIdle()
        assertEquals(WalletSendModel.Phase.REVIEWING, model.now.phase)
        assertEquals(WalletSendModel.Issue.Reauthentication, model.now.issue)
        assertEquals(WalletSendModel.Field.Password, model.now.focus)

        store.confirmFailure = CoreRefusal("PREPARATION_EXPIRED", "wallet:transaction:confirm")
        model.change(WalletSendModel.Field.Password, "admin")
        model.confirm()
        advanceUntilIdle()
        assertEquals(WalletSendModel.Phase.STALE_REVIEW, model.now.phase)

        model.cancelReview()
        advanceUntilIdle()
        assertEquals(WalletSendModel.Phase.EDITING, model.now.phase)
        assertNull(model.now.prepared)
        assertTrue(store.sendCalls.contains("cancel:prep1"))
    }

    @Test
    public fun `an outcome Core cannot confirm is unknown and never offered again`(): Unit = runTest {
        val model = send(followAddress = false)
        model.fill("UQrecipient", "1")
        model.prepare()
        advanceUntilIdle()
        store.confirmOutcome = WalletConfirmStatus.BroadcastUnknown
        model.change(WalletSendModel.Field.Password, "admin")
        model.confirm()
        advanceUntilIdle()
        assertEquals(WalletSendModel.Phase.UNCERTAIN, model.now.phase)
        assertEquals(WalletSendModel.Issue.Uncertain, model.now.issue)

        val other = send(followAddress = false)
        other.fill("UQrecipient", "1")
        other.prepare()
        advanceUntilIdle()
        store.confirmFailure = java.io.IOException("lost")
        other.change(WalletSendModel.Field.Password, "admin")
        other.confirm()
        advanceUntilIdle()
        assertEquals(WalletSendModel.Phase.UNCERTAIN, other.now.phase)
    }

    @Test
    public fun `closing asks first, and discarding a prepared transfer cancels it with Core`(): Unit = runTest {
        val model = send(followAddress = false)
        assertTrue(model.requestDismiss())
        model.fill("UQrecipient", "1")
        assertFalse(model.requestDismiss())
        model.cancelDiscard()
        model.prepare()
        advanceUntilIdle()
        assertFalse(model.requestDismiss())

        var closed = 0
        model.discard { closed++ }
        advanceUntilIdle()

        assertEquals(1, closed)
        assertEquals(WalletSendModel.Phase.REVOKED, model.now.phase)
        assertTrue(store.sendCalls.contains("cancel:prep1"))
    }

    @Test
    public fun `a cancellation Core does not confirm must be retried`(): Unit = runTest {
        val model = send(followAddress = false)
        model.fill("UQrecipient", "1")
        model.prepare()
        advanceUntilIdle()
        store.cancelFails = true

        model.cancelReview()
        advanceUntilIdle()

        assertEquals(WalletSendModel.Phase.CANCEL_FAILED, model.now.phase)
        assertEquals(WalletSendModel.Issue.CancellationFailed, model.now.issue)
    }

    @Test
    public fun `Core's refusals are explained, and a lock drops the draft`(): Unit = runTest {
        val model = send(followAddress = false)
        model.fill("UQrecipient", "1")
        store.prepareRefusal = "INSUFFICIENT_FUNDS"
        model.prepare()
        advanceUntilIdle()
        assertEquals(WalletSendModel.Issue.InsufficientFunds, model.now.issue)
        assertEquals(WalletSendModel.Phase.EDITING, model.now.phase)

        store.prepareRefusal = null
        store.failNext = BridgeException.SessionRevoked()
        model.prepare()
        advanceUntilIdle()
        assertEquals(WalletSendModel.Phase.REVOKED, model.now.phase)
        assertTrue(model.now.recipients.isEmpty())
    }

    @Test
    public fun `several recipients only where the network takes them`(): Unit = runTest {
        val model = send(followAddress = false)
        model.addRecipient()
        assertEquals(1, model.now.recipients.size)

        model.fill("bc1recipient", "0.1")
        val bitcoinSend = WalletSendModel(
            bitcoin.walletID,
            bitcoin.accountID,
            WalletNetwork.of("bitcoin")!!,
            status(),
            store,
            1uL,
            modelScope(),
        )
        bitcoinSend.addRecipient()
        assertEquals(2, bitcoinSend.now.recipients.size)
        bitcoinSend.removeRecipient(bitcoinSend.now.recipients.last().id)
        assertEquals(1, bitcoinSend.now.recipients.size)
    }
}
