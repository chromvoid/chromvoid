import AirPresentation
import Foundation
import Testing

@testable import ChromVoidBridge

@Suite @MainActor
struct WalletHistoryTests {
  @Test func cachedPagesSurviveDetailAndProviderFailureWithoutChangingAmounts() async throws {
    let store = WalletHistoryTestStore()
    store.pages = [
      WalletTransactionsListResponse(nextCursor: "older", transactions: [entry("new")]),
      WalletTransactionsListResponse(nextCursor: nil, transactions: [entry("old")]),
    ]
    let clipboard = HistoryClipboard()
    let model = model(store, clipboard: clipboard)
    await model.loadIfNeeded()?.value
    #expect(model.state == .ready && store.syncs.isEmpty)
    await model.loadMore()?.value
    #expect(model.entries.map(\.txRef) == ["new", "old"] && model.nextCursor == nil)
    model.open("old")
    #expect(model.selected?.amount == "900719925474099312345")
    model.copy(.reference)
    #expect(clipboard.value == "old-hash")
    model.closeDetail()
    await model.loadIfNeeded()?.value
    #expect(model.entries.count == 2 && store.reads.count == 2)
    model.updateAvailability(status())
    store.syncFailure = "PROVIDER_UNAVAILABLE"
    await model.reload()?.value
    #expect(model.entries.map(\.txRef) == ["new"] && model.issue == .unavailable)
    #expect(model.state == .ready && store.syncs.count == 1)
    #expect(store.reads.allSatisfy { $0.accountID == "account" && $0.walletID == "wallet" })
    #expect(store.generations.allSatisfy { $0 == 7 })
  }

  @Test func cachedDataIsVisibleDuringSyncAndOpeningDetailDoesNotPollOrLoseItsIdentity()
    async throws
  {
    let store = WalletHistoryTestStore()
    store.pages = [WalletTransactionsListResponse(nextCursor: nil, transactions: [entry("old")])]
    let model = model(store)
    model.updateAvailability(status())
    store.syncGate.enabled = true
    let loading = try #require(model.loadIfNeeded())
    await store.syncGate.wait()
    #expect(model.state == .ready && model.activity == .synchronizing)
    model.open("old")
    #expect(model.selectedID == "old")
    #expect(model.reload() == nil && model.refreshSelected() == nil)
    store.pages = [
      WalletTransactionsListResponse(nextCursor: "older", transactions: [entry("new")])
    ]
    store.syncGate.release()
    await loading.value
    #expect(model.entries.map(\.txRef) == ["new"] && model.selectedID == "old")
    #expect(store.syncs.count == 1)
    store.refreshResult = WalletTransactionsRefreshResponse(
      network: "ton", status: "confirmed", txHash: "confirmed-hash", txRef: "old", updatedAt: 90)
    await model.refreshSelected()?.value
    #expect(model.selected?.status == "confirmed" && model.selected?.updatedAt == 90)
    #expect(model.selected?.txHash == "confirmed-hash" && model.nextCursor == "older")
    #expect(model.entries.map(\.txRef) == ["new"])
    model.closeDetail()
    #expect(model.selected == nil && model.entries.count == 1)
  }

  @Test func refreshUsesCapturedReferenceAndNeverInfersSuccessAfterAnError() async throws {
    let store = WalletHistoryTestStore()
    store.pages = [WalletTransactionsListResponse(nextCursor: "older", transactions: [entry("tx")])]
    let model = model(store)
    await model.loadIfNeeded()?.value
    model.open("tx")
    #expect(model.refreshSelected() == nil && model.issue == .unavailable)
    model.updateAvailability(status())
    store.refreshFailure = "PROVIDER_UNAVAILABLE"
    await model.refreshSelected()?.value
    #expect(model.selected?.status == "pending" && store.refreshes == ["tx"])
    store.refreshFailure = nil
    store.refreshResult = WalletTransactionsRefreshResponse(
      network: "ton", status: "confirmed", txHash: "settled", txRef: "tx", updatedAt: 30)
    await model.refreshSelected()?.value
    #expect(model.selected?.status == "confirmed" && model.entries[0].status == "confirmed")
    #expect(model.nextCursor == "older" && store.refreshes == ["tx", "tx"])
  }

  @Test func failedFirstReadCanRetryAndPaginationFailureRetainsThePage() async throws {
    let store = WalletHistoryTestStore()
    let model = model(store)
    store.readFailure = "INTERNAL_ERROR"
    await model.loadIfNeeded()?.value
    #expect(model.state == .failed && model.issue == .load)
    store.readFailure = nil
    store.pages = [WalletTransactionsListResponse(nextCursor: "older", transactions: [entry("tx")])]
    await model.reload()?.value
    store.readFailure = "INTERNAL_ERROR"
    await model.loadMore()?.value
    #expect(model.state == .ready && model.entries.count == 1 && model.nextCursor == "older")
    #expect(model.issue == .load)
  }

  @Test func revocationPurgesPagesDetailAndClipboardAndRejectsLateStatus() async throws {
    let store = WalletHistoryTestStore()
    store.pages = [WalletTransactionsListResponse(nextCursor: nil, transactions: [entry("tx")])]
    let clipboard = HistoryClipboard()
    let model = model(store, clipboard: clipboard)
    await model.loadIfNeeded()?.value
    model.open("tx")
    model.copy(.counterparty)
    model.updateAvailability(status())
    store.refreshGate.enabled = true
    let refreshing = try #require(model.refreshSelected())
    await store.refreshGate.wait()
    model.revoke()
    store.refreshGate.release()
    await refreshing.value
    #expect(model.state == .revoked && model.entries.isEmpty && model.selected == nil)
    #expect(clipboard.value == nil && model.reload() == nil && model.refreshSelected() == nil)
  }

  @Test func aRevokedReadCannotPublishAndCoreLockErrorsPurgeCachedData() async throws {
    let store = WalletHistoryTestStore()
    store.pages = [WalletTransactionsListResponse(nextCursor: nil, transactions: [entry("tx")])]
    let model = model(store)
    store.readGate.enabled = true
    let loading = try #require(model.loadIfNeeded())
    await store.readGate.wait()
    model.revoke()
    store.readGate.release()
    await loading.value
    #expect(model.entries.isEmpty && model.state == .revoked)
    let other = self.model(store)
    await other.loadIfNeeded()?.value
    store.readFailure = "VAULT_REQUIRED"
    await other.reload()?.value
    #expect(other.entries.isEmpty && other.state == .revoked)
  }

  @Test func aTransferRefreshDuringAnOlderReadLoadsTheNewJournalAfterward() async throws {
    let store = WalletHistoryTestStore()
    store.pages = [WalletTransactionsListResponse(nextCursor: nil, transactions: [entry("old")])]
    let model = model(store)
    store.readGate.enabled = true
    let first = try #require(model.loadIfNeeded())
    await store.readGate.wait()
    store.pages = [
      WalletTransactionsListResponse(nextCursor: nil, transactions: [entry("new"), entry("old")])
    ]
    model.reload()
    store.readGate.release()
    await first.value
    // loadIfNeeded joins the queued refresh without scheduling another one.
    await model.loadIfNeeded()?.value
    #expect(model.entries.map(\.txRef) == ["new", "old"] && store.reads.count == 2)
  }

  @Test func rebroadcastRequiresAnEligibleCapturedTransactionAndExplicitPassword() async throws {
    let store = WalletHistoryTestStore()
    let sends = WalletSendTestStore()
    store.pages = [
      WalletTransactionsListResponse(
        nextCursor: nil,
        transactions: [
          entry("tx").with(status: "broadcast_unknown"), entry("other"),
        ])
    ]
    let model = model(store, send: sends)
    await model.loadIfNeeded()?.value
    model.open("other")
    model.updateAvailability(sends.status("ton"))
    model.beginRebroadcast()
    #expect(!model.reviewingRebroadcast && model.confirmRebroadcast() == nil)
    model.open("tx")
    model.beginRebroadcast()
    #expect(model.reviewingRebroadcast)
    #expect(model.confirmRebroadcast() == nil && model.issue == .passwordRequired)
    #expect(sends.rebroadcasts.isEmpty)
    model.changeRebroadcastPassword("master")
    sends.rebroadcastGate.enabled = true
    let publishing = try #require(model.confirmRebroadcast())
    await sends.rebroadcastGate.wait()
    #expect(model.rebroadcastPassword.isEmpty && model.activity == .rebroadcasting)
    model.open("other")
    model.closeDetail()
    #expect(model.selectedID == "tx" && model.confirmRebroadcast() == nil)
    sends.rebroadcastGate.release()
    await publishing.value
    #expect(model.selected?.status == "pending" && model.selected?.txHash == "published")
    #expect(model.entries[0].updatedAt == 42 && model.entries.count == 2)
    #expect(!model.reviewingRebroadcast && !model.canOfferRebroadcast)
    #expect(sends.rebroadcasts.count == 1 && sends.rebroadcasts[0].txRef == "tx")
    #expect(sends.rebroadcasts[0].masterPassword == "master" && sends.generations == [7])
  }

  @Test func unknownRebroadcastRequiresStatusRefreshEvenAfterReopeningTheDetail() async throws {
    let store = WalletHistoryTestStore()
    let sends = WalletSendTestStore()
    store.pages = [
      WalletTransactionsListResponse(
        nextCursor: nil,
        transactions: [
          entry("tx").with(status: "broadcast_unknown")
        ])
    ]
    let model = model(store, send: sends)
    await model.loadIfNeeded()?.value
    model.updateAvailability(sends.status("ton"))
    model.open("tx")
    model.beginRebroadcast()
    model.changeRebroadcastPassword("master")
    sends.rebroadcastFailure = "INTERNAL_ERROR"
    await model.confirmRebroadcast()?.value
    #expect(model.issue == .rebroadcastUnknown && model.requiresRebroadcastRefresh)
    #expect(model.selected?.status == "broadcast_unknown" && !model.reviewingRebroadcast)
    model.closeDetail()
    model.open("tx")
    model.beginRebroadcast()
    #expect(!model.reviewingRebroadcast && model.confirmRebroadcast() == nil)
    store.refreshFailure = "PROVIDER_UNAVAILABLE"
    await model.refreshSelected()?.value
    #expect(model.requiresRebroadcastRefresh)
    store.refreshFailure = nil
    store.refreshResult = store.refreshResult.with(status: "broadcast_unknown")
    await model.refreshSelected()?.value
    #expect(!model.requiresRebroadcastRefresh && model.canRebroadcast)
    sends.rebroadcastFailure = nil
    sends.rebroadcastResult = sends.rebroadcastResult.with(status: "broadcast_unknown")
    model.beginRebroadcast()
    #expect(model.rebroadcastPassword.isEmpty)
    model.changeRebroadcastPassword("manual retry")
    await model.confirmRebroadcast()?.value
    #expect(model.requiresRebroadcastRefresh && model.issue == .rebroadcastUnknown)
    #expect(sends.rebroadcasts.count == 2)
  }

  @Test func definiteReauthenticationRetriesAndCoverOrBackClearsThePassword() async throws {
    let store = WalletHistoryTestStore()
    let sends = WalletSendTestStore()
    store.pages = [
      WalletTransactionsListResponse(
        nextCursor: nil,
        transactions: [
          entry("tx").with(status: "broadcasting")
        ])
    ]
    let model = model(store, send: sends)
    await model.loadIfNeeded()?.value
    model.open("tx")
    model.beginRebroadcast()
    #expect(!model.reviewingRebroadcast)
    model.updateAvailability(sends.status("ton"))
    model.beginRebroadcast()
    model.changeRebroadcastPassword("wrong")
    sends.rebroadcastFailure = "CONFIRM_REQUIRED"
    await model.confirmRebroadcast()?.value
    #expect(model.reviewingRebroadcast && model.issue == .reauthentication)
    #expect(model.rebroadcastPassword.isEmpty && !model.requiresRebroadcastRefresh)
    model.changeRebroadcastPassword("covered")
    model.hidePassword()
    #expect(model.rebroadcastPassword.isEmpty && model.reviewingRebroadcast)
    model.changeRebroadcastPassword("leaving")
    model.closeDetail()
    #expect(model.rebroadcastPassword.isEmpty && !model.reviewingRebroadcast)
    model.open("tx")
    model.beginRebroadcast()
    model.changeRebroadcastPassword("master")
    sends.rebroadcastFailure = nil
    await model.confirmRebroadcast()?.value
    #expect(model.selected?.status == "pending" && sends.rebroadcasts.count == 2)
  }

  @Test func revocationRejectsARebroadcastReplyAndPurgesSensitivePresentation() async throws {
    let store = WalletHistoryTestStore()
    let sends = WalletSendTestStore()
    store.pages = [
      WalletTransactionsListResponse(
        nextCursor: nil,
        transactions: [
          entry("tx").with(status: "broadcast_unknown")
        ])
    ]
    let model = model(store, send: sends)
    await model.loadIfNeeded()?.value
    model.updateAvailability(sends.status("ton"))
    model.open("tx")
    model.beginRebroadcast()
    model.changeRebroadcastPassword("master")
    sends.rebroadcastGate.enabled = true
    let publishing = try #require(model.confirmRebroadcast())
    await sends.rebroadcastGate.wait()
    model.revoke()
    sends.rebroadcastGate.release()
    await publishing.value
    #expect(model.state == .revoked && model.entries.isEmpty && model.selected == nil)
    #expect(model.rebroadcastPassword.isEmpty && !model.reviewingRebroadcast)
  }

  @Test func aMismatchedReplyCannotPublishAnotherTransactionsStatus() async throws {
    let store = WalletHistoryTestStore()
    let sends = WalletSendTestStore()
    store.pages = [
      WalletTransactionsListResponse(
        nextCursor: nil,
        transactions: [
          entry("tx").with(status: "broadcast_unknown")
        ])
    ]
    let model = model(store, send: sends)
    await model.loadIfNeeded()?.value
    model.updateAvailability(sends.status("ton"))
    model.open("tx")
    model.beginRebroadcast()
    model.changeRebroadcastPassword("master")
    sends.rebroadcastResult = sends.rebroadcastResult.with(txRef: "other")
    await model.confirmRebroadcast()?.value
    #expect(model.selected?.status == "broadcast_unknown" && model.requiresRebroadcastRefresh)
    store.refreshResult = store.refreshResult.with(network: "bitcoin")
    await model.refreshSelected()?.value
    #expect(model.issue == .refresh && model.requiresRebroadcastRefresh)
  }

  @Test func openingDetailDelaysButDoesNotLoseAQueuedJournalReload() async throws {
    let store = WalletHistoryTestStore()
    store.pages = [WalletTransactionsListResponse(nextCursor: nil, transactions: [entry("old")])]
    let model = model(store)
    await model.loadIfNeeded()?.value
    store.readGate.enabled = true
    let reading = try #require(model.reload())
    await store.readGate.wait()
    model.reload()
    model.open("old")
    store.pages = [WalletTransactionsListResponse(nextCursor: nil, transactions: [entry("new")])]
    store.readGate.release()
    await reading.value
    #expect(model.selectedID == "old" && store.reads.count == 2)
    model.closeDetail()
    await model.loadIfNeeded()?.value
    #expect(model.entries.map(\.txRef) == ["new"] && store.reads.count == 3)
  }

  private func model(
    _ store: WalletHistoryTestStore, send: WalletSendTestStore = WalletSendTestStore(),
    clipboard: HistoryClipboard = HistoryClipboard()
  )
    -> WalletHistoryModel
  {
    WalletHistoryModel(
      walletID: "wallet", accountID: "account", network: "ton", store: store, send: send,
      generation: 7, clipboard: clipboard)
  }
  private func entry(_ id: String) -> WalletTransactionEntry {
    WalletTransactionEntry(
      accountID: "account", amount: "900719925474099312345", amountUnit: "nanoTON",
      broadcastArtifactRef: nil, counterparty: "recipient", createdAt: 1, direction: .outgoing,
      fee: "3", messageRef: nil, network: "ton", status: "pending", txHash: id + "-hash", txRef: id,
      updatedAt: 1, validUntil: nil, walletID: "wallet")
  }
  private func status() -> WalletStatusResponse {
    WalletStatusResponse(
      disabledReason: nil, enabled: true, initialized: true,
      networks: [
        WalletNetworkStatus(
          broadcastEnabled: false, capabilities: [], disabledReason: nil, enabled: true,
          network: "ton", providerStatus: .ready)
      ], walletCount: 1)
  }
}

@MainActor
final class WalletHistoryTestStore: WalletHistoryStore {
  var pages: [WalletTransactionsListResponse] = []
  var reads: [WalletTransactionsListRequest] = []
  var syncs: [String] = []
  var refreshes: [String] = []
  var generations: [UInt64] = []
  var readFailure: String?
  var syncFailure: String?
  var refreshFailure: String?
  var refreshResult = WalletTransactionsRefreshResponse(
    network: "ton", status: "confirmed", txHash: nil, txRef: "tx", updatedAt: 2)
  let readGate = ContactsGate()
  let syncGate = ContactsGate()
  let refreshGate = ContactsGate()
  func walletTransactions(_ request: WalletTransactionsListRequest, generation: UInt64)
    async throws -> WalletTransactionsListResponse
  {
    reads.append(request)
    generations.append(generation)
    let result =
      pages.isEmpty
      ? WalletTransactionsListResponse(nextCursor: nil, transactions: [])
      : pages[min(request.cursor == nil ? 0 : 1, pages.count - 1)]
    await readGate.pause()
    if let readFailure { throw RPCFailure(code: readFailure) }
    return result
  }
  func syncWalletTransactions(_ request: WalletTransactionsSyncRequest, generation: UInt64)
    async throws -> WalletTransactionsSyncResponse
  {
    syncs.append(request.accountID)
    generations.append(generation)
    await syncGate.pause()
    if let syncFailure { throw RPCFailure(code: syncFailure) }
    return WalletTransactionsSyncResponse(
      accountID: request.accountID, fetchedAt: 1, network: "ton", syncedCount: 1)
  }
  func refreshWalletTransaction(_ request: WalletTransactionsRefreshRequest, generation: UInt64)
    async throws -> WalletTransactionsRefreshResponse
  {
    refreshes.append(request.txRef)
    generations.append(generation)
    await refreshGate.pause()
    if let refreshFailure { throw RPCFailure(code: refreshFailure) }
    return refreshResult
  }
}

@MainActor
private final class HistoryClipboard: CredentialClipboard {
  var value: String?
  func copy(_ value: String) { self.value = value }
  func clearOwned() { value = nil }
}
