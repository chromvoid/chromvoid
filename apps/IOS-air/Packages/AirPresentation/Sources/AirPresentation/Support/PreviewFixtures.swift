#if DEBUG
  import ChromVoidBridge
  import Foundation

  /// In-memory wallet stores and ready-made models for Xcode previews. Everything answers
  /// immediately with plausible data and every mutation succeeds; nothing here touches the Rust
  /// runtime, the pasteboard or the network.
  enum WalletPreviewFixtures {
    static let mainWalletID = "wallet-main"
    static let telegramWalletID = "wallet-telegram"
    static let tonAccountID = "acct-ton"
    static let bitcoinAccountID = "acct-bitcoin"
    static let ethereumAccountID = "acct-ethereum"
    static let solanaAccountID = "acct-solana"
    static let telegramAccountID = "acct-telegram-ton"

    /// A wallet model over the preview stores, already reloading. With `selectedNetwork` the
    /// network screen of that account of the main wallet is pushed once the catalog is ready.
    @MainActor static func model(selectedNetwork: String? = nil) -> WalletModel {
      let store = WalletPreviewStore()
      let model = WalletModel(
        store: store, contacts: store, history: store, send: store, recovery: store,
        generation: 1, clipboard: PreviewClipboard())
      let reload = model.reload()
      if let selectedNetwork {
        Task { @MainActor in
          await reload?.value
          guard model.state == .ready,
            let account = model.walletAccounts.first(where: { $0.network == selectedNetwork })
          else { return }
          model.openNetwork(account.accountID)
        }
      }
      return model
    }

    /// The wallet model with the Receive sheet of the selected (TON) account opened.
    @MainActor static func receiveModel() -> WalletModel {
      let model = model()
      Task { @MainActor in
        while model.state == .loading { try? await Task.sleep(for: .milliseconds(20)) }
        model.openReceive()
      }
      return model
    }

    /// A Send draft from the TON account of the main wallet, or nil when the network has no
    /// presentation profile (it always has one; the optional only avoids a force unwrap).
    @MainActor static func sendModel() -> WalletSendModel? {
      guard let profile = WalletNetworkPresentation.profile(for: "ton") else { return nil }
      let store = WalletPreviewStore()
      let model = WalletSendModel(
        walletID: mainWalletID, accountID: tonAccountID, profile: profile,
        status: store.status, store: store, generation: 1)
      model.accountResolver = { network in
        guard
          let account = store.accounts.first(where: {
            $0.walletID == mainWalletID && $0.network == network
          }), let profile = WalletNetworkPresentation.profile(for: network)
        else { return nil }
        return (account.accountID, profile)
      }
      return model
    }

    /// Contacts over the preview store, already loading.
    @MainActor static func addressBookModel() -> WalletAddressBookModel {
      let store = WalletPreviewStore()
      let model = WalletAddressBookModel(store: store, generation: 1, clipboard: PreviewClipboard())
      model.updateNetworks(store.status.networks.map(\.network))
      model.reload()
      return model
    }
  }

  private enum WalletPreviewError: Error { case notFound }

  @MainActor
  private final class PreviewClipboard: CredentialClipboard {
    func copy(_ value: String) {}
    func clearOwned() {}
  }

  /// One object answers every wallet store protocol so a single instance backs a whole model.
  @MainActor
  final class WalletPreviewStore: WalletStore, WalletAddressBookStore, WalletHistoryStore,
    WalletSendStore, WalletRecoveryStore
  {
    /// Milliseconds, like every Core timestamp.
    private let now: Int
    private static let minute = 60_000
    private static let hour = 3_600_000
    private static let day = 86_400_000

    let status = WalletStatusResponse(
      disabledReason: nil, enabled: true, initialized: true,
      networks: ["ton", "bitcoin", "ethereum", "solana"].map { network in
        WalletNetworkStatus(
          broadcastEnabled: true,
          capabilities: [
            WalletCapabilityStatus(
              disabledReason: nil, id: network + "_native_transfer", state: .ready)
          ],
          disabledReason: nil, enabled: true, network: network, providerStatus: .ready)
      }, walletCount: 2)

    private(set) var wallets: [WalletSummary]
    private(set) var accounts: [WalletAccountMeta]
    private(set) var balances: [WalletBalanceGetResponse]
    private(set) var contacts: [WalletAddressBookEntry]
    private(set) var transactions: [WalletTransactionEntry]

    init() {
      let now = Int(Date().timeIntervalSince1970 * 1_000)
      self.now = now
      let created = now - 40 * Self.day
      wallets = [
        WalletSummary(
          accountDiscoveryPending: nil, bitcoinDiscoveryPending: false, createdAt: created,
          kind: "hd", label: "Main wallet",
          mnemonicStandard: "rotation",
          supportedNetworks: ["ton", "bitcoin", "ethereum", "solana"],
          updatedAt: now - 2 * Self.day, walletID: WalletPreviewFixtures.mainWalletID,
          walletMode: "multichain"),
        WalletSummary(
          accountDiscoveryPending: nil, bitcoinDiscoveryPending: nil,
          createdAt: created + 3 * Self.day, kind: "hd",
          label: "Telegram Wallet", mnemonicStandard: "bip39", supportedNetworks: ["ton"],
          updatedAt: now - 9 * Self.day, walletID: WalletPreviewFixtures.telegramWalletID,
          walletMode: "ton_only"),
      ]
      accounts = [
        Self.account(
          WalletPreviewFixtures.tonAccountID, wallet: WalletPreviewFixtures.mainWalletID,
          network: "ton", label: "TON",
          address: "EQpOnC1-4EakoKm5b-OAYGSTWjRlLK6sNdVU72lZ_o2-YH19", model: "account",
          derivationPath: "m/44'/607'/0'/0'/0'", profile: "ton", mnemonicStandard: "rotation",
          createdAt: created),
        Self.account(
          WalletPreviewFixtures.bitcoinAccountID, wallet: WalletPreviewFixtures.mainWalletID,
          network: "bitcoin", label: "Bitcoin",
          address: "bc1qp75nu58la2fdm4awyezvtzruv7pgdg2tc3m69c", model: "utxo",
          derivationPath: "m/84'/0'/0'", profile: "bip84", mnemonicStandard: "rotation",
          createdAt: created, receiveAddress: "bc1qntktsal6jat57u83xdwq9a46tpk2kd83dj3gxs",
          receiveDerivationPath: "m/84'/0'/0'/0/3", nextReceiveIndex: 4),
        Self.account(
          WalletPreviewFixtures.ethereumAccountID, wallet: WalletPreviewFixtures.mainWalletID,
          network: "ethereum", label: "Ethereum",
          address: "0x3d531b53a829a58820d8d01370933bae1ca6ed3b", model: "account",
          derivationPath: "m/44'/60'/0'/0/0", profile: "bip44", mnemonicStandard: "rotation",
          createdAt: created),
        Self.account(
          WalletPreviewFixtures.solanaAccountID, wallet: WalletPreviewFixtures.mainWalletID,
          network: "solana", label: "Solana",
          address: "yHsAF22JbXTHM9he6vCc3ixuZuHNhaqpM4jv1hGX4FkZ", model: "account",
          derivationPath: "m/44'/501'/0'/0'", profile: "bip44", mnemonicStandard: "rotation",
          createdAt: created),
        Self.account(
          WalletPreviewFixtures.telegramAccountID, wallet: WalletPreviewFixtures.telegramWalletID,
          network: "ton", label: "TON",
          address: "UQdCqgn28s9Dp68GZN9Z3zLIbet6-UzH-7_3eLO6m4H5x29i", model: "account",
          derivationPath: "m/44'/607'/0'", profile: "ton", mnemonicStandard: "bip39",
          createdAt: created + 3 * Self.day),
      ]
      // 12.5 TON, 0.031 BTC, 0.42 ETH, 3.2 SOL and 48.75 TON in base units.
      balances = [
        Self.balance(
          WalletPreviewFixtures.tonAccountID, network: "ton", unit: "nanoton",
          total: "12500000000", pendingIn: "0", fetchedAt: now - 3 * Self.minute),
        Self.balance(
          WalletPreviewFixtures.bitcoinAccountID, network: "bitcoin", unit: "satoshi",
          total: "3100000", pendingIn: "150000", fetchedAt: now - 12 * Self.minute),
        Self.balance(
          WalletPreviewFixtures.ethereumAccountID, network: "ethereum", unit: "wei",
          total: "420000000000000000", pendingIn: "0", fetchedAt: now - 5 * Self.minute),
        Self.balance(
          WalletPreviewFixtures.solanaAccountID, network: "solana", unit: "lamport",
          total: "3200000000", pendingIn: "0", fetchedAt: now - 8 * Self.minute),
        Self.balance(
          WalletPreviewFixtures.telegramAccountID, network: "ton", unit: "nanoton",
          total: "48750000000", pendingIn: "0", fetchedAt: now - Self.hour),
      ]
      contacts = [
        WalletAddressBookEntry(
          address: "EQI_Vmy0s5bla5kzFpfITtaO-rC8qLk1urN0XtzWbnXjgSTd", createdAt: created,
          entryID: "contact-alice", label: "Alice", network: "ton", updatedAt: created),
        WalletAddressBookEntry(
          address: "0x8c9b1d09a939da0a61353314b90d4bdcc7d7450c", createdAt: created + Self.day,
          entryID: "contact-exchange", label: "Exchange deposit", network: "ethereum",
          updatedAt: created + Self.day),
      ]
      transactions = [
        Self.transaction(
          "tx-ton-3", account: WalletPreviewFixtures.tonAccountID, network: "ton",
          unit: "nanoton", amount: "2000000000", fee: "5500000", direction: .outgoing,
          status: "pending", counterparty: "EQI_Vmy0s5bla5kzFpfITtaO-rC8qLk1urN0XtzWbnXjgSTd",
          hash: nil, at: now - 4 * Self.minute),
        Self.transaction(
          "tx-ton-2", account: WalletPreviewFixtures.tonAccountID, network: "ton",
          unit: "nanoton", amount: "14500000000", fee: "0", direction: .incoming,
          status: "confirmed", counterparty: "UQdCqgn28s9Dp68GZN9Z3zLIbet6-UzH-7_3eLO6m4H5x29i",
          hash: "4cb78a6bbeef965d4f0bd1529b8430691cc5324ca89165999b4c60fdb505a450",
          at: now - 2 * Self.day),
        Self.transaction(
          "tx-ton-1", account: WalletPreviewFixtures.tonAccountID, network: "ton",
          unit: "nanoton", amount: "750000000", fee: "4200000", direction: .outgoing,
          status: "confirmed", counterparty: "EQI_Vmy0s5bla5kzFpfITtaO-rC8qLk1urN0XtzWbnXjgSTd",
          hash: "30b2b964743af32c893bff37beb222f9875adaafca56e7bbdc64e4d8a3a8e848",
          at: now - 6 * Self.day),
        Self.transaction(
          "tx-btc-1", account: WalletPreviewFixtures.bitcoinAccountID, network: "bitcoin",
          unit: "satoshi", amount: "3100000", fee: "0", direction: .incoming,
          status: "confirmed", counterparty: nil,
          hash: "7a4389ecc0ada3f6dba1c50884adffa01738a06e8b26034a7e6592d4308d157f",
          at: now - 11 * Self.day),
      ]
    }

    // MARK: WalletStore

    func walletStatus(generation: UInt64) async throws -> WalletStatusResponse { status }
    func walletList(generation: UInt64) async throws -> WalletListResponse {
      WalletListResponse(wallets: wallets)
    }
    func walletAccounts(walletID: String?, generation: UInt64) async throws
      -> WalletAccountsListResponse
    {
      let listed = accounts.filter { walletID == nil || $0.walletID == walletID }
      let ids = Set(listed.map(\.accountID))
      return WalletAccountsListResponse(
        accounts: listed, cachedBalances: balances.filter { ids.contains($0.accountID) })
    }
    func walletBalance(accountID: String, generation: UInt64) async throws
      -> WalletBalanceGetResponse
    {
      guard let cached = balances.first(where: { $0.accountID == accountID }) else {
        throw WalletPreviewError.notFound
      }
      let fresh = WalletBalanceGetResponse(
        accountID: cached.accountID, balance: cached.balance, fetchedAt: now,
        network: cached.network)
      balances = balances.map { $0.accountID == accountID ? fresh : $0 }
      return fresh
    }
    func deriveWalletAccount(_ request: WalletAccountsDeriveRequest, generation: UInt64)
      async throws -> WalletAccountsDeriveResponse
    {
      let id = "acct-" + request.network + "-" + String(accounts.count)
      accounts.append(
        Self.account(
          id, wallet: request.walletID, network: request.network,
          label: WalletNetworkPresentation.displayName(for: request.network) + " 2",
          address: nil, model: request.network == "bitcoin" ? "utxo" : "account",
          derivationPath: nil, profile: nil, mnemonicStandard: "rotation", createdAt: now))
      return WalletAccountsDeriveResponse(accountID: id)
    }
    func deriveWalletAddress(_ request: WalletAddressesDeriveRequest, generation: UInt64)
      async throws -> WalletAddressesDeriveResponse
    {
      guard let index = accounts.firstIndex(where: { $0.accountID == request.accountID }) else {
        throw WalletPreviewError.notFound
      }
      let next = (accounts[index].nextReceiveIndex ?? 0) + 1
      let address = "bc1qntktsal6jat57u83xdwq9a46tpk2kd83dj3gxs"
      accounts[index] = Self.account(
        request.accountID, wallet: accounts[index].walletID, network: accounts[index].network,
        label: accounts[index].label, address: accounts[index].address,
        model: accounts[index].accountModel, derivationPath: accounts[index].derivationPath,
        profile: accounts[index].derivationProfile,
        mnemonicStandard: accounts[index].mnemonicStandard,
        createdAt: accounts[index].createdAt, receiveAddress: address,
        receiveDerivationPath: "m/84'/0'/0'/0/" + String(next), nextReceiveIndex: next + 1)
      return WalletAddressesDeriveResponse(
        accountID: request.accountID, address: address,
        derivationPath: "m/84'/0'/0'/0/" + String(next), index: next,
        publicKey: "aabaf8fa81f40fb8e6b8c961d29f2afaab5258c360e76d468f4abc6444411895",
        purpose: request.purpose)
    }
    func generateWalletMnemonic(_ request: WalletHDGenerateMnemonicRequest, generation: UInt64)
      async throws -> WalletHDGenerateMnemonicResponse
    {
      WalletHDGenerateMnemonicResponse(
        expiresAt: now + 10 * Self.minute, mnemonic: Self.words, mnemonicDraftID: "draft-preview",
        mnemonicStandard: "rotation", walletMode: "multichain", wordlist: "english")
    }
    func createHDWallet(_ request: WalletHDCreateRequest, generation: UInt64) async throws
      -> WalletHDCreateResponse
    {
      let id = "wallet-" + String(wallets.count + 1)
      wallets.append(
        WalletSummary(
          accountDiscoveryPending: nil, bitcoinDiscoveryPending: false, createdAt: now, kind: "hd",
          label: "New wallet",
          mnemonicStandard: "rotation",
          supportedNetworks: ["ton", "bitcoin", "ethereum", "solana"],
          updatedAt: now, walletID: id, walletMode: "multichain"))
      let account = Self.account(
        id + "-ton", wallet: id, network: "ton", label: "TON", address: nil, model: "account",
        derivationPath: "m/44'/607'/0'/0'/0'", profile: "ton", mnemonicStandard: "rotation",
        createdAt: now)
      accounts.append(account)
      return WalletHDCreateResponse(accounts: [account], walletID: id)
    }
    func importWallet(_ request: WalletImportCreateRequest, generation: UInt64) async throws
      -> WalletImportCreateResponse
    {
      let id = "wallet-" + String(wallets.count + 1)
      wallets.append(
        WalletSummary(
          accountDiscoveryPending: nil, bitcoinDiscoveryPending: nil, createdAt: now,
          kind: "imported", label: "Imported key",
          mnemonicStandard: "none", supportedNetworks: ["ethereum"], updatedAt: now,
          walletID: id, walletMode: nil))
      accounts.append(
        Self.account(
          id + "-ethereum", wallet: id, network: "ethereum", label: "Ethereum", address: nil,
          model: "account", derivationPath: nil, profile: nil, mnemonicStandard: nil,
          createdAt: now))
      return WalletImportCreateResponse(accountID: id + "-ethereum", walletID: id)
    }

    // MARK: WalletAddressBookStore

    func listWalletContacts(generation: UInt64) async throws -> WalletAddressBookListResponse {
      WalletAddressBookListResponse(entries: contacts)
    }
    func createWalletContact(_ request: WalletAddressBookCreateRequest, generation: UInt64)
      async throws -> WalletAddressBookCreateResponse
    {
      let entry = WalletAddressBookEntry(
        address: request.address, createdAt: now, entryID: "contact-" + String(contacts.count),
        label: request.label, network: request.network, updatedAt: now)
      contacts.append(entry)
      return WalletAddressBookCreateResponse(entry: entry)
    }
    func updateWalletContact(_ request: WalletAddressBookUpdateRequest, generation: UInt64)
      async throws -> WalletAddressBookUpdateResponse
    {
      let entry = WalletAddressBookEntry(
        address: request.address, createdAt: now, entryID: request.entryID, label: request.label,
        network: request.network, updatedAt: now)
      contacts = contacts.map { $0.entryID == request.entryID ? entry : $0 }
      return WalletAddressBookUpdateResponse(entry: entry)
    }
    func deleteWalletContact(_ request: WalletAddressBookDeleteRequest, generation: UInt64)
      async throws -> WalletAddressBookDeleteResponse
    {
      contacts.removeAll { $0.entryID == request.entryID }
      return WalletAddressBookDeleteResponse(entryID: request.entryID)
    }

    // MARK: WalletHistoryStore

    func walletTransactions(_ request: WalletTransactionsListRequest, generation: UInt64)
      async throws -> WalletTransactionsListResponse
    {
      let listed = transactions.filter {
        (request.accountID == nil || $0.accountID == request.accountID)
          && (request.walletID == nil || $0.walletID == request.walletID)
          && (request.status == nil || $0.status == request.status)
      }
      return WalletTransactionsListResponse(nextCursor: nil, transactions: listed)
    }
    func syncWalletTransactions(_ request: WalletTransactionsSyncRequest, generation: UInt64)
      async throws -> WalletTransactionsSyncResponse
    {
      let network = accounts.first { $0.accountID == request.accountID }?.network ?? "ton"
      return WalletTransactionsSyncResponse(
        accountID: request.accountID, fetchedAt: now, network: network, syncedCount: 0)
    }
    func refreshWalletTransaction(_ request: WalletTransactionsRefreshRequest, generation: UInt64)
      async throws -> WalletTransactionsRefreshResponse
    {
      guard let entry = transactions.first(where: { $0.txRef == request.txRef }) else {
        throw WalletPreviewError.notFound
      }
      return WalletTransactionsRefreshResponse(
        network: entry.network, status: entry.status, txHash: entry.txHash, txRef: entry.txRef,
        updatedAt: now)
    }

    // MARK: WalletSendStore

    func detectWalletAddress(_ address: String, generation: UInt64) async throws
      -> WalletAddressDetectResponse
    {
      let network: String?
      if address.hasPrefix("EQ") || address.hasPrefix("UQ") {
        network = "ton"
      } else if address.hasPrefix("bc1") {
        network = "bitcoin"
      } else if address.hasPrefix("0x") {
        network = "ethereum"
      } else if address.count >= 32 {
        network = "solana"
      } else {
        network = nil
      }
      return WalletAddressDetectResponse(
        address: address, candidates: network.map { [$0] } ?? [], network: network,
        normalizedAddress: network == nil ? nil : address)
    }
    func quoteWalletTransaction(_ request: WalletTransactionQuoteRequest, generation: UInt64)
      async throws -> WalletTransactionQuoteResponse
    {
      let account = accounts.first { $0.accountID == request.accountID }
      let network = account?.network ?? "ton"
      let spendable = balances.first { $0.accountID == request.accountID }?.balance.spendable
      let preview = preview(network: network)
      return WalletTransactionQuoteResponse(
        accountID: request.accountID, currentPreview: preview, expiresAt: now + 2 * Self.minute,
        maxAmount: spendable ?? "0", maxPreview: preview, network: network, quotedAt: now,
        spendable: spendable ?? "0")
    }
    func prepareWalletTransaction(_ request: WalletTransactionPrepareRequest, generation: UInt64)
      async throws -> WalletTransactionPrepareResponse
    {
      let account = accounts.first { $0.accountID == request.accountID }
      let network = account?.network ?? "ton"
      return WalletTransactionPrepareResponse(
        accountID: request.accountID, expiresAt: now + 5 * Self.minute, network: network,
        preparationID: "prepared-preview", preview: preview(network: network),
        walletID: account?.walletID ?? WalletPreviewFixtures.mainWalletID)
    }
    func confirmWalletTransaction(_ request: WalletTransactionConfirmRequest, generation: UInt64)
      async throws -> WalletTransactionConfirmResponse
    {
      WalletTransactionConfirmResponse(
        network: "ton", status: .pending, txHash: nil, txRef: "tx-preview-sent")
    }
    func cancelWalletTransaction(_ request: WalletTransactionCancelRequest, generation: UInt64)
      async throws -> WalletTransactionCancelResponse
    {
      WalletTransactionCancelResponse(cancelled: true)
    }
    func rebroadcastWalletTransaction(
      _ request: WalletTransactionRebroadcastRequest, generation: UInt64
    ) async throws -> WalletTransactionRebroadcastResponse {
      WalletTransactionRebroadcastResponse(
        network: "ton", status: "pending",
        txHash: "4cb78a6bbeef965d4f0bd1529b8430691cc5324ca89165999b4c60fdb505a450",
        txRef: request.txRef, updatedAt: now)
    }
    private func preview(network: String) -> WalletPreview {
      let profile = WalletNetworkPresentation.profile(for: network)
      return WalletPreview(
        amountUnit: profile?.amountUnit ?? "nanoton", estimatedFee: "5500000", ethereum: nil,
        outputs: [
          WalletTransactionOutput(
            address: "EQI_Vmy0s5bla5kzFpfITtaO-rC8qLk1urN0XtzWbnXjgSTd", amount: "2000000000",
            comment: nil)
        ],
        solana: nil, ton: nil, totalDebit: "2005500000", warnings: [])
    }

    // MARK: WalletRecoveryStore

    func exportWalletRecovery(_ request: WalletBackupExportRequest, generation: UInt64)
      async throws -> WalletBackupExportResponse
    {
      let wallet = wallets.first { $0.walletID == request.walletID }
      return WalletBackupExportResponse(
        bip39Passphrase: nil, exportKind: "mnemonic", mnemonic: Self.words,
        mnemonicStandard: wallet?.mnemonicStandard ?? "rotation", walletID: request.walletID,
        walletMode: wallet?.walletMode ?? "multichain", wordlist: "english")
    }
    func rotateTonSigningKey(_ request: WalletTonRotateKeyRequest, generation: UInt64)
      async throws -> WalletTonRotateKeyResponse
    {
      WalletTonRotateKeyResponse(
        accountID: request.accountID, messageRef: "rotate-preview", mnemonic: Self.words,
        mnemonicStandard: "rotation",
        newPublicKey: "aabaf8fa81f40fb8e6b8c961d29f2afaab5258c360e76d468f4abc6444411895",
        seqno: 42, status: "pending", txHash: nil, validUntil: now + 10 * Self.minute,
        walletID: WalletPreviewFixtures.mainWalletID, wordlist: "english")
    }

    // MARK: Builders

    /// Not a real phrase: repeated placeholder words, so nothing shown resembles a secret.
    private static let words = [
      "sample", "orbit", "lantern", "meadow", "quartz", "harbor", "velvet", "ember", "cobalt",
      "summit", "willow", "ripple", "canyon", "marble", "beacon", "thistle", "saffron", "glacier",
      "pebble", "tundra", "cinder", "juniper", "nectar", "zephyr",
    ]

    private static func account(
      _ id: String, wallet: String, network: String, label: String?, address: String?,
      model: String?, derivationPath: String?, profile: String?, mnemonicStandard: String?,
      createdAt: Int, receiveAddress: String? = nil, receiveDerivationPath: String? = nil,
      nextReceiveIndex: Int? = nil
    ) -> WalletAccountMeta {
      WalletAccountMeta(
        accountID: id, address: address, createdAt: createdAt, curve: nil, kind: .derived,
        label: label, network: network, publicKey: nil, rawAccount: nil, updatedAt: createdAt,
        walletContract: network == "ton" ? "wallet_tg" : nil, walletID: wallet,
        workchain: network == "ton" ? 0 : nil, accountIndex: 0, accountModel: model,
        currentReceiveAddress: receiveAddress, currentReceiveDerivationPath: receiveDerivationPath,
        derivationPath: derivationPath, derivationProfile: profile,
        mnemonicStandard: mnemonicStandard, nextChangeIndex: model == "utxo" ? 1 : nil,
        nextReceiveIndex: nextReceiveIndex ?? (model == "utxo" ? 0 : nil),
        walletMode: wallet == WalletPreviewFixtures.telegramWalletID ? "ton_only" : "multichain")
    }

    private static func balance(
      _ id: String, network: String, unit: String, total: String, pendingIn: String,
      fetchedAt: Int
    ) -> WalletBalanceGetResponse {
      WalletBalanceGetResponse(
        accountID: id,
        balance: WalletBalance(
          amountUnit: unit, pendingIn: pendingIn, pendingOut: "0", spendable: total, total: total),
        fetchedAt: fetchedAt, network: network)
    }

    private static func transaction(
      _ ref: String, account: String, network: String, unit: String, amount: String, fee: String,
      direction: WalletTransactionDirection, status: String, counterparty: String?,
      hash: String?, at: Int
    ) -> WalletTransactionEntry {
      WalletTransactionEntry(
        accountID: account, amount: amount, amountUnit: unit, broadcastArtifactRef: nil,
        counterparty: counterparty, createdAt: at, direction: direction, fee: fee,
        messageRef: nil, network: network, status: status, txHash: hash, txRef: ref,
        updatedAt: at, validUntil: status == "pending" ? at + 10 * minute : nil,
        walletID: WalletPreviewFixtures.mainWalletID)
    }
  }

  /// In-memory credential stores and ready-made models for Xcode previews. One login with a
  /// password, a note, two websites and a time-based code, one payment card, a few groups and
  /// tags. Everything answers immediately, every mutation succeeds as a no-op, and nothing
  /// here touches the Rust runtime, the pasteboard or the file system.
  enum CredentialPreviewFixtures {
    static let loginID = "entry-login"
    static let cardID = "entry-card"

    /// The vault root over the preview store, already reloading.
    @MainActor static func catalogModel() -> CredentialsModel {
      let store = CredentialPreviewStore()
      let model = CredentialsModel(
        store: store, generation: 1, clipboard: PreviewClipboard(), passkeys: store)
      model.reload()
      return model
    }

    /// The page of the synthetic login, or of the payment card, already loading.
    @MainActor static func detailModel(card: Bool = false) -> CredentialDetailModel {
      CredentialDetailModel(
        id: card ? cardID : loginID, store: CredentialPreviewStore(), generation: 1,
        clipboard: PreviewClipboard(), onMutation: {})
    }

    /// The one-time codes of the synthetic login, with the first code requested.
    @MainActor static func otpModel() -> CredentialOTPModel {
      CredentialOTPModel(
        id: loginID, store: CredentialPreviewStore(), generation: 1,
        clipboard: PreviewClipboard(), showsFirstCode: true, onMutation: {})
    }
  }

  private enum CredentialPreviewError: Error { case notFound, unsupported }

  /// One object answers every credential store protocol and the passkey list, so a single
  /// instance backs a whole model. Secret values are placeholders, not real credentials.
  @MainActor
  final class CredentialPreviewStore: CredentialStore, PasskeyStore {
    private static let revision = "preview-revision"
    private static let now = Int(Date().timeIntervalSince1970 * 1_000)

    private static let login = CredentialSummary(
      entryType: "login", groupKey: nil, groupPath: "/", hasCodes: false, iconRef: nil,
      id: CredentialPreviewFixtures.loginID,
      title: "Synthetic login", username: "alice", website: nil)
    private static let card = CredentialSummary(
      entryType: "payment_card", groupKey: nil, groupPath: "/", hasCodes: false, iconRef: nil,
      id: CredentialPreviewFixtures.cardID, title: "Synthetic card", username: "", website: nil)
    private static let work = CredentialSummary(
      entryType: "login", groupKey: nil, groupPath: "/Work", hasCodes: false, iconRef: nil,
      id: "entry-work",
      title: "Work mail", username: "alice@work.example", website: nil)
    private static let archived = CredentialSummary(
      entryType: "login", groupKey: nil, groupPath: "/Archive/Nested", hasCodes: false,
      iconRef: nil, id: "entry-archived",
      title: "Old forum", username: "alice-2019", website: nil)
    private let entries = [login, card, work, archived]
    private let groups: [String: [PassmanagerGroupSummary]] = [
      "/": [
        PassmanagerGroupSummary(entryCount: 1, path: "/Work"),
        PassmanagerGroupSummary(entryCount: 1, path: "/Archive"),
      ],
      "/Archive": [PassmanagerGroupSummary(entryCount: 1, path: "/Archive/Nested")],
    ]
    private let tags = [
      CredentialTagSummary(colorID: "blue", count: 2, key: "personal", label: "Personal"),
      CredentialTagSummary(colorID: "green", count: 1, key: "work", label: "Work"),
    ]
    private let websites = ["https://example.org", "mail.example.org"]
    /// Placeholders only; the note explains itself and the card number is the classic test one.
    private let secrets: [String: [String: String]] = [
      CredentialPreviewFixtures.loginID: [
        "password": "preview-pass-word-42",
        "note": "Recovery codes are in the paper envelope in the desk drawer.",
      ],
      CredentialPreviewFixtures.cardID: ["card_pan": "4111111111111111", "card_cvv": "123"],
    ]
    private let otpRecords = [
      CredentialOtpSummary(
        algorithm: "SHA1", counter: nil, digits: 6, encoding: "base32", label: "First code",
        otpType: "TOTP", period: 30)
    ]
    private let sshKeys = [
      SSHKeyMetadata(
        comment: "alice@laptop", createdTs: now - 86_400_000,
        fingerprint: "SHA256:2s1h5eL2yq0Yd7X1fN8c9rKq3wJ0bP4mT6vZ8aQ1cE0", id: "ssh-laptop",
        name: "Laptop", sourceEntryID: nil, type: "ed25519", updatedTs: now - 86_400_000)
    ]
    private let passkeys = [
      VaultPasskeySummary(
        createdAtEpochMS: now - 3 * 86_400_000, credentialIDB64URL: "cHJldmlldy1wYXNza2V5LTE",
        lastUsedEpochMS: now - 3_600_000, portable: true, rpID: "example.org",
        rpName: "Example", signCount: 4, storageKind: "vault", userDisplayName: "Alice",
        userName: "alice"),
      VaultPasskeySummary(
        createdAtEpochMS: now - 20 * 86_400_000, credentialIDB64URL: "cHJldmlldy1wYXNza2V5LTI",
        lastUsedEpochMS: now - 5 * 86_400_000, portable: false, rpID: "work.example",
        rpName: "Work", signCount: 12, storageKind: "vault", userDisplayName: "Alice",
        userName: "alice@work.example"),
    ]

    // MARK: CredentialStore

    func credentialPage(_ request: PassmanagerEntryPageRequest, generation: UInt64) async throws
      -> PassmanagerEntryPageResponse
    {
      let query = request.query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      let listed = entries.filter { entry in
        if let groupPath = request.groupPath, !groupPath.isEmpty, groupPath != "/" {
          guard entry.groupPath == groupPath || entry.groupPath.hasPrefix(groupPath + "/")
          else { return false }
        }
        if let entryType = request.entryType, !entryType.isEmpty, entry.entryType != entryType {
          return false
        }
        if request.quickFilters?.contains("otp") == true,
          entry.id != CredentialPreviewFixtures.loginID
        {
          return false
        }
        if request.quickFilters?.contains("ssh") == true { return false }
        if request.tagKey == "work", entry.id != Self.work.id { return false }
        if request.tagKey == "personal", entry.id == Self.work.id { return false }
        guard !query.isEmpty else { return true }
        return entry.title.lowercased().contains(query)
          || entry.username.lowercased().contains(query)
      }
      return PassmanagerEntryPageResponse(entries: listed, nextOffset: nil, totalCount: nil)
    }
    func credentialDetail(id: String, generation: UInt64) async throws -> CredentialDetail {
      guard let entry = entries.first(where: { $0.id == id }) else {
        throw CredentialPreviewError.notFound
      }
      let isCard = entry.entryType == "payment_card"
      return CredentialDetail(
        entryType: entry.entryType, groupPath: entry.groupPath, id: id,
        paymentCard: isCard
          ? PaymentCardMetadata(
            brand: "visa", cardholderName: "Alice Cardholder", expMonth: 12, expYear: 2030,
            last4: "1111") : nil,
        revision: Self.revision, tagKeys: entry.id == Self.work.id ? ["work"] : ["personal"],
        tags: entry.id == Self.work.id ? ["Work"] : ["Personal"], title: entry.title,
        username: entry.username, websites: isCard ? [] : websites, websitesEditable: !isCard)
    }
    func readCredentialSecret(id: String, type: String, generation: UInt64) async throws -> String {
      secrets[id]?[type] ?? ""
    }
    func saveCredentialSecret(id: String, type: String, value: String, generation: UInt64)
      async throws
    {}
    func deleteCredential(id: String, generation: UInt64) async throws {}
    func updateCredential(_ request: PassmanagerEntryUpdateRequest, generation: UInt64)
      async throws -> PassmanagerEntrySaveResponse
    {
      PassmanagerEntrySaveResponse(entryID: request.entryID)
    }
    func createCredential(_ request: PassmanagerEntryCreateRequest, generation: UInt64)
      async throws -> PassmanagerEntrySaveResponse
    {
      PassmanagerEntrySaveResponse(entryID: request.entryID)
    }

    // MARK: CredentialGroupStore

    func groupPage(parent: String, offset: UInt32, generation: UInt64) async throws
      -> PassmanagerGroupPageResponse
    {
      PassmanagerGroupPageResponse(groups: groups[parent] ?? [], nextOffset: nil, parent: parent)
    }
    func ensureGroup(path: String, generation: UInt64) async throws {}
    func renameGroup(path: String, name: String, generation: UInt64) async throws {}
    func deleteGroup(path: String, generation: UInt64) async throws {}

    // MARK: CredentialTagStore

    func tagPage(offset: UInt32, generation: UInt64) async throws -> PassmanagerTagPageResponse {
      PassmanagerTagPageResponse(nextOffset: nil, tags: tags)
    }
    func saveTag(sourceKey: String?, label: String, colorID: String, generation: UInt64)
      async throws -> CredentialTagSummary
    {
      CredentialTagSummary(colorID: colorID, count: 0, key: sourceKey ?? label, label: label)
    }
    func deleteTag(key: String, generation: UInt64) async throws {}

    // MARK: CredentialOTPStore

    func otpRecords(id: String, generation: UInt64) async throws -> PassmanagerOtpRecordsResponse {
      PassmanagerOtpRecordsResponse(
        records: id == CredentialPreviewFixtures.loginID ? otpRecords : [],
        revision: Self.revision)
    }
    func otpCode(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws
      -> OtpPreviewResponse
    {
      // A code that changes with the period, so the countdown and the digits stay in step.
      let seconds = Int(Date().timeIntervalSince1970)
      let step = seconds / 30
      let otp = String(format: "%06d", (step &* 7_919) % 1_000_000)
      return OtpPreviewResponse(leftSeconds: 30 - seconds % 30, otp: otp, period: 30)
    }
    func parseOTPURI(_ uri: String, generation: UInt64) async throws
      -> PassmanagerOtpURIResponse
    {
      PassmanagerOtpURIResponse(
        account: "alice", issuer: "Example", secret: "JBSWY3DPEHPK3PXP",
        settings: CredentialOtpSummary(
          algorithm: "SHA1", counter: nil, digits: 6, encoding: "base32", label: "Example",
          otpType: "TOTP", period: 30))
    }
    func saveOTP(_ request: PassmanagerOtpRecordSaveRequest, generation: UInt64) async throws {}
    func deleteOTP(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws {}

    // MARK: PasswordGeneratorStore

    func generatePassword(_ request: PassmanagerPasswordGenerateRequest, generation: UInt64)
      async throws -> String
    {
      String(repeating: "preview-", count: max(1, request.length / 8)).prefix(request.length)
        .description
    }

    // MARK: CredentialAuditStore

    func securityAuditPage(_ request: PassmanagerSecurityAuditPageRequest, generation: UInt64)
      async throws -> PassmanagerSecurityAuditPageResponse
    {
      PassmanagerSecurityAuditPageResponse(
        algorithmVersion: 1,
        entries: entries.map { CredentialSecurityAuditRow(audit: nil, credential: $0) },
        failedCount: 0, nextOffset: nil, reusedPasswordCount: 0, revision: Self.revision,
        totalCount: entries.count, twoFactorCount: 1, weakPasswordCount: 0)
    }

    // MARK: SSHStore

    func sshPage(_ request: PassmanagerSSHPageRequest, generation: UInt64) async throws
      -> PassmanagerSSHPageResponse
    {
      PassmanagerSSHPageResponse(
        keys: sshKeys.map {
          SSHKeySummary(key: $0, revision: Self.revision, sourcePath: nil, sourceTitle: nil)
        }, nextOffset: nil, revision: Self.revision, totalCount: sshKeys.count)
    }
    func generateSSH(_ request: PassmanagerSSHKeygenRequest, generation: UInt64) async throws
      -> PassmanagerSSHKeyCreateResponse
    {
      throw CredentialPreviewError.unsupported
    }
    func importSSH(_ request: PassmanagerSSHImportRequest, generation: UInt64) async throws
      -> PassmanagerSSHKeyCreateResponse
    {
      throw CredentialPreviewError.unsupported
    }
    func exportSSH(_ request: PassmanagerSSHExportRequest, generation: UInt64) async throws
      -> PassmanagerSSHExportResponse
    {
      throw CredentialPreviewError.unsupported
    }
    func editSSH(_ request: PassmanagerSSHEditRequest, generation: UInt64) async throws
      -> SSHKeySummary
    {
      guard let key = sshKeys.first(where: { $0.id == request.keyID }) else {
        throw CredentialPreviewError.notFound
      }
      return SSHKeySummary(key: key, revision: Self.revision, sourcePath: nil, sourceTitle: nil)
    }
    func deleteSSH(id: String, generation: UInt64) async throws {}

    // MARK: WebsiteStore

    func websiteRules(id: String, generation: UInt64) async throws -> PassmanagerWebsiteResult {
      PassmanagerWebsiteResult(
        errors: [], revision: Self.revision,
        rules: websites.enumerated().map { index, value in
          CredentialWebsiteRule(matchMode: "base_domain", sourceIndex: index, value: value)
        })
    }
    func validateWebsites(_ rules: [CredentialWebsiteRule], generation: UInt64) async throws
      -> PassmanagerWebsiteResult
    {
      PassmanagerWebsiteResult(errors: [], revision: nil, rules: rules)
    }
    func updateWebsites(_ request: PassmanagerWebsiteUpdateRequest, generation: UInt64)
      async throws -> PassmanagerWebsiteResult
    {
      PassmanagerWebsiteResult(errors: [], revision: Self.revision, rules: request.rules)
    }

    // MARK: Maintenance, import and export

    func clearCredentials(generation: UInt64) async throws {}
    func reviewCredentialFile(
      _ url: URL, mode: AirImportMode, generation: UInt64, sourcePassword: String?
    ) async throws -> any CredentialImportReview {
      throw CredentialPreviewError.unsupported
    }
    func exportCredentialDocument(generation: UInt64) async throws -> Data {
      Data("{\"entries\":[]}".utf8)
    }

    // MARK: PasskeyStore

    func listPasskeys(generation: UInt64) async throws -> VaultPasskeysListResponse {
      VaultPasskeysListResponse(passkeys: passkeys)
    }
    func deletePasskey(_ request: VaultPasskeyDeleteRequest, generation: UInt64) async throws
      -> VaultPasskeyDeleteResponse
    {
      VaultPasskeyDeleteResponse(deleted: true)
    }
  }
#endif
