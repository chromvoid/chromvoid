package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.wire.WalletStatusResponse
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
public class WalletSetupModelTest {
    private val store = FakeWalletStore()
    private val saved = mutableListOf<Pair<String, String?>>()

    private fun TestScope.setup(
        intent: WalletSetupModel.Intent,
        status: WalletStatusResponse? = null,
    ): WalletSetupModel {
        val answer = status ?: WalletStatusResponse(
            enabled = true,
            initialized = false,
            networks = store.networks,
            walletCount = 0,
        )
        return WalletSetupModel(intent, answer, store, 1uL, modelScope(), requestId = { "req" }) { wallet, account ->
            saved += wallet to account
        }
    }

    private val WalletSetupModel.now: WalletSetupModel.State get() = state.value

    @Test
    public fun `a new wallet is the universal one, its phrase generated on the way and never shown`(): Unit = runTest {
        val model = setup(WalletSetupModel.Intent.CREATE)
        assertEquals(WalletSetupModel.RecoveryProfile.TELEGRAM_MULTICHAIN, model.now.profile)
        assertEquals(
            listOf(WalletSetupModel.RecoveryProfile.TELEGRAM_MULTICHAIN),
            WalletSetupModel.RecoveryProfile.available(model.intent),
        )

        model.submit()
        assertEquals(setOf(WalletSetupModel.Field.LABEL), model.now.missing)
        assertEquals(WalletSetupModel.Field.LABEL, model.now.focus)

        model.change(WalletSetupModel.Field.LABEL, "  Everyday  ")
        model.submit()
        advanceUntilIdle()

        val draft = store.drafts.single()
        assertEquals("rotation", draft.mnemonicStandard)
        assertEquals("multichain", draft.walletMode)
        assertEquals(12L, draft.wordCount)
        val request = store.created.single()
        assertEquals("Everyday", request.label)
        assertEquals("draft1", request.mnemonicDraftID)
        assertNull(request.mnemonic)
        assertEquals(listOf("ton", "bitcoin", "ethereum"), request.supportedNetworks)
        assertEquals("req", request.clientRequestID)
        assertEquals(WalletSetupModel.Phase.SAVED, model.now.phase)
        assertTrue(model.now.values.isEmpty())
        assertEquals(1, saved.size)
    }

    @Test
    public fun `an expired draft is generated again once`(): Unit = runTest {
        store.draftLifetime = 0
        val model = setup(WalletSetupModel.Intent.CREATE)
        model.change(WalletSetupModel.Field.LABEL, "Main")

        model.submit()
        advanceUntilIdle()

        assertEquals(1, store.drafts.size)
        assertEquals(WalletSetupModel.Issue.EXPIRED_PHRASE, model.now.issue)
        assertTrue(store.created.isEmpty())
        assertEquals(WalletSetupModel.Phase.EDITING, model.now.phase)
    }

    @Test
    public fun `a phrase is restored under the chosen profile, with a passphrase only when asked`(): Unit = runTest {
        val model = setup(WalletSetupModel.Intent.RESTORE)
        model.change(WalletSetupModel.Field.LABEL, "Old")
        model.change(WalletSetupModel.Field.MNEMONIC, " one  two\nthree ")
        model.setPassphraseEnabled(true)
        model.submit()
        assertEquals(setOf(WalletSetupModel.Field.PASSPHRASE), model.now.missing)

        model.change(WalletSetupModel.Field.PASSPHRASE, "extra")
        model.selectProfile(WalletSetupModel.RecoveryProfile.TON_ONLY)
        assertFalse(model.now.usePassphrase)
        assertEquals(setOf("ton"), model.now.selectedNetworks)
        assertEquals("", model.now.value(WalletSetupModel.Field.MNEMONIC))

        model.change(WalletSetupModel.Field.MNEMONIC, "one two three")
        model.submit()
        advanceUntilIdle()

        val request = store.created.single()
        assertEquals(listOf("one", "two", "three"), request.mnemonic)
        assertEquals("ton_only", request.walletMode)
        assertEquals("rotation", request.mnemonicStandard)
        assertEquals(listOf("ton"), request.supportedNetworks)
        assertNull(request.bip39Passphrase)
        assertTrue(store.drafts.isEmpty())
    }

    @Test
    public fun `a private key is imported for the chosen network and encoding`(): Unit = runTest {
        val model = setup(WalletSetupModel.Intent.IMPORT_KEY)
        assertEquals(WalletSetupModel.ImportNetwork.TON, model.now.importNetwork)
        model.selectImportNetwork(WalletSetupModel.ImportNetwork.BITCOIN)
        assertEquals("wif", model.now.encoding)
        model.selectImportNetwork(WalletSetupModel.ImportNetwork.TON)
        model.selectEncoding("base64")
        model.change(WalletSetupModel.Field.LABEL, "Key")
        model.change(WalletSetupModel.Field.PRIVATE_KEY, " secret ")

        model.submit()
        advanceUntilIdle()

        val request = store.imported.single()
        assertEquals("ton", request.network)
        assertEquals("ed25519", request.curve)
        assertEquals("base64", request.encoding)
        assertEquals("secret", request.privateKey)
        assertEquals(WalletSetupModel.Phase.SAVED, model.now.phase)
    }

    @Test
    public fun `Core's refusal of the input keeps the form, an unknown outcome clears the secrets`(): Unit = runTest {
        val model = setup(WalletSetupModel.Intent.IMPORT_KEY)
        model.change(WalletSetupModel.Field.LABEL, "Key")
        model.change(WalletSetupModel.Field.PRIVATE_KEY, "bad")
        store.createRefusal = "INVALID_INPUT"
        model.submit()
        advanceUntilIdle()
        assertEquals(WalletSetupModel.Issue.INVALID_INPUT, model.now.issue)
        assertEquals("bad", model.now.value(WalletSetupModel.Field.PRIVATE_KEY))

        store.createRefusal = null
        store.failNext = java.io.IOException("lost")
        model.submit()
        advanceUntilIdle()
        assertEquals(WalletSetupModel.Phase.UNCERTAIN, model.now.phase)
        assertEquals(WalletSetupModel.Issue.UNCERTAIN_SAVE, model.now.issue)
        assertEquals("", model.now.value(WalletSetupModel.Field.PRIVATE_KEY))
        assertTrue(model.requestDismiss())
    }

    @Test
    public fun `closing a filled form asks first, and a lock clears it`(): Unit = runTest {
        val model = setup(WalletSetupModel.Intent.RESTORE)
        assertTrue(model.requestDismiss())
        model.change(WalletSetupModel.Field.MNEMONIC, "words")
        model.toggleVisibility(WalletSetupModel.Field.MNEMONIC)
        assertTrue(WalletSetupModel.Field.MNEMONIC in model.now.revealed)
        model.hideValues()
        assertTrue(model.now.revealed.isEmpty())

        assertFalse(model.requestDismiss())
        assertTrue(model.now.confirmingDiscard)
        model.cancelDiscard()

        store.failNext = BridgeException.SessionRevoked()
        model.change(WalletSetupModel.Field.LABEL, "x")
        model.submit()
        advanceUntilIdle()
        assertEquals(WalletSetupModel.Phase.REVOKED, model.now.phase)
        assertTrue(model.now.values.isEmpty())
    }

    @Test
    public fun `a disabled runtime saves nothing`(): Unit = runTest {
        val model = setup(
            WalletSetupModel.Intent.CREATE,
            WalletStatusResponse(enabled = false, initialized = false, networks = store.networks, walletCount = 0),
        )
        model.change(WalletSetupModel.Field.LABEL, "Main")
        model.submit()
        assertEquals(WalletSetupModel.Issue.UNAVAILABLE, model.now.issue)
        assertTrue(store.calls.isEmpty())
    }
}
