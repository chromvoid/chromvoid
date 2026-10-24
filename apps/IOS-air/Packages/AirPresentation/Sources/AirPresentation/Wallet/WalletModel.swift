import ChromVoidBridge
import Foundation
import Observation
import os

@MainActor
@Observable
public final class WalletModel {
  public enum State: Equatable { case loading, ready, failed, revoked }
  public enum AccountRoute: Equatable, Identifiable {
    case add(walletID: String)
    case receive(accountID: String)
    public var id: String {
      switch self {
      case .add(let id): "add:" + id
      case .receive(let id): "receive:" + id
      }
    }
  }
  /// The one sheet the wallet can show at a time. Pushed screens (network, activity) are
  /// separate state: a sheet may open over either of them.
  public enum Presentation: Identifiable {
    case setup(WalletSetupModel)
    case send(WalletSendModel)
    case recovery(WalletRecoveryModel)
    case account(AccountRoute)
    case contacts
    public var id: String {
      switch self {
      case .setup: "setup"
      case .send: "send"
      case .recovery: "recovery"
      case .account(let route): "account:" + route.id
      case .contacts: "contacts"
      }
    }
  }
  public enum AccountState: Equatable { case idle, working, uncertain }
  public enum AccountIssue: Equatable {
    case chooseNetwork, denied, unavailable, invalidInput, uncertain
  }
  public private(set) var presentation: Presentation?
  public private(set) var accountState: AccountState = .idle
  public private(set) var accountIssue: AccountIssue?
  public private(set) var accountNetwork: String?
  public private(set) var addressCopied = false

  public private(set) var state: State = .loading
  public private(set) var status: WalletStatusResponse?
  public private(set) var wallets: [WalletSummary] = []
  public private(set) var accounts: [WalletAccountMeta] = []
  public private(set) var balances: [WalletBalanceGetResponse] = []
  /// Accounts whose live balance request is in flight.
  public private(set) var balanceLoading: Set<String> = []
  @ObservationIgnored private var balanceWork: [String: ModelWork] = [:]
  @ObservationIgnored private let discoveryWork = ModelWork()
  /// `walletID:network` pairs whose restore discovery already ran once in this model's life;
  /// a provider failure leaves the flag set in Core and must not loop on every reload.
  @ObservationIgnored private var discoveryAttempted: Set<String> = []
  /// The wallet whose restore discovery is running, for the network screens' waiting state.
  public private(set) var discoveringWalletID: String?
  public private(set) var selectedWalletID: String?
  public private(set) var selectedAccountID: String?
  public private(set) var history: WalletHistoryModel?
  @ObservationIgnored private var histories: [String: WalletHistoryModel] = [:]
  private let historyStore: any WalletHistoryStore
  /// Activity pushed over the wallet root.
  public private(set) var historyPresented = false
  /// Activity pushed over the network screen; a separate flag because each screen declares
  /// the pushes it owns, and two pushes bound to one screen cannot both be active.
  public private(set) var networkHistoryPresented = false
  /// The network screen pushed over the wallet, by account; nil when the wallet is on top.
  public private(set) var networkAccountID: String?
  private let sendStore: any WalletSendStore
  private let recoveryStore: any WalletRecoveryStore
  public let addressBook: WalletAddressBookModel
  private let store: any WalletStore
  private let generation: UInt64
  private let clipboard: any CredentialClipboard
  private let mutation = ModelWork()
  @ObservationIgnored private var sequence: UInt64?
  private let work = ModelWork()
  private static let log = Logger(subsystem: "com.chromvoid.iosair", category: "wallet")

  public init(
    store: any WalletStore, contacts: any WalletAddressBookStore, history: any WalletHistoryStore,
    send: any WalletSendStore, recovery: any WalletRecoveryStore,
    generation: UInt64,
    clipboard: any CredentialClipboard
  ) {
    addressBook = WalletAddressBookModel(
      store: contacts, generation: generation, clipboard: clipboard)
    self.sendStore = send
    self.recoveryStore = recovery
    self.historyStore = history
    self.store = store
    self.generation = generation
    self.clipboard = clipboard
  }

  // MARK: Presentation accessors

  public var setup: WalletSetupModel? {
    if case .setup(let model) = presentation { return model }
    return nil
  }
  public var send: WalletSendModel? {
    if case .send(let model) = presentation { return model }
    return nil
  }
  public var recovery: WalletRecoveryModel? {
    if case .recovery(let model) = presentation { return model }
    return nil
  }
  public var accountRoute: AccountRoute? {
    if case .account(let route) = presentation { return route }
    return nil
  }
  public var addressBookPresented: Bool {
    if case .contacts = presentation { return true }
    return false
  }
  /// A sheet may open only over a ready wallet that shows no other sheet.
  private var canPresent: Bool { state == .ready && presentation == nil }

  // MARK: Catalog

  public var selectedWallet: WalletSummary? { wallets.first { $0.walletID == selectedWalletID } }
  /// The selected wallet as one multichain account: its network accounts in display order.
  public var walletAccounts: [WalletAccountMeta] {
    guard let selectedWalletID else { return [] }
    return accounts(of: selectedWalletID)
  }
  public var selectedAccount: WalletAccountMeta? {
    walletAccounts.first { $0.accountID == selectedAccountID }
  }
  /// Network accounts of any wallet in display order (for the wallet cards).
  public func accounts(of walletID: String) -> [WalletAccountMeta] {
    accounts.enumerated()
      .filter { $0.element.walletID == walletID }
      .sorted { lhs, rhs in
        let (l, r) = (
          WalletNetworkPresentation.rank(lhs.element.network),
          WalletNetworkPresentation.rank(rhs.element.network)
        )
        return l == r ? lhs.offset < rhs.offset : l < r
      }
      .map(\.element)
  }
  public var selectedBalance: WalletBalanceGetResponse? {
    guard let selectedAccount else { return nil }
    return balance(for: selectedAccount)
  }
  public func balance(for account: WalletAccountMeta) -> WalletBalanceGetResponse? {
    balances.first { $0.accountID == account.accountID && $0.network == account.network }
  }
  /// Cached total of an account as "1.5 TON", or nil while nothing has been fetched yet.
  public func formattedBalance(for account: WalletAccountMeta) -> String? {
    guard let balance = balance(for: account) else { return nil }
    guard let profile = WalletNetworkPresentation.profile(for: account.network) else {
      return balance.balance.total + " " + balance.balance.amountUnit
    }
    return profile.formattedTotal(balance)
  }

  public func synchronize(sequence: UInt64) {
    guard state != .revoked else { return }
    defer { self.sequence = sequence }
    if let previous = self.sequence, previous != sequence { reload() }
  }

  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked else { return nil }
    state = .loading
    addressCopied = false
    return work.start { [weak self, store, generation] run in
      do {
        let status = try await store.walletStatus(generation: generation)
        try Task.checkCancellation()
        let wallets = try await store.walletList(generation: generation)
        try Task.checkCancellation()
        let accounts = try await store.walletAccounts(walletID: nil, generation: generation)
        guard let self, run.isCurrent else { return }
        self.addressBook.updateNetworks(
          status.enabled ? status.networks.filter(\.enabled).map(\.network) : [])
        if self.addressBookPresented { self.addressBook.reload() }
        self.status = status
        self.wallets = wallets.wallets
        self.accounts = accounts.accounts
        self.balances = accounts.cachedBalances ?? []
        if !self.wallets.contains(where: { $0.walletID == self.selectedWalletID }) {
          self.selectedWalletID = self.wallets.first?.walletID
        }
        self.reconcileAccountSelection()
        self.updateHistory()
        self.state = .ready
        self.refreshBalances()
        self.runPendingDiscovery()
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked { self.revoke() } else { self.state = .failed }
      }
    }
  }

  public func selectWallet(_ id: String) {
    guard canPresent, !historyShown, accountState != .working,
      wallets.contains(where: { $0.walletID == id })
    else { return }
    selectedWalletID = id
    reconcileAccountSelection()
    updateHistory()
    refreshBalances()
  }
  public func selectAccount(_ id: String) {
    guard canPresent, !historyShown, accountState != .working,
      walletAccounts.contains(where: { $0.accountID == id })
    else { return }
    selectedAccountID = id
    updateHistory()
  }
  private func reconcileAccountSelection() {
    if !walletAccounts.contains(where: { $0.accountID == selectedAccountID }) {
      selectedAccountID = walletAccounts.first?.accountID
    }
  }

  // MARK: Balances

  /// Fetches live balances for every network account of the selected wallet whose provider is
  /// reachable. Each account has its own work, so a reload or wallet switch simply supersedes
  /// the previous request; a failed fetch keeps the cached value.
  public func refreshBalances() {
    guard state == .ready, let status, status.enabled else { return }
    for account in walletAccounts {
      guard providerReady(for: account.network), !discoveryPending(for: account) else { continue }
      fetchBalance(for: account)
    }
  }

  /// Networks a restored wallet still has to scan for used accounts before balances and
  /// sends mean anything: Bitcoin keeps its own flag, the other chains share a list.
  public func pendingDiscoveryNetworks(of wallet: WalletSummary) -> [String] {
    var networks = wallet.bitcoinDiscoveryPending == true ? ["bitcoin"] : []
    for network in wallet.accountDiscoveryPending ?? [] where !networks.contains(network) {
      networks.append(network)
    }
    return networks
  }

  public func discoveryPending(for account: WalletAccountMeta) -> Bool {
    guard let wallet = wallets.first(where: { $0.walletID == account.walletID }) else {
      return false
    }
    return pendingDiscoveryNetworks(of: wallet).contains(account.network)
  }

  private func providerReady(for network: String) -> Bool {
    status?.networks.contains(where: {
      $0.network == network && $0.enabled && $0.providerStatus == .ready
    }) == true
  }

  /// Runs the pending restore discoveries once each, one network at a time, then reloads the
  /// catalog so the cleared flags and any discovered accounts show up.
  private func runPendingDiscovery() {
    guard state == .ready, status?.enabled == true, !discoveryWork.isRunning else { return }
    var pending: [(walletID: String, accountID: String)] = []
    for wallet in wallets {
      for network in pendingDiscoveryNetworks(of: wallet) {
        let key = "\(wallet.walletID):\(network)"
        guard !discoveryAttempted.contains(key), providerReady(for: network),
          let account = accounts.first(where: {
            $0.walletID == wallet.walletID && $0.network == network
          })
        else { continue }
        discoveryAttempted.insert(key)
        pending.append((walletID: wallet.walletID, accountID: account.accountID))
      }
    }
    guard !pending.isEmpty else { return }
    discoveryWork.start { [weak self, store, generation] run in
      var discovered = false
      for item in pending {
        guard let self, run.isCurrent else { return }
        self.discoveringWalletID = item.walletID
        do {
          let response = try await store.discoverWalletAddresses(
            accountID: item.accountID, generation: generation)
          guard run.isCurrent else { return }
          if let account = self.accounts.first(where: { $0.accountID == item.accountID }) {
            self.applyBalance(response, for: account)
          }
          discovered = true
        } catch {
          guard run.isCurrent else { return }
          if error.isSessionRevoked {
            self.revoke()
            return
          }
          Self.log.error(
            "restore discovery failed account=\(item.accountID, privacy: .public) code=\(error.coreFailure?.code ?? String(describing: error), privacy: .public)"
          )
        }
      }
      guard let self, run.isCurrent else { return }
      self.discoveringWalletID = nil
      if discovered { self.reload() }
    }
  }
  private func fetchBalance(for account: WalletAccountMeta) {
    let id = account.accountID
    let work = balanceWork[id] ?? ModelWork()
    balanceWork[id] = work
    balanceLoading.insert(id)
    work.start { [weak self, store, generation] run in
      defer { if let self, run.isCurrent { self.balanceLoading.remove(id) } }
      do {
        let response = try await store.walletBalance(accountID: id, generation: generation)
        guard let self, run.isCurrent else { return }
        self.applyBalance(response, for: account)
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        // Keep the cached value, but leave a trace: a silent "—" hides provider outages.
        Self.log.error(
          "balance fetch failed network=\(account.network, privacy: .public) code=\(error.coreFailure?.code ?? String(describing: error), privacy: .public)"
        )
      }
    }
  }
  private func applyBalance(_ response: WalletBalanceGetResponse, for account: WalletAccountMeta) {
    guard response.accountID == account.accountID, response.network == account.network else {
      return
    }
    if let index = balances.firstIndex(where: {
      $0.accountID == response.accountID && $0.network == response.network
    }) {
      guard balances[index].fetchedAt <= response.fetchedAt else { return }
      balances[index] = response
    } else {
      balances.append(response)
    }
  }
  private func cancelBalanceWork() {
    for work in balanceWork.values { work.cancel() }
    balanceWork = [:]
    balanceLoading = []
    discoveryWork.cancel()
    discoveringWalletID = nil
  }

  // MARK: History

  private func updateHistory() {
    if let recovery,
      !wallets.contains(where: { $0.walletID == recovery.walletID && $0.kind == "hd" })
    {
      closeRecovery()
    }
    if history?.accountID != selectedAccountID { closeHistoryScreens() }
    if let id = networkAccountID, !walletAccounts.contains(where: { $0.accountID == id }) {
      networkAccountID = nil
      networkHistoryPresented = false
    }
    if let send {
      if !accounts.contains(where: {
        $0.accountID == send.accountID && $0.walletID == send.walletID
          && $0.network == send.profile.network
      }) {
        send.revoke()
        presentation = nil
      } else if let status {
        send.updateAvailability(status)
      }
    }
    let obsolete = histories.filter { id, history in
      !accounts.contains {
        $0.accountID == id && $0.walletID == history.walletID && $0.network == history.network
      }
    }
    for (id, history) in obsolete {
      history.revoke()
      histories.removeValue(forKey: id)
    }
    if let status { for history in histories.values { history.updateAvailability(status) } }
    guard let account = selectedAccount else {
      history = nil
      return
    }
    if histories[account.accountID] == nil {
      let model = WalletHistoryModel(
        walletID: account.walletID, accountID: account.accountID, network: account.network,
        store: historyStore, send: sendStore, generation: generation, clipboard: clipboard)
      if let status { model.updateAvailability(status) }
      histories[account.accountID] = model
    }
    history = histories[account.accountID]
  }

  // MARK: Pushed screens

  /// Pushes the network screen of one account of the selected wallet and selects it.
  public func openNetwork(_ id: String) {
    guard canPresent, !historyShown, networkAccountID == nil,
      walletAccounts.contains(where: { $0.accountID == id })
    else { return }
    selectAccount(id)
    networkAccountID = id
  }
  public func closeNetwork() {
    networkAccountID = nil
    networkHistoryPresented = false
  }
  /// Any activity screen is on top of the stack.
  public var historyShown: Bool { historyPresented || networkHistoryPresented }
  public func openHistory() {
    guard canPresent, !historyShown, history != nil else { return }
    presentHistory()
  }
  public func closeHistory() {
    guard history?.activity != .rebroadcasting else { return }
    history?.closeDetail()
    closeHistoryScreens()
  }
  public func showSendHistory() {
    guard let send, send.state == .submitted || send.state == .uncertain else { return }
    closeSend()
    history?.closeDetail()
    history?.reload()
    if history != nil { presentHistory() }
  }
  /// Pushes the activity over whichever wallet screen is on top.
  private func presentHistory() {
    if networkAccountID != nil { networkHistoryPresented = true } else { historyPresented = true }
  }
  private func closeHistoryScreens() {
    historyPresented = false
    networkHistoryPresented = false
  }

  // MARK: Recovery sheet

  public var canRecover: Bool { selectedWallet?.kind == "hd" && status?.enabled == true }
  public func openRecovery() {
    guard canPresent, canRecover, let wallet = selectedWallet, !historyShown,
      accountState == .idle
    else { return }
    let rotationAccount = accounts.first {
      $0.walletID == wallet.walletID && $0.network == "ton" && $0.mnemonicStandard == "rotation"
    }
    presentation = .recovery(
      WalletRecoveryModel(
        walletID: wallet.walletID, walletName: wallet.label,
        tonAccountID: rotationAccount?.accountID, store: recoveryStore,
        generation: generation, clipboard: clipboard))
  }
  public func closeRecovery() {
    guard let recovery else { return }
    recovery.revoke()
    presentation = nil
  }

  // MARK: Send sheet

  private func sendProfile(for account: WalletAccountMeta) -> WalletNetworkPresentation? {
    guard let profile = WalletNetworkPresentation.profile(for: account.network), let status,
      profile.isAvailable(in: status)
    else { return nil }
    return profile
  }
  /// Send starts from the selected network account when it can transfer, else from the first
  /// account of the wallet that can; the pasted address may move it to another network later.
  public var sendableAccount: WalletAccountMeta? {
    if let account = selectedAccount, sendProfile(for: account) != nil { return account }
    return walletAccounts.first { sendProfile(for: $0) != nil }
  }
  public var canSend: Bool { sendableAccount != nil }
  public func openSend() {
    guard canPresent, !historyShown, accountState == .idle, let account = sendableAccount,
      let profile = sendProfile(for: account), let status
    else { return }
    let model = WalletSendModel(
      walletID: account.walletID, accountID: account.accountID,
      profile: profile, status: status, store: sendStore, generation: generation)
    model.accountResolver = { [weak self] network in
      guard let self,
        let target = self.accounts.first(where: {
          $0.walletID == account.walletID && $0.network == network
        }),
        let profile = WalletNetworkPresentation.profile(for: network)
      else { return nil }
      return (target.accountID, profile)
    }
    presentation = .send(model)
    addressBook.reload()
  }
  public func closeSend() {
    guard let send, !send.busy else { return }
    let reconcile = send.state == .submitted || send.state == .uncertain
    send.revoke()
    presentation = nil
    if reconcile { reload() }
  }

  // MARK: Setup sheet

  public func beginSetup(_ intent: WalletSetupModel.Intent) {
    guard canPresent, !historyShown, accountState == .idle, let status, status.enabled
    else { return }
    presentation = .setup(
      WalletSetupModel(intent: intent, status: status, store: store, generation: generation) {
        [weak self] walletID, accountID in
        guard let self, self.state != .revoked, let setup = self.setup else { return }
        setup.revoke()
        self.presentation = nil
        self.selectedWalletID = walletID
        self.selectedAccountID = accountID
        self.reload()
      })
  }
  public func closeSetup() {
    guard let setup else { return }
    let needsReconciliation =
      setup.state == .saving || setup.state == .uncertain || setup.state == .saved
    setup.revoke()
    presentation = nil
    if needsReconciliation { reload() }
  }

  // MARK: Account sheet (receive / add account)

  public var accountWallet: WalletSummary? {
    if case .add(let walletID) = accountRoute { return wallets.first { $0.walletID == walletID } }
    return selectedWallet
  }
  public var derivableNetworks: [String] {
    guard let wallet = accountWallet, wallet.kind == "hd", wallet.walletMode == "multichain",
      status?.enabled == true
    else { return [] }
    return status?.networks.filter(\.enabled).map(\.network) ?? []
  }
  public var receivingAccount: WalletAccountMeta? {
    guard case .receive(let accountID) = accountRoute else { return nil }
    return accounts.first { $0.accountID == accountID }
  }
  public var receivingAddress: String? {
    guard state == .ready, accountState != .working, let account = receivingAccount,
      let address = account.currentReceiveAddress ?? account.address, !address.isEmpty
    else { return nil }
    return address
  }
  public var canDeriveReceiveAddress: Bool {
    guard let account = receivingAccount else { return false }
    return account.kind == .derived && account.accountModel == "utxo"
      && account.network == "bitcoin"
      && status?.enabled == true
      && status?.networks.contains { $0.network == account.network && $0.enabled } == true
  }
  /// Another account on a network is an advanced move, reached from that network's screen;
  /// `network` preselects it so the sheet only asks for confirmation.
  public func openAddAccount(network: String? = nil) {
    guard canPresent, !historyShown, accountState == .idle, let wallet = selectedWallet,
      !derivableNetworks.isEmpty
    else { return }
    accountNetwork = network.flatMap { derivableNetworks.contains($0) ? $0 : nil }
    accountIssue = nil
    presentation = .account(.add(walletID: wallet.walletID))
  }
  /// Copies any account's current address (network screen); `addressCopied` confirms it.
  public func copyAddress(of accountID: String) {
    guard state == .ready, let account = accounts.first(where: { $0.accountID == accountID }),
      let address = account.currentReceiveAddress ?? account.address, !address.isEmpty
    else { return }
    clipboard.copy(address)
    addressCopied = true
  }
  /// Allocates the next receive address for a Bitcoin account from its network screen.
  @discardableResult
  public func generateReceivingAddress(for accountID: String) -> Task<Void, Never>? {
    guard state == .ready, accountState == .idle,
      let account = walletAccounts.first(where: { $0.accountID == accountID }),
      account.kind == .derived, account.accountModel == "utxo", account.network == "bitcoin",
      status?.enabled == true,
      status?.networks.contains(where: { $0.network == account.network && $0.enabled }) == true
    else { return nil }
    return performAccountMutation(.address(accountID: accountID))
  }
  public func chooseAccountNetwork(_ network: String?) {
    guard case .add = accountRoute, accountState == .idle else { return }
    accountNetwork = network
    accountIssue = nil
  }
  public func openReceive() {
    guard canPresent, !historyShown, accountState != .working, let account = selectedAccount
    else { return }
    addressCopied = false
    presentation = .account(.receive(accountID: account.accountID))
  }
  /// Receive is one surface for the whole wallet: switching the network swaps the account whose
  /// address is shown and makes it the selected one.
  public func switchReceivingAccount(_ id: String) {
    guard case .receive = accountRoute, state == .ready, accountState != .working,
      walletAccounts.contains(where: { $0.accountID == id })
    else { return }
    addressCopied = false
    selectedAccountID = id
    presentation = .account(.receive(accountID: id))
    updateHistory()
  }
  public func closeAccountRoute() {
    guard accountRoute != nil, accountState != .working else { return }
    presentation = nil
    accountNetwork = nil
    addressCopied = false
    if accountState != .uncertain { accountIssue = nil }
  }
  public func acknowledgeAccountReconciliation() {
    guard state == .ready, accountState == .uncertain else { return }
    if case .add = accountRoute { return }
    accountState = .idle
    accountIssue = nil
  }
  public func copyReceivingAddress() {
    guard let address = receivingAddress else { return }
    clipboard.copy(address)
    addressCopied = true
  }
  @discardableResult
  public func addAccount() -> Task<Void, Never>? {
    guard case .add(let walletID) = accountRoute, state == .ready, accountState == .idle else {
      return nil
    }
    guard walletID == selectedWalletID, accountWallet != nil else {
      accountIssue = .unavailable
      return nil
    }
    guard let network = accountNetwork, derivableNetworks.contains(network) else {
      accountIssue = .chooseNetwork
      return nil
    }
    return performAccountMutation(.account(walletID: walletID, network: network))
  }
  @discardableResult
  public func generateReceivingAddress() -> Task<Void, Never>? {
    guard state == .ready, accountState == .idle, canDeriveReceiveAddress,
      let account = receivingAccount
    else { return nil }
    return performAccountMutation(.address(accountID: account.accountID))
  }
  private enum AccountMutation {
    case account(walletID: String, network: String)
    case address(accountID: String)
  }
  private func performAccountMutation(_ operation: AccountMutation) -> Task<Void, Never> {
    accountState = .working
    accountIssue = nil
    addressCopied = false
    return mutation.start { [weak self, store, generation] run in
      do {
        switch operation {
        case .account(let walletID, let network):
          let result = try await store.deriveWalletAccount(
            WalletAccountsDeriveRequest(network: network, walletID: walletID),
            generation: generation)
          guard let self, run.isCurrent else { return }
          self.selectedWalletID = walletID
          self.selectedAccountID = result.accountID
          if case .account = self.presentation { self.presentation = nil }
          self.accountNetwork = nil
        case .address(let accountID):
          _ = try await store.deriveWalletAddress(
            WalletAddressesDeriveRequest(accountID: accountID, purpose: "receive"),
            generation: generation)
        }
        guard let self, run.isCurrent else { return }
        await self.reload()?.value
        guard run.isCurrent else { return }
        self.accountState = .idle
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        switch error.coreFailureKind {
        case .invalidInput: self.accountIssue = .invalidInput
        case .denied: self.accountIssue = .denied
        case .unavailable: self.accountIssue = .unavailable
        default: self.accountIssue = .uncertain
        }
        self.accountState = self.accountIssue == .uncertain ? .uncertain : .idle
        if self.accountState == .uncertain { await self.reload()?.value }
      }
    }
  }

  // MARK: Contacts sheet

  public func openAddressBook() {
    guard canPresent, status?.enabled == true, !historyShown, accountState == .idle
    else { return }
    presentation = .contacts
    addressBook.reload()
  }
  public func closeAddressBook() {
    guard addressBookPresented, addressBook.canDismiss else { return }
    presentation = nil
  }

  // MARK: Lifecycle

  public func coverSensitiveValues() {
    setup?.hideValues()
    recovery?.hideValues()
    for history in histories.values { history.hidePassword() }
    send?.hidePassword()
  }

  public func revoke() {
    switch presentation {
    case .setup(let model): model.revoke()
    case .send(let model): model.revoke()
    case .recovery(let model): model.revoke()
    case .account, .contacts, nil: break
    }
    presentation = nil
    historyPresented = false
    networkHistoryPresented = false
    networkAccountID = nil
    for history in histories.values { history.revoke() }
    histories = [:]
    history = nil
    addressBook.revoke()
    mutation.cancel()
    accountNetwork = nil
    accountState = .idle
    accountIssue = nil
    addressCopied = false
    clipboard.clearOwned()
    work.cancel()
    cancelBalanceWork()
    status = nil
    wallets = []
    accounts = []
    balances = []
    selectedWalletID = nil
    selectedAccountID = nil
    state = .revoked
  }
}
