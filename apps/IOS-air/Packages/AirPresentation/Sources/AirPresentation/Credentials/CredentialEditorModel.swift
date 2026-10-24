import ChromVoidBridge
import Foundation
import Observation

/// The one edit form of a credential: metadata and the protected fields together. Core takes
/// them in separate calls, so a save sends the metadata first and then each changed field; a
/// failure after the first call leaves the form asking for a reload instead of a blind retry.
@Observable
@MainActor
public final class CredentialEditorModel: Identifiable {
  public enum State: Equatable { case editing, saving, saved, needsReload, revoked }
  public enum Field: String {
    case title, username, group, cardholder, month, year
    case cardNumber, cardCode, password, note
  }
  /// The protected fields and their Core secret types, in the order a save writes them.
  static let secretTypes: [(Field, String)] = [
    (.cardNumber, "card_pan"), (.cardCode, "card_cvv"), (.password, "password"), (.note, "note"),
  ]
  private static let metadataFields: [Field] = [
    .title, .username, .group, .cardholder, .month, .year,
  ]
  public private(set) var groupBrowser: GroupPickerModel?
  public private(set) var tagBrowser: CredentialTagsModel?
  public private(set) var selectedTags: [CredentialTagsModel.Selection] = []
  public var tagLabels: String { selectedTags.map(\.label).joined(separator: ", ") }
  public private(set) var generator: PasswordGeneratorModel?
  /// The login's websites and one-time codes. Their editors save on their own, as soon as they
  /// are done; the form then rereads the entry so its own save carries the new revision.
  public private(set) var websiteEditor: WebsiteEditorModel?
  public private(set) var otpManager: CredentialOTPModel?
  /// Websites or codes were saved from this form; the page behind it is out of date.
  public private(set) var savedOutsideForm = false
  /// The entry is being reread after such a save; the form's Save waits for it.
  public private(set) var refreshing = false
  public var isLogin: Bool { baseline?.entryType == "login" }
  public var websites: [String] { baseline?.websites ?? [] }
  public let id = UUID()
  /// The protected fields this form edits: the ones read when it opened.
  public let secretFields: Set<Field>
  public var isCard: Bool { baseline?.entryType == "payment_card" }
  /// The stored card, for the editor to draw the face around the editable fields.
  public var card: PaymentCardMetadata? { baseline?.paymentCard }
  public var isDirty: Bool { values != initial || tagsChanged }
  public var needsReload: Bool { state == .needsReload }
  /// An earlier call of a save landed before a later one was refused; the page behind the form
  /// is out of date even if the form is cancelled.
  public private(set) var savedPartially = false
  public private(set) var state: State = .editing
  public private(set) var values: [Field: String]
  public private(set) var errors: [Field: String] = [:]
  public private(set) var issue: String?
  public private(set) var focus: Field?
  public private(set) var focusRevision = 0
  public private(set) var revealed = false
  public private(set) var confirmingDiscard = false
  /// Changes when a card field kept less than was typed, so the face draws the draft again.
  public private(set) var cardInputRevision = 0
  /// The number field was left; a warning about the number waits for it.
  public private(set) var numberSettled = false
  private var initial: [Field: String]
  private var baseline: CredentialDetail?
  private var savedTagKeys: [String]
  private let entryID: String
  private let store: any CredentialStore
  private let clipboard: any CredentialClipboard
  private let generation: UInt64
  private let onSaved: () -> Void
  private let work = ModelWork()
  private let refreshWork = ModelWork()
  @ObservationIgnored private var codesChanged = false

  /// `secrets` are the stored protected values by Core type; a type left out is not edited.
  public init(
    detail: CredentialDetail, secrets: [String: String] = [:], store: any CredentialStore,
    generation: UInt64, clipboard: any CredentialClipboard = SystemCredentialClipboard(),
    onSaved: @escaping () -> Void
  ) {
    entryID = detail.id
    baseline = detail
    savedTagKeys = detail.tagKeys
    selectedTags = zip(detail.tagKeys, detail.tags).map { .init(key: $0.0, label: $0.1) }
    self.store = store
    self.clipboard = clipboard
    self.generation = generation
    self.onSaved = onSaved
    var fields: [Field: String] = [
      .title: detail.title, .username: detail.username,
      .group: detail.groupPath,
      .cardholder: detail.paymentCard?.cardholderName ?? "",
      // The expiry opens as the card prints it, `MM / YY`.
      .month: detail.paymentCard.map { String(format: "%02d", $0.expMonth) } ?? "",
      .year: detail.paymentCard.map { PaymentCardExpiry.shortYear($0.expYear) } ?? "",
    ]
    var editable = Set<Field>()
    for (field, type) in Self.secretTypes {
      guard let value = secrets[type] else { continue }
      fields[field] = value
      editable.insert(field)
    }
    secretFields = editable
    values = fields
    initial = fields
  }
  public func beginGenerator() {
    guard state == .editing, secretFields.contains(.password), generator == nil,
      groupBrowser == nil, tagBrowser == nil
    else { return }
    generator = PasswordGeneratorModel(store: store, generation: generation) {
      [weak self] password in
      guard let self, self.state == .editing, self.secretFields.contains(.password) else {
        return
      }
      self.change(.password, to: password)
      self.revealed = false
      self.endGenerator()
    }
  }
  public func endGenerator() {
    generator?.revoke()
    generator = nil
  }

  public func beginTags() {
    guard state == .editing, tagBrowser == nil else { return }
    tagBrowser = CredentialTagsModel(
      store: store, generation: generation, selection: selectedTags,
      onApply: { [weak self] selection in
        guard let self, self.state == .editing else { return }
        self.selectedTags = selection
        self.issue = nil
        self.endTags()
      })
  }
  public func endTags() {
    tagBrowser?.revoke()
    tagBrowser = nil
  }
  public func beginGroups() {
    guard state == .editing, groupBrowser == nil else { return }
    // The draft's group, not the saved one, so a second pick continues from the first.
    let current = value(.group).isEmpty ? (baseline?.groupPath ?? "/") : value(.group)
    groupBrowser = GroupPickerModel(store: store, generation: generation, current: current) {
      [weak self] path in
      self?.change(.group, to: path)
      self?.endGroups()
    }
  }
  public func endGroups() {
    groupBrowser?.revoke()
    groupBrowser = nil
  }
  public func beginWebsites() {
    guard state == .editing, isLogin, !refreshing, !sheetOpen else { return }
    websiteEditor = WebsiteEditorModel(store: store, generation: generation, entryID: entryID) {
      [weak self] _ in self?.endWebsites()
    }
  }
  public func endWebsites() {
    let saved = websiteEditor?.state == .saved || websiteEditor?.state == .needsReload
    websiteEditor?.revoke()
    websiteEditor = nil
    if saved { refreshBaseline() }
  }
  public func beginOTP() {
    guard state == .editing, isLogin, !refreshing, !sheetOpen else { return }
    codesChanged = false
    otpManager = CredentialOTPModel(
      id: entryID, store: store, generation: generation, clipboard: clipboard
    ) { [weak self] in self?.codesChanged = true }
  }
  public func endOTP() {
    otpManager?.revoke()
    otpManager = nil
    if codesChanged { refreshBaseline() }
    codesChanged = false
  }
  /// Any sheet of the form that is open, so a second one waits.
  private var sheetOpen: Bool {
    websiteEditor != nil || otpManager != nil || generator != nil || groupBrowser != nil
      || tagBrowser != nil
  }
  /// Rereads the entry after its websites or codes were saved. The draft stays as typed; only
  /// the saved state it is compared with, and the revision its save sends, move forward.
  private func refreshBaseline() {
    savedOutsideForm = true
    refreshing = true
    refreshWork.start { [weak self, store, generation, entryID] run in
      do {
        let detail = try await store.credentialDetail(id: entryID, generation: generation)
        guard let self, run.isCurrent else { return }
        guard detail.id == entryID else { throw CredentialStoreError.invalidPage }
        self.baseline = detail
        self.refreshing = false
      } catch {
        guard let self, run.isCurrent else { return }
        self.refreshing = false
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.requireReload(
          "This credential changed. Close the editor and review the latest version before editing again."
        )
      }
    }
  }
  public func value(_ field: Field) -> String { values[field] ?? "" }
  public func change(_ field: Field, to value: String) {
    guard state == .editing, values[field] != value else { return }
    var value = value
    var next: Field?? = nil
    if isCard, let typed = cardTyping(field, value) {
      if typed.value != value { cardInputRevision += 1 }
      value = typed.value
      if typed.done { next = .some(nextCardField(after: field)) }
    }
    values[field] = value
    errors[field] = nil
    issue = nil
    if let next {
      focus = next
      focusRevision += 1
    }
  }

  /// The card's network: the one the number being retyped names, else the stored one.
  public var cardFormat: AirPaymentCardFormat {
    let number = secretFields.contains(.cardNumber) ? value(.cardNumber) : ""
    let typed = PaymentCardRules.inspect(number).format
    return typed.network != nil ? typed : PaymentCardRules.format(brand: card?.brand ?? "")
  }

  /// The name Core gives the card when its name is left empty.
  public var cardTitleHint: String? {
    guard isCard else { return nil }
    let number = secretFields.contains(.cardNumber) ? value(.cardNumber) : ""
    return PaymentCardTyping.titleHint(number: number, stored: card)
  }

  /// A number Core would store but that fails the network's length or check digit; shown once
  /// the number field is left, and never blocks the save.
  public var numberWarning: String? {
    guard isCard, numberSettled, secretFields.contains(.cardNumber) else { return nil }
    return PaymentCardTyping.numberWarning(value(.cardNumber))
  }

  /// The number field gained or lost focus.
  public func numberFocusChanged(_ focused: Bool) {
    guard state == .editing else { return }
    numberSettled = !focused
  }

  private func cardTyping(_ field: Field, _ typed: String) -> PaymentCardTyping.Result? {
    let previous = value(field)
    switch field {
    case .cardNumber: return PaymentCardTyping.number(typed, previous: previous)
    case .month: return PaymentCardTyping.month(typed, previous: previous)
    case .year: return PaymentCardTyping.year(typed, previous: previous)
    case .cardCode:
      return PaymentCardTyping.code(
        typed, previous: previous, limit: Int(cardFormat.codeDigits))
    default: return nil
    }
  }

  /// Number, expiry and code in the order a card is read out, skipping what this form does
  /// not edit; then the holder while it is empty, else the keyboard goes.
  private func nextCardField(after field: Field) -> Field? {
    let order: [Field] = [.cardNumber, .month, .year, .cardCode]
      .filter { ![.cardNumber, .cardCode].contains($0) || secretFields.contains($0) }
    if let index = order.firstIndex(of: field), index + 1 < order.count {
      return order[index + 1]
    }
    return value(.cardholder).isEmpty ? .cardholder : nil
  }
  public func toggleVisibility() {
    guard state == .editing else { return }
    revealed.toggle()
  }
  public func requestDismiss() { confirmingDiscard = isDirty }
  public func cancelDiscard() { confirmingDiscard = false }
  public func save() {
    guard state == .editing, generator == nil, !refreshing else { return }
    errors = [:]
    issue = nil
    // A card needs no name: an empty one goes back to the name Core gives it.
    var required: [Field] = isCard ? [.cardholder, .month, .year] : [.title]
    if isCard && secretFields.contains(.cardNumber) { required.insert(.cardNumber, at: 1) }
    for field in required where value(field).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      errors[field] = "This field is required."
    }
    if isCard {
      if secretFields.contains(.cardNumber), errors[.cardNumber] == nil,
        let error = PaymentCardTyping.numberError(value(.cardNumber))
      {
        errors[.cardNumber] = error
      }
      if errors[.month] == nil, PaymentCardExpiry.month(value(.month)) == nil {
        errors[.month] = PaymentCardExpiry.monthIssue
      }
      if errors[.year] == nil, PaymentCardExpiry.year(value(.year)) == nil {
        errors[.year] = PaymentCardExpiry.yearIssue
      }
    }
    if let first = required.first(where: { errors[$0] != nil }) {
      focus = first
      focusRevision += 1
      return
    }
    guard isDirty else {
      onSaved()
      return
    }
    let metadataChanged = tagsChanged || Self.metadataFields.contains { changed($0) != nil }
    let request = baseline.flatMap { detail in
      metadataChanged
        ? PassmanagerEntryUpdateRequest(
          cardholderName: changed(.cardholder), entryID: entryID,
          expMonth: changed(.month).flatMap(PaymentCardExpiry.month),
          expYear: changed(.year).flatMap(PaymentCardExpiry.year),
          groupPath: changed(.group), revision: detail.revision,
          tagKeys: tagsChanged ? selectedTags.map(\.key) : nil,
          title: changed(.title),
          username: changed(.username),
          websites: nil) : nil
    }
    let secretWrites = Self.secretTypes.compactMap { field, type in
      secretFields.contains(field) ? changed(field).map { (field, type, $0) } : nil
    }
    state = .saving
    work.start { [weak self, store, generation, entryID] run in
      // Which call is running, for the message; and what has already landed.
      var current: String?
      var landed: [Field] = []
      do {
        if let request {
          let result = try await store.updateCredential(request, generation: generation)
          guard result.entryID == entryID else { throw CredentialStoreError.invalidPage }
          landed = Self.metadataFields
        }
        for (field, type, value) in secretWrites {
          current = type
          try await store.saveCredentialSecret(
            id: entryID, type: type, value: value, generation: generation)
          landed.append(field)
        }
        guard let self, run.isCurrent, self.state == .saving else { return }
        self.selectedTags = []
        self.endTags()
        self.state = .saved
        self.values = [:]
        self.initial = [:]
        self.revealed = false
        self.onSaved()
      } catch {
        guard let self, run.isCurrent, self.state == .saving else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.state = .editing
        if !landed.isEmpty {
          self.savedPartially = true
          // A refused or oversized value is the ordinary mistake: keep the form open on it,
          // with what landed no longer counted as a change.
          if error.coreFailureKind == .invalidInput || error.isPayloadTooLarge {
            for field in landed { self.initial[field] = self.values[field] }
            if request != nil { self.savedTagKeys = self.selectedTags.map(\.key) }
            self.issue =
              error.isPayloadTooLarge
              ? "This credential is too large. Shorten its fields and try again."
              : Self.invalidIssue(current)
            return
          }
          self.requireReload(
            "Some changes were saved and others were not. Close the editor and check the saved values before editing again."
          )
          return
        }
        switch error.coreFailureKind {
        case .conflict:
          self.errors[.title] = "A credential with this name already exists in this group."
          self.focus = .title
          self.focusRevision += 1
        case .invalidInput: self.issue = Self.invalidIssue(current)
        case .denied: self.issue = "This vault does not allow this change."
        case .unknown where error.coreFailure?.code == "SYNC_CONFLICT":
          self.requireReload(
            "This credential changed. Close the editor and review the latest version before editing again."
          )
        case .missing:
          self.requireReload("This credential is no longer available. Close the editor to refresh.")
        default:
          if case BridgeError.PayloadTooLarge = error {
            self.issue = "This credential is too large. Shorten its fields and try again."
          } else {
            self.requireReload(
              "The save result could not be confirmed. Close the editor and check the saved values before trying again."
            )
          }
        }
      }
    }
  }
  /// The message for a value Core refused, by the secret type being written (nil: metadata).
  private static func invalidIssue(_ type: String?) -> String {
    switch type {
    case "card_cvv": "Enter a valid security code."
    case "card_pan": "Enter a valid card number."
    case nil: "Check the name, required fields and selected tags."
    default: "Check this field and try again."
    }
  }
  private var tagsChanged: Bool { selectedTags.map(\.key) != savedTagKeys }
  private func changed(_ field: Field) -> String? {
    values[field] == initial[field] ? nil : values[field]
  }
  private func requireReload(_ copy: String) {
    state = .needsReload
    issue = copy
  }
  public func revoke() {
    endGenerator()
    websiteEditor?.revoke()
    websiteEditor = nil
    otpManager?.revoke()
    otpManager = nil
    refreshWork.cancel()
    refreshing = false
    state = .revoked
    endTags()
    selectedTags = []
    endGroups()
    work.cancel()
    values = [:]
    initial = [:]
    baseline = nil
    errors = [:]
    issue = nil
    focus = nil
    revealed = false
    confirmingDiscard = false
  }
}
