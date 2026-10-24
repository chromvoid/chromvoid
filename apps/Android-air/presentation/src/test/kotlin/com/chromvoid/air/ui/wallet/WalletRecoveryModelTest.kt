package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.FakeClipboard
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
public class WalletRecoveryModelTest {
    private val clipboard = FakeClipboard()

    private fun TestScope.recovery(store: FakeWalletStore, rotating: Boolean = true): WalletRecoveryModel {
        val wallet = store.wallets.first()
        val ton = store.accounts.firstOrNull { it.walletID == wallet.walletID && it.network == "ton" }
        return WalletRecoveryModel(
            wallet.walletID,
            wallet.label,
            ton?.accountID?.takeIf { rotating },
            store,
            1uL,
            modelScope(),
            clipboard,
        )
    }

    private val WalletRecoveryModel.now: WalletRecoveryModel.State get() = state.value

    @Test
    public fun `the password is asked for, taken off the screen and the phrase shown`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main")
        val model = recovery(store)

        model.reveal()
        assertEquals(WalletRecoveryModel.Issue.PASSWORD_REQUIRED, model.now.issue)
        assertEquals(1, model.now.passwordFocusRevision)
        assertTrue(store.calls.none { it.startsWith("export:") })

        model.changePassword(store.adminPassword)
        model.reveal()
        assertEquals("", model.now.password)
        assertEquals(WalletRecoveryModel.Phase.LOADING, model.now.phase)
        advanceUntilIdle()

        assertEquals(WalletRecoveryModel.Phase.REVEALED, model.now.phase)
        assertEquals(store.phrase, model.now.recovery?.mnemonic)
        assertFalse(model.now.rotated)
        assertNull(model.now.rotation)
    }

    @Test
    public fun `a wrong password is refused and the field asked for again`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main")
        val model = recovery(store)

        model.changePassword("wrong")
        model.reveal()
        advanceUntilIdle()

        assertEquals(WalletRecoveryModel.Phase.EDITING, model.now.phase)
        assertEquals(WalletRecoveryModel.Issue.REAUTHENTICATION, model.now.issue)
        assertEquals(1, model.now.passwordFocusRevision)
        assertNull(model.now.recovery)
    }

    @Test
    public fun `Core's refusals read as this screen explains them`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main")
        val model = recovery(store)
        listOf(
            "UNSUPPORTED_EXPORT_KIND" to WalletRecoveryModel.Issue.UNSUPPORTED,
            "WALLET_DISABLED" to WalletRecoveryModel.Issue.DENIED,
            "ACCESS_DENIED" to WalletRecoveryModel.Issue.DENIED,
            "PROVIDER_UNAVAILABLE" to WalletRecoveryModel.Issue.FAILED,
        ).forEach { (code, issue) ->
            store.exportRefusal = code
            model.changePassword(store.adminPassword)
            model.reveal()
            advanceUntilIdle()
            assertEquals(code, issue, model.now.issue)
        }
    }

    @Test
    public fun `the phrase and passphrase are copied as secrets and hiding takes them back`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main")
        store.passphrase = "extra words"
        val model = recovery(store)
        model.changePassword(store.adminPassword)
        model.reveal()
        advanceUntilIdle()

        model.copy(WalletRecoveryModel.CopyField.ANCHOR_WORDS)
        assertTrue(clipboard.copies.isEmpty())
        model.copy(WalletRecoveryModel.CopyField.MNEMONIC)
        assertEquals(store.phrase.joinToString(" ") to true, clipboard.copies.last())
        model.copy(WalletRecoveryModel.CopyField.PASSPHRASE)
        assertEquals("extra words" to true, clipboard.copies.last())
        assertEquals(WalletRecoveryModel.CopyField.PASSPHRASE, model.now.copied)

        model.hideValues()
        assertEquals(WalletRecoveryModel.Phase.EDITING, model.now.phase)
        assertNull(model.now.recovery)
        assertNull(clipboard.current)
    }

    @Test
    public fun `a rotation shows all 24 words and the first 12 copy on their own`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main")
        val model = recovery(store)
        assertTrue(model.canRotate)

        model.rotateKey()
        assertEquals(WalletRecoveryModel.Issue.PASSWORD_REQUIRED, model.now.issue)
        model.changePassword(store.adminPassword)
        model.rotateKey()
        advanceUntilIdle()

        assertEquals(WalletRecoveryModel.Phase.REVEALED, model.now.phase)
        assertEquals(24, model.now.recovery?.mnemonic?.size)
        assertTrue(model.now.rotated)
        assertEquals(7L, model.now.rotation?.seqno)
        model.copy(WalletRecoveryModel.CopyField.ANCHOR_WORDS)
        assertEquals(store.phrase.joinToString(" ") to true, clipboard.copies.last())
    }

    @Test
    public fun `a rotation still pending is said so and a wallet without one offers none`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main")
        val model = recovery(store)
        store.rotating += store.accounts.first { it.network == "ton" }.accountID

        model.changePassword(store.adminPassword)
        model.rotateKey()
        advanceUntilIdle()
        assertEquals(WalletRecoveryModel.Issue.ROTATION_PENDING, model.now.issue)

        store.failNext = CoreRefusal("UNSUPPORTED_ACCOUNT_MODEL", "wallet:ton:rotateKey")
        model.changePassword(store.adminPassword)
        model.rotateKey()
        advanceUntilIdle()
        assertEquals(WalletRecoveryModel.Issue.ROTATION_UNAVAILABLE, model.now.issue)

        val plain = recovery(store, rotating = false)
        assertFalse(plain.canRotate)
        plain.changePassword(store.adminPassword)
        plain.rotateKey()
        assertEquals(WalletRecoveryModel.Phase.EDITING, plain.now.phase)
        assertEquals(store.adminPassword, plain.now.password)
    }

    @Test
    public fun `a lock drops the phrase and ignores the answer still on its way`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main")
        val model = recovery(store)
        model.changePassword(store.adminPassword)
        model.reveal()

        model.revoke()
        advanceUntilIdle()

        assertEquals(WalletRecoveryModel.Phase.REVOKED, model.now.phase)
        assertNull(model.now.recovery)
        model.changePassword("again")
        assertEquals("", model.now.password)

        val other = recovery(store)
        store.failNext = BridgeException.SessionRevoked()
        other.changePassword(store.adminPassword)
        other.reveal()
        advanceUntilIdle()
        assertEquals(WalletRecoveryModel.Phase.REVOKED, other.now.phase)
    }
}
