import AirPresentation
import Foundation
import Testing

@testable import ChromVoidBridge

@Suite @MainActor
struct WalletSendTests {
  @Test func decimalInputPreservesSmallAndLargeAmountsWithoutRounding() throws {
    let ton = try #require(WalletNetworkPresentation.profile(for: "ton"))
    let bitcoin = try #require(WalletNetworkPresentation.profile(for: "bitcoin"))
    #expect(ton.baseUnits(from: "0.000000001") == "1")
    #expect(ton.baseUnits(from: "900719925474.099312345") == "900719925474099312345")
    #expect(ton.decimal(from: "900719925474099312345") == "900719925474.099312345")
    #expect(ton.baseUnits(from: " 1,5 ") == "1500000000")
    #expect(bitcoin.baseUnits(from: ".1") == "10000000")
    #expect(bitcoin.baseUnits(from: "1.") == "100000000")
    #expect(bitcoin.formatted("0000010000000") == "0.1 BTC")
    for invalid in ["", ".", "-1", "1e5", "1,000.50", "1.000000001", "NaN"] {
      #expect(bitcoin.baseUnits(from: invalid) == nil)
    }
    let ethereum = try #require(WalletNetworkPresentation.profile(for: "ethereum"))
    #expect(ethereum.baseUnits(from: "0.000000000000000001") == "1")
  }

  @Test func submitValidatesAndCapturesAllRecipientsWithoutCrossNetworkContacts() async throws {
    let store = WalletSendTestStore()
    let model = try model(store)
    let first = try #require(model.recipients.first?.id)
    #expect(model.prepare() == nil && model.focus == .address(first))
    model.change(.address(first), to: " first-recipient ")
    #expect(model.prepare() == nil && model.focus == .amount(first))
    model.change(.amount(first), to: "0.00001")
    model.addRecipient()
    let second = try #require(model.recipients.last?.id)
    let contact = WalletContactsTestStore.entry("contact").with(network: "ton")
    model.chooseContact(contact, for: second)
    #expect(model.recipients.last?.address == "")
    model.chooseContact(contact.with(network: "bitcoin"), for: second)
    model.change(.amount(second), to: "1.25")
    model.change(.comment, to: "unsupported comment")
    model.chooseFee(.fast)
    await model.prepare()?.value
    let request = try #require(store.prepares.first)
    #expect(request.accountID == "account" && request.network == "bitcoin")
    #expect(request.outputs.map(\.address) == ["first-recipient", "contact-address"])
    #expect(request.outputs.map(\.amount) == ["1000", "125000000"])
    #expect(request.outputs.allSatisfy { $0.comment == nil } && request.feePolicy.tier == .fast)
    #expect(model.state == .reviewing && store.prepares.count == 1)
    model.addRecipient()
    model.change(.amount(first), to: "50")
    #expect(model.recipients.first?.amount == "0.00001" && model.prepare() == nil)
    #expect(store.generations == [7])
  }

  @Test func pastedAddressMovesTheDraftToTheMatchingNetworkAccount() async throws {
    let store = WalletSendTestStore()
    store.detections = ["EQ-address": "ton", "0x-address": "ethereum"]
    let model = try model(store)
    let ton = try #require(WalletNetworkPresentation.profile(for: "ton"))
    model.accountResolver = { network in network == "ton" ? ("ton-account", ton) : nil }
    let id = try #require(model.recipients.first?.id)
    model.addRecipient()
    model.change(.amount(id), to: "0.5")
    model.change(.address(id), to: " EQ-address ")
    await model.addressDetection?.value
    #expect(store.detectRequests == ["EQ-address"])
    #expect(model.accountID == "ton-account" && model.profile.network == "ton")
    #expect(model.detectedNetwork == "ton" && model.networkMismatch == nil)
    #expect(model.recipients.count == 1 && model.recipients[0].amount == "0.5")
    // A network Core recognises but this wallet has no account on is a mismatch, not a switch.
    model.change(.address(id), to: "0x-address")
    await model.addressDetection?.value
    #expect(model.networkMismatch == "ethereum" && model.accountID == "ton-account")
    // Unrecognised input keeps the current account and reports nothing.
    model.change(.address(id), to: "recipient")
    await model.addressDetection?.value
    #expect(model.detectedNetwork == nil && model.networkMismatch == nil)
    model.change(.address(id), to: "")
    #expect(model.addressDetection == nil && store.detectRequests.count == 3)
    model.revoke()
    #expect(model.accountResolver == nil)
  }

  @Test func maximumQuoteExpiresAndCorePreparationOwnsTheReviewedAmount() async throws {
    let store = WalletSendTestStore()
    let clock = SendClock()
    let model = try model(store, clock: clock)
    let id = try #require(model.recipients.first?.id)
    model.change(.address(id), to: "recipient")
    await model.calculateQuote(maximumFor: id)?.value
    #expect(model.recipients[0].amount == "1.5" && model.maximumRecipientID == id)
    clock.date = Date(timeIntervalSince1970: 3)
    #expect(model.prepare() == nil && model.issue == .quoteRequired)
    clock.date = Date(timeIntervalSince1970: 1)
    // Core recomputes maximum at prepare time; the review must use this returned value.
    await model.prepare()?.value
    #expect(store.prepares.first?.maximizeOutputIndex == 0)
    #expect(model.prepared?.preview.outputs.first?.amount == "1000")
    #expect(model.maximumRecipientID == id)
    await model.cancelReview()?.value
    #expect(model.state == .editing && model.prepare() == nil && model.issue == .quoteRequired)
  }

  @Test func changedDraftRejectsLateQuoteAndTonUsesOneRecipientWithItsComment() async throws {
    let store = WalletSendTestStore()
    store.network = "ton"
    let model = try model(store, network: "ton")
    let id = try #require(model.recipients.first?.id)
    model.change(.address(id), to: "original")
    model.change(.amount(id), to: "1.25")
    model.change(.comment, to: " memo ")
    model.addRecipient()
    #expect(model.recipients.count == 1)
    store.quoteGate.enabled = true
    let pending = try #require(model.calculateQuote())
    await store.quoteGate.wait()
    model.change(.address(id), to: "changed")
    store.quoteGate.release()
    await pending.value
    #expect(model.quote == nil && !model.quoting && model.maximumRecipientID == nil)
    await model.prepare()?.value
    #expect(store.prepares.first?.outputs.first?.address == "changed")
    #expect(store.prepares.first?.outputs.first?.amount == "1250000000")
    #expect(store.prepares.first?.outputs.first?.comment == "memo")
  }

  @Test func reviewRequiresWarningsAndPasswordAndUnknownResultNeverResubmits() async throws {
    let store = WalletSendTestStore()
    store.warnings = [WalletWarning(code: "fixture-warning", message: "Synthetic warning")]
    let model = try model(store)
    try fill(model)
    await model.prepare()?.value
    #expect(model.confirm() == nil && model.focus == .warnings)
    model.toggleWarning("not-in-preview")
    #expect(model.acceptedWarnings.isEmpty)
    model.toggleWarning("fixture-warning")
    #expect(model.confirm() == nil && model.focus == .password)
    model.change(.password, to: "transient master")
    store.confirmGate.enabled = true
    let confirming = try #require(model.confirm())
    await store.confirmGate.wait()
    #expect(model.password.isEmpty && model.confirm() == nil && !model.requestDismiss())
    store.confirmGate.release()
    await confirming.value
    #expect(model.state == .uncertain && model.confirmation?.txRef == "sent")
    #expect(model.confirm() == nil && model.prepare() == nil && model.cancelReview() == nil)
    #expect(store.confirms.count == 1 && store.confirms[0].acceptedWarnings == ["fixture-warning"])
    #expect(store.confirms[0].masterPassword == "transient master")
    #expect(model.requestDismiss())
    model.revoke()
    #expect(model.prepared == nil && model.confirmation == nil && model.recipients.isEmpty)
  }

  @Test func definiteReauthCanRetryButTransportFailureCannot() async throws {
    let store = WalletSendTestStore()
    let model = try model(store)
    try fill(model)
    await model.prepare()?.value
    model.change(.password, to: "wrong")
    store.confirmFailure = "CONFIRM_REQUIRED"
    await model.confirm()?.value
    #expect(model.state == .reviewing && model.issue == .reauthentication && model.password.isEmpty)
    model.change(.password, to: "another attempt")
    store.confirmFailure = "INTERNAL_ERROR"
    await model.confirm()?.value
    #expect(model.state == .uncertain && model.confirmation == nil && model.password.isEmpty)
    #expect(model.confirm() == nil && model.cancelReview() == nil && store.confirms.count == 2)
  }

  @Test func expiredReviewRequiresEditingAndFailedCancelNeverAllowsConfirmation() async throws {
    let store = WalletSendTestStore()
    let clock = SendClock()
    let model = try model(store, clock: clock)
    try fill(model)
    await model.prepare()?.value
    clock.date = Date(timeIntervalSince1970: 20)
    #expect(model.confirm() == nil && model.state == .staleReview)
    #expect(!model.requestDismiss() && model.confirmingDiscard)
    model.cancelDiscard()
    store.cancelFailure = true
    await model.cancelReview()?.value
    #expect(model.state == .cancelFailed && model.confirm() == nil && model.prepared != nil)
    store.cancelFailure = false
    await model.discard()?.value
    #expect(model.state == .revoked && store.cancels == ["prepared", "prepared"])
    #expect(store.confirms.isEmpty)
  }

  @Test func pendingConfirmationAndRevocationRespectTheCapturedOperation() async throws {
    let store = WalletSendTestStore()
    store.confirmStatus = .pending
    let model = try model(store)
    try fill(model)
    await model.prepare()?.value
    model.change(.password, to: "transient")
    await model.confirm()?.value
    #expect(model.state == .submitted && model.confirmation?.status == .pending)
    #expect(model.cancelReview() == nil && model.confirm() == nil)
    let other = try self.model(store)
    try fill(other)
    store.prepareGate.enabled = true
    let preparing = try #require(other.prepare())
    await store.prepareGate.wait()
    other.revoke()
    store.prepareGate.release()
    await preparing.value
    #expect(other.state == .revoked && other.prepared == nil && other.recipients.isEmpty)
  }

  @Test func missingCapabilityPreventsPreparationAndAnUnresolvedJournalStopsTheForm() async throws {
    let store = WalletSendTestStore()
    let model = try model(store)
    let advertised = store.status()
    model.updateAvailability(
      advertised.with(networks: [advertised.networks[0].with(capabilities: .some(nil))]))
    try fill(model)
    #expect(model.prepare() == nil && model.issue == .unavailable && store.prepares.isEmpty)
    model.updateAvailability(advertised)
    store.prepareFailure = "BROADCAST_UNKNOWN"
    await model.prepare()?.value
    #expect(model.state == .uncertain && model.issue == .uncertain)
    #expect(model.prepare() == nil && model.confirm() == nil && model.cancelReview() == nil)
    #expect(store.prepares.count == 1 && model.requestDismiss())
  }

  private func model(
    _ store: WalletSendTestStore, network: String = "bitcoin", clock: SendClock = SendClock()
  ) throws -> WalletSendModel {
    let profile = try #require(WalletNetworkPresentation.profile(for: network))
    return WalletSendModel(
      walletID: "wallet", accountID: "account", profile: profile,
      status: store.status(network), store: store, generation: 7, now: { clock.date })
  }
  private func fill(_ model: WalletSendModel) throws {
    let id = try #require(model.recipients.first?.id)
    model.change(.address(id), to: "recipient")
    model.change(.amount(id), to: "0.00001")
  }
}

@MainActor
private final class SendClock { var date = Date(timeIntervalSince1970: 1) }

@MainActor
final class WalletSendTestStore: WalletSendStore {
  var rebroadcasts: [WalletTransactionRebroadcastRequest] = []
  var rebroadcastFailure: String?
  var rebroadcastResult = WalletTransactionRebroadcastResponse(
    network: "ton", status: "pending", txHash: "published", txRef: "tx", updatedAt: 42)
  let rebroadcastGate = ContactsGate()
  var network = "bitcoin"
  var detections: [String: String] = [:]
  var detectRequests: [String] = []
  var warnings: [WalletWarning] = []
  var prepares: [WalletTransactionPrepareRequest] = []
  var confirms: [WalletTransactionConfirmRequest] = []
  var cancels: [String] = []
  var generations: [UInt64] = []
  var prepareFailure: String?
  var confirmFailure: String?
  var confirmStatus: WalletConfirmStatus = .broadcastUnknown
  var cancelFailure = false
  let quoteGate = ContactsGate()
  let prepareGate = ContactsGate()
  let confirmGate = ContactsGate()
  func status(_ network: String = "bitcoin") -> WalletStatusResponse {
    WalletStatusResponse(
      disabledReason: nil, enabled: true, initialized: true,
      networks: [
        WalletNetworkStatus(
          broadcastEnabled: true,
          capabilities: [
            WalletCapabilityStatus(
              disabledReason: nil, id: network + "_native_transfer", state: .ready)
          ], disabledReason: nil, enabled: true, network: network, providerStatus: .ready)
      ], walletCount: 1)
  }
  private var preview: WalletPreview {
    WalletPreview(
      amountUnit: network == "bitcoin" ? "satoshi" : "nanoton", estimatedFee: "10", ethereum: nil,
      outputs: [WalletTransactionOutput(address: "recipient", amount: "1000", comment: nil)],
      solana: nil, ton: nil,
      totalDebit: "1010", warnings: warnings)
  }
  func quoteWalletTransaction(_ request: WalletTransactionQuoteRequest, generation: UInt64)
    async throws -> WalletTransactionQuoteResponse
  {
    await quoteGate.pause()
    return WalletTransactionQuoteResponse(
      accountID: "account", currentPreview: preview, expiresAt: 2000, maxAmount: "150000000",
      maxPreview: preview, network: network, quotedAt: 1000, spendable: "150000010")
  }
  func prepareWalletTransaction(_ request: WalletTransactionPrepareRequest, generation: UInt64)
    async throws -> WalletTransactionPrepareResponse
  {
    prepares.append(request)
    generations.append(generation)
    await prepareGate.pause()
    if let prepareFailure { throw RPCFailure(code: prepareFailure) }
    return WalletTransactionPrepareResponse(
      accountID: "account", expiresAt: 10000, network: network, preparationID: "prepared",
      preview: preview, walletID: "wallet")
  }
  func confirmWalletTransaction(_ request: WalletTransactionConfirmRequest, generation: UInt64)
    async throws -> WalletTransactionConfirmResponse
  {
    confirms.append(request)
    await confirmGate.pause()
    if let confirmFailure { throw RPCFailure(code: confirmFailure) }
    return WalletTransactionConfirmResponse(
      network: network, status: confirmStatus, txHash: nil, txRef: "sent")
  }
  func cancelWalletTransaction(_ request: WalletTransactionCancelRequest, generation: UInt64)
    async throws -> WalletTransactionCancelResponse
  {
    cancels.append(request.preparationID)
    if cancelFailure { throw RPCFailure(code: "INTERNAL_ERROR") }
    return WalletTransactionCancelResponse(cancelled: true)
  }
  func detectWalletAddress(_ address: String, generation: UInt64) async throws
    -> WalletAddressDetectResponse
  {
    detectRequests.append(address)
    let network = detections[address]
    return WalletAddressDetectResponse(
      address: address, candidates: network.map { [$0] } ?? [], network: network,
      normalizedAddress: network == nil ? nil : address)
  }
  func rebroadcastWalletTransaction(
    _ request: WalletTransactionRebroadcastRequest, generation: UInt64
  ) async throws -> WalletTransactionRebroadcastResponse {
    rebroadcasts.append(request)
    generations.append(generation)
    await rebroadcastGate.pause()
    if let rebroadcastFailure { throw RPCFailure(code: rebroadcastFailure) }
    return rebroadcastResult
  }
}
