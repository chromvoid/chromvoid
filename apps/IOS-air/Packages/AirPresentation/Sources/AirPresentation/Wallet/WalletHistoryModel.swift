import ChromVoidBridge
import Foundation
import Observation

/// Session-owned presentation of one account's Core journal. No persisted Swift journal.
@MainActor
@Observable
public final class WalletHistoryModel {
  public enum State: Equatable { case idle, ready, failed, revoked }
  public enum Activity: Equatable { case idle, loading, synchronizing, refreshing, rebroadcasting }
  public enum Issue: Equatable {
    case load, synchronization, refresh, unavailable, denied
    case passwordRequired, reauthentication, rebroadcastUnknown, rebroadcastIneligible
  }
  public enum CopyField { case reference, counterparty }
  public let walletID: String
  public let accountID: String
  public let network: String
  public private(set) var state: State = .idle
  public private(set) var activity: Activity = .idle
  public private(set) var entries: [WalletTransactionEntry] = []
  public private(set) var nextCursor: String?
  public private(set) var selected: WalletTransactionEntry?
  public private(set) var issue: Issue?
  public private(set) var copied = false
  public private(set) var providerReady = false
  public private(set) var reviewingRebroadcast = false
  public private(set) var rebroadcastPassword = ""
  public private(set) var passwordFocusRevision = 0
  private var rebroadcastsNeedingRefresh: Set<String> = []
  private var broadcastReady = false
  private let sendStore: any WalletSendStore
  private let store: any WalletHistoryStore
  private let generation: UInt64
  private let clipboard: any CredentialClipboard
  private let work = ModelWork()
  /// The running operation, handed to callers that await it.
  @ObservationIgnored private var running: Task<Void, Never>?
  @ObservationIgnored private var reloadRequested = false

  public init(
    walletID: String, accountID: String, network: String, store: any WalletHistoryStore,
    send: any WalletSendStore,
    generation: UInt64, clipboard: any CredentialClipboard
  ) {
    self.walletID = walletID
    self.accountID = accountID
    self.network = network
    self.store = store
    self.sendStore = send
    self.generation = generation
    self.clipboard = clipboard
  }
  public var selectedID: String? { selected?.txRef }
  // The existing TON profile implements history discovery; other profiles still expose the journal.
  public var canSynchronize: Bool { providerReady && network == "ton" }
  public func updateAvailability(_ status: WalletStatusResponse) {
    guard state != .revoked else { return }
    broadcastReady =
      WalletNetworkPresentation.profile(for: network)?.isAvailable(in: status) == true
    providerReady =
      status.enabled
      && status.networks.contains {
        $0.network == network && $0.enabled && $0.providerStatus == .ready
      }
  }
  @discardableResult
  public func loadIfNeeded() -> Task<Void, Never>? {
    if let running { return running }
    guard state == .idle else { return nil }
    return reload()
  }
  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard selectedID == nil, state != .revoked else { return nil }
    if activity != .idle {
      reloadRequested = true
      return running
    }
    reloadRequested = false
    return start(.reload)
  }
  @discardableResult
  public func loadMore() -> Task<Void, Never>? {
    guard selectedID == nil, let nextCursor else { return nil }
    return start(.page(nextCursor))
  }
  public func open(_ id: String) {
    guard state != .revoked, activity != .rebroadcasting,
      let entry = entries.first(where: { $0.txRef == id })
    else { return }
    cancelRebroadcast()
    selected = entry
    copied = false
  }
  public func closeDetail() {
    guard activity != .rebroadcasting else { return }
    cancelRebroadcast()
    selected = nil
    copied = false
    if reloadRequested { reload() }
  }
  @discardableResult
  public func refreshSelected() -> Task<Void, Never>? {
    guard let selected, !reviewingRebroadcast else { return nil }
    guard providerReady else {
      issue = .unavailable
      return nil
    }
    return start(.refresh(selected.txRef))
  }
  public func copy(_ field: CopyField) {
    guard let selected else { return }
    let value: String?
    switch field {
    case .reference: value = selected.txHash ?? selected.messageRef ?? selected.txRef
    case .counterparty: value = selected.counterparty
    }
    guard let value, !value.isEmpty else { return }
    clipboard.copy(value)
    copied = true
  }

  public var canOfferRebroadcast: Bool {
    guard let selected, state != .revoked else { return false }
    return selected.accountID == accountID && selected.walletID == walletID
      && selected.network == network
      && ["broadcasting", "broadcast_unknown"].contains(selected.status)
  }
  public var requiresRebroadcastRefresh: Bool {
    selectedID.map { rebroadcastsNeedingRefresh.contains($0) } ?? false
  }
  public var canRebroadcast: Bool {
    canOfferRebroadcast && broadcastReady && !requiresRebroadcastRefresh
  }
  public func beginRebroadcast() {
    guard activity == .idle, canRebroadcast else { return }
    reviewingRebroadcast = true
    rebroadcastPassword = ""
    issue = nil
  }
  public func changeRebroadcastPassword(_ value: String) {
    guard reviewingRebroadcast, activity == .idle else { return }
    rebroadcastPassword = value
    issue = nil
  }
  public func hidePassword() { rebroadcastPassword = "" }
  public func cancelRebroadcast() {
    guard activity != .rebroadcasting else { return }
    reviewingRebroadcast = false
    hidePassword()
  }
  @discardableResult
  public func confirmRebroadcast() -> Task<Void, Never>? {
    guard reviewingRebroadcast, activity == .idle, let selected else { return nil }
    guard canRebroadcast else {
      issue = .unavailable
      return nil
    }
    guard !rebroadcastPassword.isEmpty else {
      issue = .passwordRequired
      passwordFocusRevision += 1
      return nil
    }
    let request = WalletTransactionRebroadcastRequest(
      masterPassword: rebroadcastPassword, txRef: selected.txRef)
    hidePassword()
    return start(.rebroadcast(request))
  }

  private enum Operation {
    case reload
    case page(String)
    case refresh(String)
    case rebroadcast(WalletTransactionRebroadcastRequest)
  }
  private func start(_ operation: Operation) -> Task<Void, Never>? {
    guard state != .revoked, activity == .idle else { return nil }
    issue = nil
    copied = false
    switch operation {
    case .reload, .page: activity = .loading
    case .refresh: activity = .refreshing
    case .rebroadcast: activity = .rebroadcasting
    }
    let task = work.start { [weak self] run in
      guard let self else { return }
      defer {
        if run.isCurrent {
          self.activity = .idle
          self.running = nil
          if self.reloadRequested { self.reload() }
        }
      }
      var failure: Issue = .load
      do {
        switch operation {
        case .reload:
          try await self.readPage(cursor: nil, run: run)
          if self.canSynchronize {
            failure = .synchronization
            self.activity = .synchronizing
            _ = try await self.store.syncWalletTransactions(
              WalletTransactionsSyncRequest(accountID: self.accountID, limit: 50),
              generation: self.generation)
            try self.checkCurrent(run)
            failure = .load
            try await self.readPage(cursor: nil, run: run)
          }
        case .page(let cursor):
          try await self.readPage(cursor: cursor, run: run)
        case .refresh(let id):
          failure = .refresh
          let result = try await self.store.refreshWalletTransaction(
            WalletTransactionsRefreshRequest(txRef: id), generation: self.generation)
          try self.checkCurrent(run)
          guard result.txRef == id, result.network == self.network else {
            throw HistoryError.invalidResponse
          }
          self.rebroadcastsNeedingRefresh.remove(id)
          // These fields are the Core reconciliation result, not a locally inferred status.
          self.applyStatus(result)
        case .rebroadcast(let request):
          let result = try await self.sendStore.rebroadcastWalletTransaction(
            request, generation: self.generation)
          try self.checkCurrent(run)
          guard result.txRef == request.txRef, result.network == self.network else {
            throw HistoryError.invalidResponse
          }
          let update = WalletTransactionsRefreshResponse(
            network: result.network, status: result.status, txHash: result.txHash,
            txRef: result.txRef, updatedAt: result.updatedAt)
          self.applyStatus(update)
          self.reviewingRebroadcast = false
          if ["broadcasting", "broadcast_unknown"].contains(result.status) {
            self.rebroadcastsNeedingRefresh.insert(result.txRef)
            self.issue = .rebroadcastUnknown
          }
        }
      } catch {
        guard run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
        } else if case .rebroadcast(let request) = operation {
          switch error.coreFailureKind {
          case .reauthRequired:
            self.issue = .reauthentication
            self.passwordFocusRevision += 1
          case .denied: self.issue = .denied
          case .unavailable: self.issue = .unavailable
          default:
            self.reviewingRebroadcast = false
            self.rebroadcastsNeedingRefresh.insert(request.txRef)
            self.issue =
              error.coreFailureKind == .invalidInput ? .rebroadcastIneligible : .rebroadcastUnknown
          }
        } else {
          switch error.coreFailureKind {
          case .denied: self.issue = .denied
          case .unavailable: self.issue = .unavailable
          default: self.issue = failure
          }
          if self.state == .idle { self.state = .failed }
        }
      }
    }
    running = task
    return task
  }
  private enum HistoryError: Error { case invalidResponse }

  private func readPage(cursor: String?, run: ModelRun) async throws {
    let result = try await store.walletTransactions(
      WalletTransactionsListRequest(
        accountID: accountID, cursor: cursor, limit: 50, status: nil, walletID: walletID),
      generation: generation)
    try checkCurrent(run)
    if cursor == nil {
      entries = result.transactions
    } else {
      let known = Set(entries.map(\.txRef))
      entries.append(contentsOf: result.transactions.filter { !known.contains($0.txRef) })
    }
    if let current = result.transactions.first(where: { $0.txRef == selectedID }) {
      selected = current
    }
    nextCursor = result.nextCursor
    state = .ready
  }
  private func applyStatus(_ result: WalletTransactionsRefreshResponse) {
    entries = entries.map { Self.refreshed($0, with: result) }
    if let selected { self.selected = Self.refreshed(selected, with: result) }
  }
  private static func refreshed(
    _ entry: WalletTransactionEntry, with result: WalletTransactionsRefreshResponse
  ) -> WalletTransactionEntry {
    guard entry.txRef == result.txRef else { return entry }
    return entry.with(
      status: result.status, txHash: .some(result.txHash), updatedAt: result.updatedAt)
  }
  /// Stops a helper mid-operation once the run was superseded, cancelled or revoked.
  private func checkCurrent(_ run: ModelRun) throws {
    if !run.isCurrent || state == .revoked { throw CancellationError() }
  }
  public func revoke() {
    reviewingRebroadcast = false
    hidePassword()
    rebroadcastsNeedingRefresh = []
    broadcastReady = false
    reloadRequested = false
    work.cancel()
    running = nil
    entries = []
    nextCursor = nil
    selected = nil
    issue = nil
    copied = false
    providerReady = false
    activity = .idle
    state = .revoked
    clipboard.clearOwned()
  }
}
