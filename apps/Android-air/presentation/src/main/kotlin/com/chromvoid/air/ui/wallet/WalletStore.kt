package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.wire.WalletAccountsDeriveRequest
import com.chromvoid.air.bridge.wire.WalletAccountsDeriveResponse
import com.chromvoid.air.bridge.wire.WalletAccountsListResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookCreateRequest
import com.chromvoid.air.bridge.wire.WalletAddressBookCreateResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookDeleteRequest
import com.chromvoid.air.bridge.wire.WalletAddressBookDeleteResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookListResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookUpdateRequest
import com.chromvoid.air.bridge.wire.WalletAddressBookUpdateResponse
import com.chromvoid.air.bridge.wire.WalletAddressDetectResponse
import com.chromvoid.air.bridge.wire.WalletAddressesDeriveRequest
import com.chromvoid.air.bridge.wire.WalletAddressesDeriveResponse
import com.chromvoid.air.bridge.wire.WalletBackupExportRequest
import com.chromvoid.air.bridge.wire.WalletBackupExportResponse
import com.chromvoid.air.bridge.wire.WalletBalanceGetResponse
import com.chromvoid.air.bridge.wire.WalletHDCreateRequest
import com.chromvoid.air.bridge.wire.WalletHDCreateResponse
import com.chromvoid.air.bridge.wire.WalletHDGenerateMnemonicRequest
import com.chromvoid.air.bridge.wire.WalletHDGenerateMnemonicResponse
import com.chromvoid.air.bridge.wire.WalletImportCreateRequest
import com.chromvoid.air.bridge.wire.WalletImportCreateResponse
import com.chromvoid.air.bridge.wire.WalletListResponse
import com.chromvoid.air.bridge.wire.WalletStatusResponse
import com.chromvoid.air.bridge.wire.WalletTonRotateKeyRequest
import com.chromvoid.air.bridge.wire.WalletTonRotateKeyResponse
import com.chromvoid.air.bridge.wire.WalletTransactionCancelRequest
import com.chromvoid.air.bridge.wire.WalletTransactionCancelResponse
import com.chromvoid.air.bridge.wire.WalletTransactionConfirmRequest
import com.chromvoid.air.bridge.wire.WalletTransactionConfirmResponse
import com.chromvoid.air.bridge.wire.WalletTransactionPrepareRequest
import com.chromvoid.air.bridge.wire.WalletTransactionPrepareResponse
import com.chromvoid.air.bridge.wire.WalletTransactionQuoteRequest
import com.chromvoid.air.bridge.wire.WalletTransactionQuoteResponse
import com.chromvoid.air.bridge.wire.WalletTransactionRebroadcastRequest
import com.chromvoid.air.bridge.wire.WalletTransactionRebroadcastResponse
import com.chromvoid.air.bridge.wire.WalletTransactionsListRequest
import com.chromvoid.air.bridge.wire.WalletTransactionsListResponse
import com.chromvoid.air.bridge.wire.WalletTransactionsRefreshRequest
import com.chromvoid.air.bridge.wire.WalletTransactionsRefreshResponse
import com.chromvoid.air.bridge.wire.WalletTransactionsSyncRequest
import com.chromvoid.air.bridge.wire.WalletTransactionsSyncResponse

/**
 * The wallet's metadata, setup and accounts, as Core answers them. Core owns
 * phrases, keys, derivation and the providers; nothing here holds a secret
 * longer than one request.
 */
public interface WalletStore {
    public suspend fun walletStatus(generation: ULong): WalletStatusResponse

    public suspend fun walletList(generation: ULong): WalletListResponse

    public suspend fun walletAccounts(walletId: String?, generation: ULong): WalletAccountsListResponse

    /** The live balance of one account from its network's provider; Core also caches it for the list. */
    public suspend fun walletBalance(accountId: String, generation: ULong): WalletBalanceGetResponse

    /**
     * A restored wallet's first scan of one network for the accounts it already
     * used, answered with the balance. Bitcoin, Ethereum and Solana only.
     */
    public suspend fun discoverWalletAddresses(accountId: String, generation: ULong): WalletBalanceGetResponse

    public suspend fun generateWalletMnemonic(
        request: WalletHDGenerateMnemonicRequest,
        generation: ULong,
    ): WalletHDGenerateMnemonicResponse

    public suspend fun createHdWallet(request: WalletHDCreateRequest, generation: ULong): WalletHDCreateResponse

    public suspend fun importWallet(request: WalletImportCreateRequest, generation: ULong): WalletImportCreateResponse

    public suspend fun deriveWalletAccount(
        request: WalletAccountsDeriveRequest,
        generation: ULong,
    ): WalletAccountsDeriveResponse

    public suspend fun deriveWalletAddress(
        request: WalletAddressesDeriveRequest,
        generation: ULong,
    ): WalletAddressesDeriveResponse

    // Send: Core owns fee quotes, the prepared intent, authorization, signing and exact rebroadcast.

    /** Address-first Send: every registered network is asked whether it accepts the address. */
    public suspend fun detectWalletAddress(address: String, generation: ULong): WalletAddressDetectResponse

    public suspend fun quoteTransaction(
        request: WalletTransactionQuoteRequest,
        generation: ULong,
    ): WalletTransactionQuoteResponse

    public suspend fun prepareTransaction(
        request: WalletTransactionPrepareRequest,
        generation: ULong,
    ): WalletTransactionPrepareResponse

    public suspend fun confirmTransaction(
        request: WalletTransactionConfirmRequest,
        generation: ULong,
    ): WalletTransactionConfirmResponse

    public suspend fun cancelTransaction(
        request: WalletTransactionCancelRequest,
        generation: ULong,
    ): WalletTransactionCancelResponse

    public suspend fun rebroadcastTransaction(
        request: WalletTransactionRebroadcastRequest,
        generation: ULong,
    ): WalletTransactionRebroadcastResponse

    // Activity: Core owns the journal, provider synchronization and status reconciliation.

    public suspend fun walletTransactions(
        request: WalletTransactionsListRequest,
        generation: ULong,
    ): WalletTransactionsListResponse

    public suspend fun syncTransactions(
        request: WalletTransactionsSyncRequest,
        generation: ULong,
    ): WalletTransactionsSyncResponse

    public suspend fun refreshTransaction(
        request: WalletTransactionsRefreshRequest,
        generation: ULong,
    ): WalletTransactionsRefreshResponse

    // Contacts belong to the vault; Core validates each address for its network and stores it.

    public suspend fun walletContacts(generation: ULong): WalletAddressBookListResponse

    public suspend fun createWalletContact(
        request: WalletAddressBookCreateRequest,
        generation: ULong,
    ): WalletAddressBookCreateResponse

    public suspend fun updateWalletContact(
        request: WalletAddressBookUpdateRequest,
        generation: ULong,
    ): WalletAddressBookUpdateResponse

    public suspend fun deleteWalletContact(
        request: WalletAddressBookDeleteRequest,
        generation: ULong,
    ): WalletAddressBookDeleteResponse

    // Recovery: Core reauthenticates the administrator and hands the material out for one screen.

    /** An HD wallet's recovery phrase, and its BIP39 passphrase when it has one. */
    public suspend fun exportWalletRecovery(
        request: WalletBackupExportRequest,
        generation: ULong,
    ): WalletBackupExportResponse

    /**
     * Rotates the signing key of a TON account made from a rotation phrase and
     * answers with the whole replacement phrase; the previous one stays valid
     * until the network confirms the new key.
     */
    public suspend fun rotateTonSigningKey(
        request: WalletTonRotateKeyRequest,
        generation: ULong,
    ): WalletTonRotateKeyResponse
}
