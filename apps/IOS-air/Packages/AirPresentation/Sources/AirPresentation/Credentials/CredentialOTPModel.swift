import ChromVoidBridge
import Foundation
import Observation

@Observable
@MainActor
public final class CredentialOTPModel: Identifiable {
  public enum State { case loading, ready, failed, revoked }
  public enum Mutation { case idle, saving, uncertain }
  public enum Field: Hashable { case label, seed, period, counter }
  public struct Draft: Equatable {
    public var label = ""
    public var seed = ""
    public var encoding = "base32"
    public var algorithm = "SHA1"
    public var type = "TOTP"
    public var digits = 6
    public var period = "30"
    public var counter = "0"
    public var source: String?
    public var issuer = ""
    public var account = ""
  }
  public let id = UUID()
  public private(set) var state: State = .loading
  public private(set) var mutation: Mutation = .idle
  public private(set) var records: [CredentialOtpSummary] = []
  public private(set) var importer: CredentialOTPImportModel?
  public private(set) var draft: Draft?
  public private(set) var deleting: String?
  public private(set) var issue: String?
  public private(set) var invalidField: Field?
  /// What Save found in the setup key; a warning is kept by pressing Save again.
  private(set) var keyFinding: OTPSetupKey.Finding?
  /// A wrong character in the key as it is typed.
  var typingKeyIssue: OTPSetupKey.Finding? {
    draft.flatMap { OTPSetupKey.typingIssue($0.seed, encoding: $0.encoding) }
  }
  /// The draft whose key warning was shown; saving it unchanged means "keep this key".
  @ObservationIgnored private var warnedDraft: Draft?
  public private(set) var focusRevision = 0
  /// A code on screen and when it stops being valid (nil for counter-based codes).
  public struct ShownCode: Equatable {
    public let code: String
    public let deadline: Date?
  }
  /// Every code currently on screen, by record label. Codes are never hidden while their
  /// screen is visible; they refresh themselves and leave with the screen.
  public private(set) var shown: [String: ShownCode] = [:]
  /// Labels whose code is being requested.
  public private(set) var loading: Set<String> = []
  public private(set) var copied = false
  /// The code requested most recently, for callers that deal with one code at a time.
  public var shownLabel: String? { lastLabel.flatMap { shown[$0] != nil ? $0 : nil } }
  public var shownCode: String? { shownLabel.flatMap { shown[$0]?.code } }
  public var shownDeadline: Date? { shownLabel.flatMap { shown[$0]?.deadline } }
  public var loadingCode: Bool { !loading.isEmpty }
  private var lastLabel: String?
  private let store: any CredentialOTPStore
  private let clipboard: any CredentialClipboard
  private let entryID: String
  private let generation: UInt64
  private let onMutation: () -> Void
  private let onCopied: () -> Void
  private let showsFirstCode: Bool
  @ObservationIgnored private var revision = ""
  private let work = ModelWork()
  /// One work per record label; its run also guards the timed refresh kept in `expiry`.
  @ObservationIgnored private var codeWork: [String: ModelWork] = [:]
  @ObservationIgnored private var expiry: [String: Task<Void, Never>] = [:]
  public var canInteract: Bool {
    state == .ready && mutation == .idle && importer == nil
  }

  /// `showsFirstCode` requests the first time-based code as soon as records load, for inline
  /// display on the credential page. `onCopied` reports every clipboard copy to the owner.
  public init(
    id: String, store: any CredentialOTPStore, generation: UInt64,
    clipboard: any CredentialClipboard, showsFirstCode: Bool = false,
    onCopied: @escaping () -> Void = {}, onMutation: @escaping () -> Void
  ) {
    entryID = id
    self.store = store
    self.generation = generation
    self.clipboard = clipboard
    self.showsFirstCode = showsFirstCode
    self.onCopied = onCopied
    self.onMutation = onMutation
    reload()
  }
  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked, mutation != .saving else { return nil }
    if mutation == .uncertain { onMutation() }
    draft = nil
    deleting = nil
    issue = nil
    mutation = .idle
    // Records already on screen stay there while the list refreshes; a shown code survives
    // when its record still exists, so the page never blinks after the manager closes.
    if state != .ready {
      hideCode()
      records = []
      revision = ""
      state = .loading
    }
    return work.start { [weak self, store, entryID, generation] run in
      do {
        let result = try await store.otpRecords(id: entryID, generation: generation)
        guard let self, run.isCurrent else { return }
        self.records = result.records
        self.revision = result.revision
        self.state = .ready
        for label in self.shown.keys where !result.records.contains(where: { $0.label == label }) {
          self.hideCode(label)
        }
        if self.showsFirstCode { self.showFirstCode() }
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
        } else {
          self.hideCode()
          self.records = []
          self.revision = ""
          self.state = .failed
        }
      }
    }
  }
  public func beginImport() {
    guard canInteract, draft == nil else { return }
    hideCode()
    importer = CredentialOTPImportModel(store: store, generation: generation) { [weak self] value in
      guard let self, self.state != .revoked else { return }
      self.importer?.revoke()
      self.importer = nil
      self.draft = Draft(
        label: value.settings.label, seed: value.secret,
        encoding: value.settings.encoding, algorithm: value.settings.algorithm,
        type: value.settings.otpType,
        digits: value.settings.digits, period: String(value.settings.period),
        counter: value.settings.counter ?? "0",
        issuer: value.issuer, account: value.account)
      self.issue = nil
      self.invalidField = nil
      self.keyFinding = nil
      self.warnedDraft = nil
    }
  }
  public func endImport() {
    importer?.revoke()
    importer = nil
  }
  public func beginEdit(_ record: CredentialOtpSummary? = nil) {
    guard canInteract else { return }
    hideCode()
    if let record {
      draft = Draft(
        label: record.label, encoding: record.encoding, algorithm: record.algorithm,
        type: record.otpType, digits: record.digits, period: String(record.period),
        counter: record.counter ?? "0", source: record.label)
    } else {
      draft = Draft()
    }
    issue = nil
    invalidField = nil
    keyFinding = nil
    warnedDraft = nil
  }
  public func changeDraft(_ update: (inout Draft) -> Void) {
    guard mutation == .idle, var value = draft else { return }
    update(&value)
    guard value != draft else { return }
    if value.seed != draft?.seed || value.encoding != draft?.encoding { keyFinding = nil }
    draft = value
    issue = nil
  }
  public func cancelEdit() {
    guard mutation == .idle else { return }
    draft = nil
    issue = nil
    invalidField = nil
    keyFinding = nil
    warnedDraft = nil
  }
  private func invalid(_ field: Field, _ message: String) {
    invalidField = field
    issue = message
    focusRevision += 1
  }
  @discardableResult
  public func save() -> Task<Void, Never>? {
    guard canInteract, let draft else { return nil }
    guard !draft.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      invalid(.label, "Enter a code name.")
      return nil
    }
    guard draft.source != nil || !draft.seed.isEmpty else {
      invalid(.seed, "Enter the setup key from your service.")
      return nil
    }
    // The key is checked against its encoding here: Core would store a mistyped key and every
    // code from it would be wrong. A warning stops the first Save only.
    keyFinding = OTPSetupKey.check(draft.seed, encoding: draft.encoding)
    if let finding = keyFinding, !finding.isWarning || warnedDraft != draft {
      if finding.isWarning { warnedDraft = draft }
      invalidField = .seed
      focusRevision += 1
      return nil
    }
    guard let period = UInt32(draft.period), draft.type == "HOTP" || (10...120).contains(period)
    else {
      invalid(.period, "Enter a period from 10 to 120 seconds.")
      return nil
    }
    guard draft.type != "HOTP" || UInt64(draft.counter) != nil else {
      invalid(.counter, "Enter a valid nonnegative counter.")
      return nil
    }
    let request = PassmanagerOtpRecordSaveRequest(
      entryID: entryID, revision: revision,
      secret: draft.seed.isEmpty ? nil : draft.seed,
      settings: CredentialOtpSummary(
        algorithm: draft.algorithm, counter: draft.type == "HOTP" ? draft.counter : nil,
        digits: draft.digits, encoding: draft.encoding, label: draft.label, otpType: draft.type,
        period: Int(period)),
      sourceLabel: draft.source)
    return mutate { [store, generation] in try await store.saveOTP(request, generation: generation)
    }
  }
  public func requestDelete(_ label: String) {
    guard canInteract, draft == nil else { return }
    hideCode()
    deleting = label
  }
  public func cancelDelete() { if mutation == .idle { deleting = nil } }
  @discardableResult
  public func confirmDelete() -> Task<Void, Never>? {
    guard canInteract, let deleting else { return nil }
    let request = request(deleting)
    self.deleting = nil
    return mutate { [store, generation] in
      try await store.deleteOTP(request, generation: generation)
    }
  }
  private func mutate(_ operation: @escaping @MainActor () async throws -> Void) -> Task<
    Void, Never
  > {
    hideCode()
    mutation = .saving
    issue = nil
    return work.start { [weak self] run in
      do {
        try await operation()
        guard let self, run.isCurrent else { return }
        self.mutation = .idle
        self.onMutation()
        self.reload()
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.mutation = .idle
        let code = error.coreFailure?.code
        switch error.coreFailureKind {
        case .conflict: self.invalid(.label, "A code already uses this name.")
        case .invalidInput:
          self.invalid(.seed, "Check the setup key and code settings.")
        case .unknown where code == "OTP_GENERATE_FAILED" || code == "OTP_SETTINGS_INVALID":
          self.invalid(.seed, "Check the setup key and code settings.")
        case .denied: self.issue = "This vault does not allow this change."
        default:
          self.mutation = .uncertain
          self.issue = "Reload codes to check the saved state before trying again."
        }
      }
    }
  }
  private func request(_ label: String) -> PassmanagerOtpRecordRequest {
    PassmanagerOtpRecordRequest(entryID: entryID, label: label, revision: revision)
  }
  @discardableResult
  /// Requests one record's code. `keepingShown` leaves the current digits and deadline on
  /// screen until the next code arrives, so a timed refresh does not blink.
  public func code(_ label: String, copy: Bool = false, keepingShown: Bool = false)
    -> Task<Void, Never>?
  {
    guard canInteract, draft == nil, deleting == nil else { return nil }
    if keepingShown && shown[label] != nil { cancelCode(label) } else { hideCode(label) }
    let request = request(label)
    issue = nil
    let labelWork = codeWork[label] ?? ModelWork()
    codeWork[label] = labelWork
    loading.insert(label)
    return labelWork.start { [weak self, store, generation] run in
      do {
        var started = ContinuousClock.now
        var result = try await store.otpCode(request, generation: generation)
        if result.leftSeconds > 0,
          started.advanced(by: .seconds(result.leftSeconds - 1)) <= .now
        {
          // Finish the current whole-second window, then request the next code once.
          try await Task.sleep(for: .seconds(1))
          try Task.checkCancellation()
          started = .now
          result = try await store.otpCode(request, generation: generation)
        }
        guard let self, run.isCurrent else { return }
        self.loading.remove(label)
        // Core reports whole seconds; reserve the fractional second at the boundary.
        let deadline = started.advanced(by: .seconds(max(0, result.leftSeconds - 1)))
        if result.leftSeconds > 0 && deadline <= .now {
          self.issue = "This code expired. Request a new code."
          return
        }
        if copy {
          self.clipboard.copy(result.otp)
          self.copied = true
          self.onCopied()
        } else {
          self.lastLabel = label
          self.shown[label] = ShownCode(
            code: result.otp,
            deadline: result.leftSeconds > 0
              ? Date(timeIntervalSinceNow: max(0, Double(result.leftSeconds) - 1)) : nil)
        }
        // Core owns validity. Time-based codes refresh at their deadline; counter-based ones
        // stay until the screen goes away.
        guard result.leftSeconds > 0 else { return }
        self.expiry[label] = Task { [weak self] in
          try? await Task.sleep(until: deadline, clock: .continuous)
          guard let self, run.isCurrent else { return }
          if copy { self.hideCode(label) } else { self.code(label, keepingShown: true) }
        }
      } catch {
        guard let self, run.isCurrent else { return }
        self.loading.remove(label)
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.issue = "Couldn’t read this code. Reload codes and try again."
      }
    }
  }
  /// Shows the first time-based code when nothing is shown yet (the credential page).
  public func showFirstCode() {
    guard shown.isEmpty, loading.isEmpty, let first = records.first, first.otpType != "HOTP"
    else { return }
    code(first.label)
  }
  /// Shows every code that is not on screen yet (the code manager and the Codes list).
  public func showAllCodes() {
    for record in records where shown[record.label] == nil && !loading.contains(record.label) {
      code(record.label)
    }
  }
  /// The copy confirmation was shown long enough.
  public func clearCopied() { copied = false }
  /// Copies a code that is already on screen without a second Core round trip.
  public func copyShownCode(_ label: String? = nil) {
    guard let label = label ?? shownLabel, let shown = shown[label] else { return }
    clipboard.copy(shown.code)
    copied = true
    onCopied()
  }
  private func cancelCode(_ label: String) {
    codeWork[label]?.cancel()
    codeWork[label] = nil
    expiry[label]?.cancel()
    expiry[label] = nil
    loading.remove(label)
  }
  public func hideCode(_ label: String) {
    cancelCode(label)
    shown[label] = nil
    if lastLabel == label { lastLabel = nil }
  }
  public func hideCode() {
    for label in Set(shown.keys).union(codeWork.keys).union(loading) { cancelCode(label) }
    shown = [:]
    lastLabel = nil
    copied = false
    loading = []
  }
  public func revoke() {
    endImport()
    work.cancel()
    hideCode()
    state = .revoked
    mutation = .idle
    draft = nil
    deleting = nil
    issue = nil
    records = []
    revision = ""
  }
}
