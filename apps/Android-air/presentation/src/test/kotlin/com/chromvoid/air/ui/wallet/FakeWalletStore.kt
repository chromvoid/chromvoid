package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.WalletAccountMeta
import com.chromvoid.air.bridge.wire.WalletAccountMetaKind
import com.chromvoid.air.bridge.wire.WalletAccountsDeriveRequest
import com.chromvoid.air.bridge.wire.WalletAccountsDeriveResponse
import com.chromvoid.air.bridge.wire.WalletAccountsListResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookCreateRequest
import com.chromvoid.air.bridge.wire.WalletAddressBookCreateResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookDeleteRequest
import com.chromvoid.air.bridge.wire.WalletAddressBookDeleteResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookEntry
import com.chromvoid.air.bridge.wire.WalletAddressBookListResponse
import com.chromvoid.air.bridge.wire.WalletAddressBookUpdateRequest
import com.chromvoid.air.bridge.wire.WalletAddressBookUpdateResponse
import com.chromvoid.air.bridge.wire.WalletAddressDetectResponse
import com.chromvoid.air.bridge.wire.WalletAddressesDeriveRequest
import com.chromvoid.air.bridge.wire.WalletAddressesDeriveResponse
import com.chromvoid.air.bridge.wire.WalletBackupExportRequest
import com.chromvoid.air.bridge.wire.WalletBackupExportResponse
import com.chromvoid.air.bridge.wire.WalletBalance
import com.chromvoid.air.bridge.wire.WalletBalanceGetResponse
import com.chromvoid.air.bridge.wire.WalletCapabilityState
import com.chromvoid.air.bridge.wire.WalletCapabilityStatus
import com.chromvoid.air.bridge.wire.WalletConfirmStatus
import com.chromvoid.air.bridge.wire.WalletHDCreateRequest
import com.chromvoid.air.bridge.wire.WalletHDCreateResponse
import com.chromvoid.air.bridge.wire.WalletHDGenerateMnemonicRequest
import com.chromvoid.air.bridge.wire.WalletHDGenerateMnemonicResponse
import com.chromvoid.air.bridge.wire.WalletImportCreateRequest
import com.chromvoid.air.bridge.wire.WalletImportCreateResponse
import com.chromvoid.air.bridge.wire.WalletListResponse
import com.chromvoid.air.bridge.wire.WalletNetworkStatus
import com.chromvoid.air.bridge.wire.WalletPreview
import com.chromvoid.air.bridge.wire.WalletProviderStatus
import com.chromvoid.air.bridge.wire.WalletStatusResponse
import com.chromvoid.air.bridge.wire.WalletSummary
import com.chromvoid.air.bridge.wire.WalletTonRotateKeyRequest
import com.chromvoid.air.bridge.wire.WalletTonRotateKeyResponse
import com.chromvoid.air.bridge.wire.WalletTransactionCancelRequest
import com.chromvoid.air.bridge.wire.WalletTransactionCancelResponse
import com.chromvoid.air.bridge.wire.WalletTransactionConfirmRequest
import com.chromvoid.air.bridge.wire.WalletTransactionConfirmResponse
import com.chromvoid.air.bridge.wire.WalletTransactionDirection
import com.chromvoid.air.bridge.wire.WalletTransactionEntry
import com.chromvoid.air.bridge.wire.WalletTransactionOutput
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
import com.chromvoid.air.bridge.wire.WalletWarning

/**
 * An in-memory wallet runtime answering as Core does: drafts that expire,
 * wallets with one account per supported network, live balances per account,
 * restore discovery that clears its flag, and the refusal codes Core uses.
 */
internal class FakeWalletStore(
    var enabled: Boolean = true,
    networks: List<String> = listOf("ton", "bitcoin", "ethereum"),
) : WalletStore {
    val calls = mutableListOf<String>()
    var now = 1_000L
    var networks: List<WalletNetworkStatus> = networks.map(::ready)
    val wallets = mutableListOf<WalletSummary>()
    val accounts = mutableListOf<WalletAccountMeta>()
    val cached = mutableListOf<WalletBalanceGetResponse>()

    /** Live totals by account id, in base units. */
    val live = mutableMapOf<String, String>()

    /** Thrown by the next call of any kind, once. */
    var failNext: Throwable? = null

    /** Thrown by every balance read of these accounts. */
    val balanceFailures = mutableMapOf<String, Throwable>()

    /** Refusal codes a create or import answers with. */
    var createRefusal: String? = null
    var draftLifetime = 60_000L
    private var nextId = 1

    fun ready(network: String) = WalletNetworkStatus(
        broadcastEnabled = true,
        capabilities = listOf(
            WalletCapabilityStatus(id = "${network}_native_transfer", state = WalletCapabilityState.Ready),
        ),
        enabled = true,
        network = network,
        providerStatus = WalletProviderStatus.Ready,
    )

    fun wallet(
        label: String,
        networks: List<String> = listOf("ton", "bitcoin"),
        kind: String = "hd",
        mode: String = "multichain",
        discovery: List<String>? = null,
    ): WalletSummary {
        val id = "w${nextId++}"
        val wallet = WalletSummary(
            accountDiscoveryPending = discovery,
            createdAt = now,
            kind = kind,
            label = label,
            mnemonicStandard = "rotation",
            supportedNetworks = networks,
            updatedAt = now,
            walletID = id,
            walletMode = mode,
        )
        wallets += wallet
        networks.forEach { account(id, it) }
        return wallet
    }

    fun account(walletId: String, network: String): WalletAccountMeta {
        val id = "a${nextId++}"
        val bitcoin = network == "bitcoin"
        val account = WalletAccountMeta(
            accountID = id,
            address = "$network-address-$id-0000000000",
            createdAt = now,
            kind = WalletAccountMetaKind.Derived,
            label = network,
            network = network,
            updatedAt = now,
            walletID = walletId,
            accountModel = if (bitcoin) "utxo" else "account",
            nextReceiveIndex = if (bitcoin) 0 else null,
            currentReceiveAddress = if (bitcoin) "bc1-$id-receive-0" else null,
        )
        accounts += account
        return account
    }

    private fun consume() {
        failNext?.let {
            failNext = null
            throw it
        }
    }

    override suspend fun walletStatus(generation: ULong): WalletStatusResponse {
        calls += "status"
        consume()
        return WalletStatusResponse(
            enabled = enabled,
            initialized = wallets.isNotEmpty(),
            networks = networks,
            walletCount = wallets.size.toLong(),
        )
    }

    override suspend fun walletList(generation: ULong): WalletListResponse {
        calls += "list"
        consume()
        return WalletListResponse(wallets.toList())
    }

    override suspend fun walletAccounts(walletId: String?, generation: ULong): WalletAccountsListResponse {
        calls += "accounts"
        consume()
        return WalletAccountsListResponse(accounts.toList(), cached.toList())
    }

    override suspend fun walletBalance(accountId: String, generation: ULong): WalletBalanceGetResponse {
        calls += "balance:$accountId"
        consume()
        balanceFailures[accountId]?.let { throw it }
        return balance(accountId)
    }

    override suspend fun discoverWalletAddresses(accountId: String, generation: ULong): WalletBalanceGetResponse {
        calls += "discover:$accountId"
        consume()
        val account = accounts.first { it.accountID == accountId }
        val index = wallets.indexOfFirst { it.walletID == account.walletID }
        val wallet = wallets[index]
        wallets[index] = wallet.copy(
            accountDiscoveryPending = wallet.accountDiscoveryPending.orEmpty() - account.network,
        )
        return balance(accountId)
    }

    private fun balance(accountId: String): WalletBalanceGetResponse {
        val account = accounts.first { it.accountID == accountId }
        val total = live[accountId] ?: "0"
        val response = WalletBalanceGetResponse(
            accountID = accountId,
            balance = WalletBalance(
                amountUnit = WalletNetwork.of(account.network)?.amountUnit ?: "unit",
                pendingIn = "0",
                pendingOut = "0",
                spendable = total,
                total = total,
            ),
            fetchedAt = System.currentTimeMillis() + ++now,
            network = account.network,
        )
        cached.removeAll { it.accountID == accountId }
        cached += response
        return response
    }

    val drafts = mutableListOf<WalletHDGenerateMnemonicRequest>()

    override suspend fun generateWalletMnemonic(
        request: WalletHDGenerateMnemonicRequest,
        generation: ULong,
    ): WalletHDGenerateMnemonicResponse {
        calls += "generate"
        consume()
        drafts += request
        return WalletHDGenerateMnemonicResponse(
            expiresAt = System.currentTimeMillis() + draftLifetime,
            mnemonic = List(request.wordCount.toInt()) { "word$it" },
            mnemonicDraftID = "draft${drafts.size}",
            mnemonicStandard = request.mnemonicStandard.orEmpty(),
            walletMode = request.walletMode.orEmpty(),
            wordlist = "english",
        )
    }

    val created = mutableListOf<WalletHDCreateRequest>()

    override suspend fun createHdWallet(request: WalletHDCreateRequest, generation: ULong): WalletHDCreateResponse {
        calls += "create"
        consume()
        createRefusal?.let { throw CoreRefusal(it, "wallet:hd:create") }
        created += request
        val wallet = wallet(request.label, request.supportedNetworks, mode = request.walletMode ?: "multichain")
        return WalletHDCreateResponse(accounts.filter { it.walletID == wallet.walletID }, wallet.walletID)
    }

    val imported = mutableListOf<WalletImportCreateRequest>()

    override suspend fun importWallet(
        request: WalletImportCreateRequest,
        generation: ULong,
    ): WalletImportCreateResponse {
        calls += "import"
        consume()
        createRefusal?.let { throw CoreRefusal(it, "wallet:import:create") }
        imported += request
        val wallet = wallet(request.label, listOf(request.network), kind = "imported", mode = "imported")
        return WalletImportCreateResponse(accounts.last { it.walletID == wallet.walletID }.accountID, wallet.walletID)
    }

    override suspend fun deriveWalletAccount(
        request: WalletAccountsDeriveRequest,
        generation: ULong,
    ): WalletAccountsDeriveResponse {
        calls += "derive-account:${request.network}"
        consume()
        return WalletAccountsDeriveResponse(account(request.walletID, request.network).accountID)
    }

    override suspend fun deriveWalletAddress(
        request: WalletAddressesDeriveRequest,
        generation: ULong,
    ): WalletAddressesDeriveResponse {
        calls += "derive-address:${request.accountID}"
        consume()
        val index = accounts.indexOfFirst { it.accountID == request.accountID }
        val account = accounts[index]
        val next = (account.nextReceiveIndex ?: 0) + 1
        val address = "bc1-${account.accountID}-receive-$next"
        accounts[index] = account.copy(nextReceiveIndex = next, currentReceiveAddress = address)
        return WalletAddressesDeriveResponse(request.accountID, address, "m/84'/0'/0'/0/$next", next, "pk", "receive")
    }

    // Send

    val sendCalls = mutableListOf<String>()
    var fee = "5000000"
    var spendable = "2000000000"
    var warnings: List<WalletWarning> = emptyList()
    var prepareLifetime = 60_000L
    var quoteLifetime = 60_000L
    var prepareRefusal: String? = null
    var confirmOutcome = WalletConfirmStatus.Pending
    var confirmFailure: Throwable? = null
    var cancelFails = false
    val adminPassword = "admin"
    val prepared = mutableListOf<WalletTransactionPrepareRequest>()
    val confirmed = mutableListOf<WalletTransactionConfirmRequest>()

    override suspend fun detectWalletAddress(
        address: String,
        generation: ULong,
    ): WalletAddressDetectResponse {
        sendCalls += "detect:$address"
        val network = when {
            address.startsWith("UQ") || address.startsWith("EQ") -> "ton"
            address.startsWith("bc1") -> "bitcoin"
            address.startsWith("0x") -> "ethereum"
            else -> null
        }
        return WalletAddressDetectResponse(
            address = address,
            candidates = listOfNotNull(network),
            network = network,
            normalizedAddress = network?.let { address },
        )
    }

    private fun preview(
        network: String,
        outputs: List<WalletTransactionOutput>,
    ): WalletPreview {
        val total = outputs.sumOf { it.amount.toBigInteger() } + fee.toBigInteger()
        return WalletPreview(
            amountUnit = WalletNetwork.of(network)?.amountUnit ?: "unit",
            estimatedFee = fee,
            outputs = outputs,
            totalDebit = total.toString(),
            warnings = warnings,
        )
    }

    override suspend fun quoteTransaction(
        request: WalletTransactionQuoteRequest,
        generation: ULong,
    ): WalletTransactionQuoteResponse {
        sendCalls += "quote:${request.network}:${request.maxOutputIndex}"
        consume()
        val max = (spendable.toBigInteger() - fee.toBigInteger()).toString()
        val outputs = request.outputs.map {
            WalletTransactionOutput(it.address, it.amount ?: max, it.comment)
        }
        return WalletTransactionQuoteResponse(
            accountID = request.accountID,
            currentPreview = preview(request.network, outputs),
            expiresAt = System.currentTimeMillis() + quoteLifetime,
            maxAmount = max,
            maxPreview = preview(request.network, outputs),
            network = request.network,
            quotedAt = System.currentTimeMillis(),
            spendable = spendable,
        )
    }

    override suspend fun prepareTransaction(
        request: WalletTransactionPrepareRequest,
        generation: ULong,
    ): WalletTransactionPrepareResponse {
        sendCalls += "prepare:${request.network}"
        consume()
        prepareRefusal?.let { throw CoreRefusal(it, "wallet:transaction:prepare") }
        prepared += request
        val account = accounts.first { it.accountID == request.accountID }
        return WalletTransactionPrepareResponse(
            accountID = request.accountID,
            expiresAt = System.currentTimeMillis() + prepareLifetime,
            network = request.network,
            preparationID = "prep${prepared.size}",
            preview = preview(request.network, request.outputs),
            walletID = account.walletID,
        )
    }

    override suspend fun confirmTransaction(
        request: WalletTransactionConfirmRequest,
        generation: ULong,
    ): WalletTransactionConfirmResponse {
        sendCalls += "confirm:${request.preparationID}"
        confirmFailure?.let {
            confirmFailure = null
            throw it
        }
        if (request.masterPassword != adminPassword) {
            throw CoreRefusal("EXPORT_REAUTH_FAILED", "wallet:transaction:confirm")
        }
        confirmed += request
        val preparation = prepared[request.preparationID.removePrefix("prep").toInt() - 1]
        val account = accounts.first { it.accountID == preparation.accountID }
        val txRef = "tx${confirmed.size}"
        journal += entry(
            account,
            txRef,
            preparation.outputs.first(),
            if (confirmOutcome == WalletConfirmStatus.Pending) "pending" else "broadcast_unknown",
        )
        return WalletTransactionConfirmResponse(
            network = preparation.network,
            status = confirmOutcome,
            txHash = if (confirmOutcome == WalletConfirmStatus.Pending) "hash-$txRef" else null,
            txRef = txRef,
        )
    }

    override suspend fun cancelTransaction(
        request: WalletTransactionCancelRequest,
        generation: ULong,
    ): WalletTransactionCancelResponse {
        sendCalls += "cancel:${request.preparationID}"
        if (cancelFails) throw java.io.IOException("lost")
        return WalletTransactionCancelResponse(cancelled = true)
    }

    // Activity

    val journal = mutableListOf<WalletTransactionEntry>()
    var pageSize = 50
    var syncs = 0
    var rebroadcastStatus = "pending"
    var refreshStatus: String? = null

    fun entry(
        account: WalletAccountMeta,
        txRef: String,
        output: WalletTransactionOutput = WalletTransactionOutput(
            "UQpeer",
            "1000000000",
        ),
        status: String = "confirmed",
    ): WalletTransactionEntry = WalletTransactionEntry(
        accountID = account.accountID,
        amount = output.amount,
        amountUnit = WalletNetwork.of(account.network)?.amountUnit ?: "unit",
        counterparty = output.address,
        createdAt = System.currentTimeMillis(),
        direction = WalletTransactionDirection.Outgoing,
        fee = fee,
        network = account.network,
        status = status,
        txRef = txRef,
        updatedAt = System.currentTimeMillis(),
        walletID = account.walletID,
    )

    override suspend fun walletTransactions(
        request: WalletTransactionsListRequest,
        generation: ULong,
    ): WalletTransactionsListResponse {
        calls += "transactions:${request.cursor}"
        consume()
        val mine = journal.filter { it.accountID == request.accountID }
        val start = request.cursor?.toInt() ?: 0
        val page = mine.drop(start).take(pageSize)
        val next = (start + pageSize).takeIf { it < mine.size }?.toString()
        return WalletTransactionsListResponse(next, page)
    }

    override suspend fun syncTransactions(
        request: WalletTransactionsSyncRequest,
        generation: ULong,
    ): WalletTransactionsSyncResponse {
        calls += "sync"
        consume()
        syncs++
        val account = accounts.first { it.accountID == request.accountID }
        return WalletTransactionsSyncResponse(
            request.accountID,
            System.currentTimeMillis(),
            account.network,
            0,
        )
    }

    override suspend fun refreshTransaction(
        request: WalletTransactionsRefreshRequest,
        generation: ULong,
    ): WalletTransactionsRefreshResponse {
        calls += "refresh:${request.txRef}"
        consume()
        val index = journal.indexOfFirst { it.txRef == request.txRef }
        val entry = journal[index]
        val status = refreshStatus ?: entry.status
        journal[index] = entry.copy(status = status)
        return WalletTransactionsRefreshResponse(
            entry.network,
            status,
            entry.txHash,
            entry.txRef,
            System.currentTimeMillis(),
        )
    }

    override suspend fun rebroadcastTransaction(
        request: WalletTransactionRebroadcastRequest,
        generation: ULong,
    ): WalletTransactionRebroadcastResponse {
        calls += "rebroadcast:${request.txRef}"
        consume()
        if (request.masterPassword != adminPassword) {
            throw CoreRefusal("EXPORT_REAUTH_FAILED", "wallet:transaction:rebroadcast")
        }
        val index = journal.indexOfFirst { it.txRef == request.txRef }
        val entry = journal[index]
        journal[index] = entry.copy(status = rebroadcastStatus, txHash = "hash-${entry.txRef}")
        return WalletTransactionRebroadcastResponse(
            entry.network,
            rebroadcastStatus,
            "hash-${entry.txRef}",
            entry.txRef,
            System.currentTimeMillis(),
        )
    }

    // Contacts

    val contacts = mutableListOf<WalletAddressBookEntry>()

    /** Thrown by the next contact change, once. */
    var contactFailure: Throwable? = null

    /** Core refuses an address that does not look like its network's. */
    private fun validAddress(network: String, address: String): Boolean = when (network) {
        "ton" -> address.startsWith("UQ") || address.startsWith("EQ")
        "bitcoin" -> address.startsWith("bc1")
        "ethereum" -> address.startsWith("0x")
        else -> true
    }

    private fun changeContact(command: String, network: String, address: String) {
        calls += command
        contactFailure?.let {
            contactFailure = null
            throw it
        }
        if (!validAddress(network, address)) throw CoreRefusal("INVALID_ADDRESS", "wallet:addressBook:$command")
    }

    override suspend fun walletContacts(generation: ULong): WalletAddressBookListResponse {
        calls += "contacts"
        consume()
        return WalletAddressBookListResponse(contacts.toList())
    }

    override suspend fun createWalletContact(
        request: WalletAddressBookCreateRequest,
        generation: ULong,
    ): WalletAddressBookCreateResponse {
        changeContact("contact-create", request.network, request.address)
        val entry = WalletAddressBookEntry(
            address = request.address,
            createdAt = now,
            entryID = "c${nextId++}",
            label = request.label,
            network = request.network,
            updatedAt = now,
        )
        contacts += entry
        return WalletAddressBookCreateResponse(entry)
    }

    override suspend fun updateWalletContact(
        request: WalletAddressBookUpdateRequest,
        generation: ULong,
    ): WalletAddressBookUpdateResponse {
        changeContact("contact-update", request.network, request.address)
        val index = contacts.indexOfFirst { it.entryID == request.entryID }
        if (index < 0) throw CoreRefusal("NODE_NOT_FOUND", "wallet:addressBook:update")
        val entry = contacts[index].copy(label = request.label, network = request.network, address = request.address)
        contacts[index] = entry
        return WalletAddressBookUpdateResponse(entry)
    }

    override suspend fun deleteWalletContact(
        request: WalletAddressBookDeleteRequest,
        generation: ULong,
    ): WalletAddressBookDeleteResponse {
        calls += "contact-delete"
        contactFailure?.let {
            contactFailure = null
            throw it
        }
        if (!contacts.removeIf { it.entryID == request.entryID }) {
            throw CoreRefusal("NODE_NOT_FOUND", "wallet:addressBook:delete")
        }
        return WalletAddressBookDeleteResponse(request.entryID)
    }

    // Recovery

    val phrase = List(12) { "anchor$it" }
    var passphrase: String? = null
    var exportRefusal: String? = null

    /** Accounts whose rotation is broadcast and not yet confirmed. */
    val rotating = mutableSetOf<String>()

    override suspend fun exportWalletRecovery(
        request: WalletBackupExportRequest,
        generation: ULong,
    ): WalletBackupExportResponse {
        calls += "export:${request.walletID}"
        consume()
        if (request.masterPassword != adminPassword) throw CoreRefusal("EXPORT_REAUTH_FAILED", "wallet:backup:export")
        exportRefusal?.let { throw CoreRefusal(it, "wallet:backup:export") }
        val wallet = wallets.first { it.walletID == request.walletID }
        return WalletBackupExportResponse(
            bip39Passphrase = passphrase,
            exportKind = "mnemonic",
            mnemonic = phrase,
            mnemonicStandard = wallet.mnemonicStandard ?: "bip39",
            walletID = wallet.walletID,
            walletMode = wallet.walletMode ?: "multichain",
            wordlist = "english",
        )
    }

    override suspend fun rotateTonSigningKey(
        request: WalletTonRotateKeyRequest,
        generation: ULong,
    ): WalletTonRotateKeyResponse {
        calls += "rotate:${request.accountID}"
        consume()
        if (request.masterPassword != adminPassword) throw CoreRefusal("EXPORT_REAUTH_FAILED", "wallet:ton:rotateKey")
        if (!rotating.add(request.accountID)) throw CoreRefusal("INVALID_INPUT", "wallet:ton:rotateKey")
        val account = accounts.first { it.accountID == request.accountID }
        return WalletTonRotateKeyResponse(
            accountID = account.accountID,
            mnemonic = phrase + List(12) { "signing$it" },
            mnemonicStandard = "rotation",
            newPublicKey = "pk-rotated",
            seqno = 7,
            status = "pending",
            txHash = "hash-rotation",
            validUntil = now + 60,
            walletID = account.walletID,
            wordlist = "english",
        )
    }
}
