import ChromVoidBridge
import Foundation
import Observation

@MainActor
@Observable
public final class WalletSendModel: Identifiable {
  public struct Recipient: Identifiable, Equatable {
    public let id: String
    public var address: String
    public var amount: String
  }
  public enum State: Equatable {
    case editing, preparing, reviewing, staleReview, confirming, cancelling, cancelFailed,
      submitted, uncertain,
      revoked
  }
  public enum Field: Hashable {
    case address(String)
    case amount(String)
    case comment, password, warnings
  }
  public enum Issue: Equatable {
    case required(Field)
    case invalidAmount(String)
    case invalidAddress, insufficientFunds, unavailable, denied
    case stale, quoteRequired, reauthentication, warnings, failed, cancellationFailed, uncertain
  }
  /// The sender account follows the pasted address: see `accountResolver`.
  public private(set) var accountID: String
  public let walletID: String
  public private(set) var profile: WalletNetworkPresentation
  /// Address-first Send: resolves a network detected from the primary recipient address to the
  /// account of the same wallet on that network. Nil (default) keeps the sender fixed.
  public var accountResolver:
    ((String) -> (accountID: String, profile: WalletNetworkPresentation)?)?
  /// Network Core read from the primary recipient address, when exactly one network accepts it.
  public private(set) var detectedNetwork: String?
  /// Detected network for which the wallet has no account; the address cannot be paid from here.
  public private(set) var networkMismatch: String?
  /// In-flight `wallet:address:detect` request for the primary recipient (tests await it).
  @ObservationIgnored public private(set) var addressDetection: Task<Void, Never>?
  private let detection = ModelWork()
  @ObservationIgnored private var status: WalletStatusResponse
  public private(set) var recipients: [Recipient] = [
    Recipient(id: UUID().uuidString, address: "", amount: "")
  ]
  public private(set) var comment = ""
  public private(set) var feeTier: WalletFeeTier = .standard
  public private(set) var state: State = .editing
  public private(set) var available: Bool
  public private(set) var issue: Issue?
  public private(set) var focus: Field?
  public private(set) var focusRevision = 0
  public private(set) var quote: WalletTransactionQuoteResponse?
  public private(set) var quoting = false
  public private(set) var maximumRecipientID: String?
  public private(set) var prepared: WalletTransactionPrepareResponse?
  public private(set) var acceptedWarnings: Set<String> = []
  public private(set) var password = ""
  public private(set) var confirmation: WalletTransactionConfirmResponse?
  public private(set) var confirmingDiscard = false
  private let store: any WalletSendStore
  private let generation: UInt64
  private let now: () -> Date
  private let work = ModelWork()
  @ObservationIgnored private var quoteWork: Task<Void, Never>?
  @ObservationIgnored private var draftRevision = 0

  public init(
    walletID: String, accountID: String, profile: WalletNetworkPresentation,
    status: WalletStatusResponse,
    store: any WalletSendStore, generation: UInt64, now: @escaping () -> Date = Date.init
  ) {
    self.walletID = walletID
    self.accountID = accountID
    self.profile = profile
    self.status = status
    self.available = profile.isAvailable(in: status)
    self.store = store
    self.generation = generation
    self.now = now
  }
  public var busy: Bool { state == .preparing || state == .confirming || state == .cancelling }
  public var quoteFresh: Bool {
    quote.map { Double($0.expiresAt) > now().timeIntervalSince1970 * 1_000 } ?? false
  }
  public var hasChanges: Bool {
    !comment.isEmpty || recipients.contains { !$0.address.isEmpty || !$0.amount.isEmpty }
  }
  public func updateAvailability(_ status: WalletStatusResponse) {
    guard state != .revoked else { return }
    self.status = status
    available = profile.isAvailable(in: status)
  }
  /// Asks Core which network accepts the primary address and, when the wallet has an account
  /// on it, moves the draft there. The typed recipients survive; the quote is recomputed. Every
  /// keystroke supersedes the previous lookup, so only the latest answer is applied.
  private func followPrimaryAddress() {
    detection.cancel()
    networkMismatch = nil
    let address = recipients.first?.address.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !address.isEmpty else {
      detectedNetwork = nil
      addressDetection = nil
      return
    }
    addressDetection = detection.start { [weak self, store, generation] run in
      let detected = (try? await store.detectWalletAddress(address, generation: generation))?
        .network
      guard let self, run.isCurrent else { return }
      self.addressDetection = nil
      self.detectedNetwork = detected
      guard self.state == .editing, let detected, detected != self.profile.network else { return }
      guard let target = self.accountResolver?(detected) else {
        self.networkMismatch = detected
        return
      }
      self.accountID = target.accountID
      self.profile = target.profile
      self.available = target.profile.isAvailable(in: self.status)
      if !target.profile.multipleOutputs, self.recipients.count > 1 {
        self.recipients = Array(self.recipients.prefix(1))
      }
      if !target.profile.supportsComment { self.comment = "" }
      self.feeTier = .standard
      self.invalidateQuote()
    }
  }
  public func change(_ field: Field, to value: String) {
    if field == .password {
      guard state == .reviewing else { return }
      password = value
      issue = nil
      focus = nil
      return
    }
    guard state == .editing else { return }
    switch field {
    case .address(let id):
      guard let index = recipients.firstIndex(where: { $0.id == id }) else { return }
      recipients[index].address = value
      if index == 0 { followPrimaryAddress() }
    case .amount(let id):
      guard let index = recipients.firstIndex(where: { $0.id == id }) else { return }
      recipients[index].amount = value
    case .comment: if profile.supportsComment { comment = value }
    case .password, .warnings: return
    }
    invalidateQuote()
  }
  public func value(_ field: Field) -> String {
    switch field {
    case .address(let id): recipients.first { $0.id == id }?.address ?? ""
    case .amount(let id): recipients.first { $0.id == id }?.amount ?? ""
    case .comment: comment
    case .password: password
    case .warnings: ""
    }
  }
  public func contacts(from entries: [WalletAddressBookEntry]) -> [WalletAddressBookEntry] {
    entries.filter { $0.network == profile.network }
  }

  public func chooseFee(_ tier: WalletFeeTier) {
    guard state == .editing else { return }
    feeTier = tier
    invalidateQuote()
  }
  public func addRecipient() {
    guard state == .editing, profile.multipleOutputs else { return }
    recipients.append(Recipient(id: UUID().uuidString, address: "", amount: ""))
    invalidateQuote()
  }
  public func removeRecipient(_ id: String) {
    guard state == .editing, recipients.count > 1 else { return }
    recipients.removeAll { $0.id == id }
    invalidateQuote()
  }
  public func chooseContact(_ contact: WalletAddressBookEntry, for recipientID: String) {
    guard contact.network == profile.network else { return }
    change(.address(recipientID), to: contact.address)
  }
  public func toggleWarning(_ code: String) {
    guard state == .reviewing,
      prepared?.preview.warnings.contains(where: { $0.code == code }) == true
    else { return }
    if acceptedWarnings.contains(code) {
      acceptedWarnings.remove(code)
    } else {
      acceptedWarnings.insert(code)
    }
    issue = nil
    focus = nil
  }
  private func invalidateQuote() {
    draftRevision += 1
    quoteWork?.cancel()
    quoteWork = nil
    quote = nil
    quoting = false
    maximumRecipientID = nil
    issue = nil
    focus = nil
  }
  private func validate(maximumFor id: String? = nil) -> Bool {
    focusRevision += 1
    issue = nil
    focus = nil
    guard available else {
      issue = .unavailable
      return false
    }
    for recipient in recipients {
      if recipient.address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        focus = .address(recipient.id)
        issue = .required(.address(recipient.id))
        return false
      }
      if recipient.id != id {
        guard let amount = profile.baseUnits(from: recipient.amount), amount != "0" else {
          focus = .amount(recipient.id)
          issue = .invalidAmount(recipient.id)
          return false
        }
      }
    }
    return true
  }
  @discardableResult
  public func calculateQuote(maximumFor id: String? = nil) -> Task<Void, Never>? {
    guard state == .editing,
      let index = recipients.firstIndex(where: { $0.id == (id ?? recipients.first?.id) })
    else { return nil }
    guard validate(maximumFor: id) else { return nil }
    invalidateQuote()
    let revision = draftRevision
    let request = WalletTransactionQuoteRequest(
      accountID: accountID, feePolicy: WalletFeePolicy(tier: feeTier), maxOutputIndex: index,
      network: profile.network,
      outputs: recipients.map {
        WalletTransactionQuoteOutput(
          address: $0.address.trimmingCharacters(in: .whitespacesAndNewlines),
          amount: profile.baseUnits(from: $0.amount), comment: outputComment)
      })
    quoting = true
    let task = Task { [weak self, store, generation] in
      do {
        let result = try await store.quoteWalletTransaction(request, generation: generation)
        guard let self, self.draftRevision == revision, self.state == .editing, !Task.isCancelled
        else { return }
        self.quoting = false
        self.quoteWork = nil
        guard result.accountID == self.accountID, result.network == self.profile.network else {
          self.issue = .failed
          return
        }
        self.quote = result
        if let id, let index = self.recipients.firstIndex(where: { $0.id == id }),
          let amount = self.profile.decimal(from: result.maxAmount)
        {
          self.recipients[index].amount = amount
          self.maximumRecipientID = id
        }
      } catch {
        guard let self, self.draftRevision == revision, !Task.isCancelled else { return }
        self.quoting = false
        self.quoteWork = nil
        if error.isSessionRevoked { self.revoke() } else { self.issue = self.mappedIssue(error) }
      }
    }
    quoteWork = task
    return task
  }
  private var outputComment: String? {
    let value = comment.trimmingCharacters(in: .whitespacesAndNewlines)
    return profile.supportsComment && !value.isEmpty ? value : nil
  }
  @discardableResult
  public func prepare() -> Task<Void, Never>? {
    guard state == .editing, validate() else { return nil }
    if maximumRecipientID != nil && !quoteFresh {
      issue = .quoteRequired
      return nil
    }
    var outputs: [WalletTransactionOutput] = []
    for recipient in recipients {
      guard let amount = profile.baseUnits(from: recipient.amount) else {
        issue = .invalidAmount(recipient.id)
        focus = .amount(recipient.id)
        return nil
      }
      outputs.append(
        WalletTransactionOutput(
          address: recipient.address.trimmingCharacters(in: .whitespacesAndNewlines),
          amount: amount, comment: outputComment))
    }
    let request = WalletTransactionPrepareRequest(
      accountID: accountID, feePolicy: WalletFeePolicy(tier: feeTier),
      maximizeOutputIndex: recipients.firstIndex { $0.id == maximumRecipientID },
      network: profile.network, outputs: outputs)
    let maximum = maximumRecipientID
    invalidateQuote()
    maximumRecipientID = maximum
    return start(.prepare(request))
  }
  @discardableResult
  public func cancelReview() -> Task<Void, Never>? {
    guard state == .reviewing || state == .staleReview || state == .cancelFailed, let prepared
    else { return nil }
    return start(.cancel(prepared.preparationID, close: false))
  }
  @discardableResult
  public func confirm() -> Task<Void, Never>? {
    guard state == .reviewing, let prepared else { return nil }
    focusRevision += 1
    issue = nil
    focus = nil
    guard available else {
      issue = .unavailable
      return nil
    }
    guard Double(prepared.expiresAt) > now().timeIntervalSince1970 * 1_000 else {
      issue = .stale
      password = ""
      state = .staleReview
      return nil
    }
    guard acceptedWarnings == Set(prepared.preview.warnings.map(\.code)) else {
      issue = .warnings
      focus = .warnings
      return nil
    }
    guard !password.isEmpty else {
      issue = .required(.password)
      focus = .password
      return nil
    }
    let request = WalletTransactionConfirmRequest(
      acceptedWarnings: acceptedWarnings.sorted(), masterPassword: password,
      preparationID: prepared.preparationID, spendAuthorizationID: nil)
    password = ""
    return start(.confirm(request))
  }
  public func requestDismiss() -> Bool {
    guard !busy else { return false }
    if state == .reviewing || state == .staleReview || state == .cancelFailed
      || (state == .editing && hasChanges)
    {
      confirmingDiscard = true
      return false
    }
    return true
  }
  public func cancelDiscard() { confirmingDiscard = false }
  @discardableResult
  public func discard() -> Task<Void, Never>? {
    guard !busy else { return nil }
    confirmingDiscard = false
    if state == .reviewing || state == .staleReview || state == .cancelFailed, let prepared {
      return start(.cancel(prepared.preparationID, close: true))
    }
    revoke()
    return nil
  }
  public func hidePassword() { password = "" }

  private enum SendError: Error { case invalidResponse }
  private enum Operation {
    case prepare(WalletTransactionPrepareRequest)
    case confirm(WalletTransactionConfirmRequest)
    case cancel(String, close: Bool)
  }
  private func start(_ operation: Operation) -> Task<Void, Never> {
    issue = nil
    focus = nil
    switch operation {
    case .prepare: state = .preparing
    case .confirm: state = .confirming
    case .cancel:
      state = .cancelling
      password = ""
    }
    return work.start { [weak self, store, generation] run in
      do {
        switch operation {
        case .prepare(let request):
          let result = try await store.prepareWalletTransaction(request, generation: generation)
          guard let self, run.isCurrent else { return }
          guard result.accountID == self.accountID, result.walletID == self.walletID,
            result.network == self.profile.network
          else {
            self.state = .editing
            self.issue = .failed
            return
          }
          self.prepared = result
          self.acceptedWarnings = []
          self.password = ""
          self.state = .reviewing
        case .confirm(let request):
          let result = try await store.confirmWalletTransaction(request, generation: generation)
          guard let self, run.isCurrent else { return }
          guard result.network == self.profile.network, !result.txRef.isEmpty else {
            throw SendError.invalidResponse
          }
          self.confirmation = result
          self.state = result.status == .pending ? .submitted : .uncertain
          if self.state == .uncertain { self.issue = .uncertain }
        case .cancel(let id, let close):
          let result = try await store.cancelWalletTransaction(
            WalletTransactionCancelRequest(preparationID: id), generation: generation)
          guard let self, run.isCurrent else { return }
          guard result.cancelled else { throw SendError.invalidResponse }
          if close {
            self.revoke()
          } else {
            self.prepared = nil
            self.acceptedWarnings = []
            self.state = .editing
          }
        }
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.issue = self.mappedIssue(error)
        if self.issue == .reauthentication {
          self.focus = .password
          self.focusRevision += 1
        }
        switch operation {
        case .prepare:
          if error.coreFailure?.code == "BROADCAST_UNKNOWN" {
            self.state = .uncertain
            self.issue = .uncertain
          } else {
            self.state = .editing
          }
        case .cancel:
          self.state = .cancelFailed
          self.issue = .cancellationFailed
        case .confirm:
          switch error.coreFailureKind {
          case .stale:
            self.state = .staleReview
          case .reauthRequired, .denied:
            self.state = .reviewing
          case .unavailable where error.coreFailure?.code == "WALLET_DISABLED":
            // A disabled wallet never reached the network; any other provider failure during
            // confirm may have broadcast, so it stays uncertain.
            self.state = .reviewing
          default:
            self.state = .uncertain
            self.issue = .uncertain
          }
        }
      }
    }
  }
  private func mappedIssue(_ error: Error) -> Issue {
    switch error.coreFailure?.code {
    case "INVALID_ADDRESS": return .invalidAddress
    case "INSUFFICIENT_FUNDS": return .insufficientFunds
    default: break
    }
    switch error.coreFailureKind {
    case .denied: return .denied
    case .unavailable: return .unavailable
    case .reauthRequired: return .reauthentication
    case .stale: return .stale
    default: return .failed
    }
  }
  public func revoke() {
    work.cancel()
    invalidateQuote()
    password = ""
    prepared = nil
    confirmation = nil
    recipients = []
    comment = ""
    acceptedWarnings = []
    confirmingDiscard = false
    detection.cancel()
    addressDetection = nil
    detectedNetwork = nil
    networkMismatch = nil
    accountResolver = nil
    available = false
    state = .revoked
  }
}
