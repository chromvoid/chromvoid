package com.chromvoid.air.session

import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.bridge.perform
import com.chromvoid.air.bridge.wire.WalletAccountsDeriveRequest
import com.chromvoid.air.bridge.wire.WalletAccountsDeriveResponse
import com.chromvoid.air.bridge.wire.WalletAccountsListRequest
import com.chromvoid.air.bridge.wire.WalletAccountsListResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookCreateRequest
import com.chromvoid.air.bridge.wire.WalletAddressBookCreateResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookDeleteRequest
import com.chromvoid.air.bridge.wire.WalletAddressBookDeleteResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookListResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookUpdateRequest
import com.chromvoid.air.bridge.wire.WalletAddressBookUpdateResponse
import com.chromvoid.air.bridge.wire.WalletAddressDetectRequest
import com.chromvoid.air.bridge.wire.WalletAddressDetectResponse
import com.chromvoid.air.bridge.wire.WalletAddressesDeriveRequest
import com.chromvoid.air.bridge.wire.WalletAddressesDeriveResponse
import com.chromvoid.air.bridge.wire.WalletBackupExportRequest
import com.chromvoid.air.bridge.wire.WalletBackupExportResponse
import com.chromvoid.air.bridge.wire.WalletBalanceGetRequest
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
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.wallet.WalletStore
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

/**
 * The wallet commands over the session's runtime, with the requests iOS
 * sends. Each call names its generation, and Rust refuses one that is no
 * longer current.
 */
internal class SessionWalletStore(
    private val runtime: () -> AirSessionRuntime?,
) : WalletStore {
    override suspend fun walletStatus(generation: ULong): WalletStatusResponse =
        current().perform<JsonObject, WalletStatusResponse>("wallet:status", empty(), AirPhase.UNLOCKED, generation)

    override suspend fun walletList(generation: ULong): WalletListResponse =
        current().perform<JsonObject, WalletListResponse>("wallet:list", empty(), AirPhase.UNLOCKED, generation)

    override suspend fun walletAccounts(walletId: String?, generation: ULong): WalletAccountsListResponse =
        current().perform<WalletAccountsListRequest, WalletAccountsListResponse>(
            "wallet:accounts:list",
            WalletAccountsListRequest(walletID = walletId),
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun walletBalance(accountId: String, generation: ULong): WalletBalanceGetResponse =
        balance(WalletBalanceGetRequest(accountID = accountId), generation)

    override suspend fun discoverWalletAddresses(accountId: String, generation: ULong): WalletBalanceGetResponse =
        balance(WalletBalanceGetRequest(accountID = accountId, discoverAddresses = true), generation)

    override suspend fun generateWalletMnemonic(
        request: WalletHDGenerateMnemonicRequest,
        generation: ULong,
    ): WalletHDGenerateMnemonicResponse =
        current().perform<WalletHDGenerateMnemonicRequest, WalletHDGenerateMnemonicResponse>(
            "wallet:hd:generateMnemonic",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun createHdWallet(request: WalletHDCreateRequest, generation: ULong): WalletHDCreateResponse =
        current().perform<WalletHDCreateRequest, WalletHDCreateResponse>(
            "wallet:hd:create",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun importWallet(
        request: WalletImportCreateRequest,
        generation: ULong,
    ): WalletImportCreateResponse =
        current().perform<WalletImportCreateRequest, WalletImportCreateResponse>(
            "wallet:import:create",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun deriveWalletAccount(
        request: WalletAccountsDeriveRequest,
        generation: ULong,
    ): WalletAccountsDeriveResponse =
        current().perform<WalletAccountsDeriveRequest, WalletAccountsDeriveResponse>(
            "wallet:accounts:derive",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun deriveWalletAddress(
        request: WalletAddressesDeriveRequest,
        generation: ULong,
    ): WalletAddressesDeriveResponse =
        current().perform<WalletAddressesDeriveRequest, WalletAddressesDeriveResponse>(
            "wallet:addresses:derive",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun detectWalletAddress(
        address: String,
        generation: ULong,
    ): WalletAddressDetectResponse =
        current().perform<WalletAddressDetectRequest, WalletAddressDetectResponse>(
            "wallet:address:detect",
            WalletAddressDetectRequest(address = address),
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun quoteTransaction(
        request: WalletTransactionQuoteRequest,
        generation: ULong,
    ): WalletTransactionQuoteResponse =
        current().perform<WalletTransactionQuoteRequest, WalletTransactionQuoteResponse>(
            "wallet:transaction:quote",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun prepareTransaction(
        request: WalletTransactionPrepareRequest,
        generation: ULong,
    ): WalletTransactionPrepareResponse =
        current().perform<WalletTransactionPrepareRequest, WalletTransactionPrepareResponse>(
            "wallet:transaction:prepare",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun confirmTransaction(
        request: WalletTransactionConfirmRequest,
        generation: ULong,
    ): WalletTransactionConfirmResponse =
        current().perform<WalletTransactionConfirmRequest, WalletTransactionConfirmResponse>(
            "wallet:transaction:confirm",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun cancelTransaction(
        request: WalletTransactionCancelRequest,
        generation: ULong,
    ): WalletTransactionCancelResponse =
        current().perform<WalletTransactionCancelRequest, WalletTransactionCancelResponse>(
            "wallet:transaction:cancel",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun rebroadcastTransaction(
        request: WalletTransactionRebroadcastRequest,
        generation: ULong,
    ): WalletTransactionRebroadcastResponse =
        current().perform<WalletTransactionRebroadcastRequest, WalletTransactionRebroadcastResponse>(
            "wallet:transaction:rebroadcast",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun walletTransactions(
        request: WalletTransactionsListRequest,
        generation: ULong,
    ): WalletTransactionsListResponse =
        current().perform<WalletTransactionsListRequest, WalletTransactionsListResponse>(
            "wallet:transactions:list",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun syncTransactions(
        request: WalletTransactionsSyncRequest,
        generation: ULong,
    ): WalletTransactionsSyncResponse =
        current().perform<WalletTransactionsSyncRequest, WalletTransactionsSyncResponse>(
            "wallet:transactions:sync",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun refreshTransaction(
        request: WalletTransactionsRefreshRequest,
        generation: ULong,
    ): WalletTransactionsRefreshResponse =
        current().perform<WalletTransactionsRefreshRequest, WalletTransactionsRefreshResponse>(
            "wallet:transactions:refresh",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun walletContacts(generation: ULong): WalletAddressBookListResponse =
        current().perform<JsonObject, WalletAddressBookListResponse>(
            "wallet:addressBook:list",
            empty(),
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun createWalletContact(
        request: WalletAddressBookCreateRequest,
        generation: ULong,
    ): WalletAddressBookCreateResponse =
        current().perform<WalletAddressBookCreateRequest, WalletAddressBookCreateResponse>(
            "wallet:addressBook:create",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun updateWalletContact(
        request: WalletAddressBookUpdateRequest,
        generation: ULong,
    ): WalletAddressBookUpdateResponse =
        current().perform<WalletAddressBookUpdateRequest, WalletAddressBookUpdateResponse>(
            "wallet:addressBook:update",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun deleteWalletContact(
        request: WalletAddressBookDeleteRequest,
        generation: ULong,
    ): WalletAddressBookDeleteResponse =
        current().perform<WalletAddressBookDeleteRequest, WalletAddressBookDeleteResponse>(
            "wallet:addressBook:delete",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun exportWalletRecovery(
        request: WalletBackupExportRequest,
        generation: ULong,
    ): WalletBackupExportResponse =
        current().perform<WalletBackupExportRequest, WalletBackupExportResponse>(
            "wallet:backup:export",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun rotateTonSigningKey(
        request: WalletTonRotateKeyRequest,
        generation: ULong,
    ): WalletTonRotateKeyResponse =
        current().perform<WalletTonRotateKeyRequest, WalletTonRotateKeyResponse>(
            "wallet:ton:rotateKey",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    private suspend fun balance(request: WalletBalanceGetRequest, generation: ULong): WalletBalanceGetResponse =
        current().perform<WalletBalanceGetRequest, WalletBalanceGetResponse>(
            "wallet:balance:get",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    private fun empty(): JsonObject = buildJsonObject {}

    private fun current(): AirSessionRuntime = runtime() ?: throw BridgeException.SessionRevoked()
}
