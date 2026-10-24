import ChromVoidBridge
import Foundation
import Observation

/// An ephemeral form. Core validates and commits metadata and secrets in one transaction.
@Observable
@MainActor
public final class CredentialCreationModel: Identifiable {
  public enum Kind: String, CaseIterable {
    case login
    case paymentCard = "payment_card"
  }
  public enum Field: String, Hashable {
    case title, username, password, cardholder, cardNumber, cardCode, month, year, note,
      group
  }
  public enum State: Equatable { case editing, saving, saved, uncertain, revoked }
  public private(set) var groupBrowser: GroupPickerModel?
  public private(set) var tagBrowser: CredentialTagsModel?
  public private(set) var selectedTags: [CredentialTagsModel.Selection] = []
  public var tagLabels: String { selectedTags.map(\.label).joined(separator: ", ") }
  public private(set) var generator: PasswordGeneratorModel?
  public private(set) var websiteEditor: WebsiteEditorModel?
  public private(set) var websites: [CredentialWebsiteRule] = []
  public let id = UUID()
  public private(set) var kind: Kind = .login
  public private(set) var state: State = .editing
  public private(set) var errors: [Field: String] = [:]
  public private(set) var issue: String?
  public private(set) var focus: Field?
  public private(set) var focusRevision = 0
  public private(set) var confirmingDiscard = false
  public private(set) var revealed: Set<Field> = []
  /// Changes when a card field kept less than was typed, so the face draws the draft again.
  public private(set) var cardInputRevision = 0
  /// The number field was left; a warning about the number waits for it.
  public private(set) var numberSettled = false
  private var values: [Field: String] = [:]
  private let store: any CredentialStore
  private let generation: UInt64
  private let onSaved: () -> Void
  private var initialGroup = ""
  private let work = ModelWork()
  public var isDirty: Bool {
    !websites.isEmpty || !selectedTags.isEmpty || kind != .login || value(.group) != initialGroup
      || values.contains { $0.key != .group && !$0.value.isEmpty }
  }

  public init(
    store: any CredentialStore, generation: UInt64, groupPath: String = "",
    onSaved: @escaping () -> Void
  ) {
    let initialGroup = groupPath == "/" ? "" : groupPath
    self.initialGroup = initialGroup
    values = [.group: initialGroup]
    self.store = store
    self.generation = generation
    self.onSaved = onSaved
  }

  public func beginWebsites() {
    guard state == .editing, kind == .login, websiteEditor == nil else { return }
    websiteEditor = WebsiteEditorModel(store: store, generation: generation, rules: websites) {
      [weak self] rules in
      guard let self, self.state == .editing, self.kind == .login else { return }
      self.websites = rules
      self.endWebsites()
    }
  }
  public func endWebsites() {
    websiteEditor?.revoke()
    websiteEditor = nil
  }
  public func beginGenerator() {
    guard state == .editing, kind == .login, generator == nil, groupBrowser == nil,
      tagBrowser == nil
    else { return }
    generator = PasswordGeneratorModel(store: store, generation: generation) {
      [weak self] password in
      guard let self, self.state == .editing, self.kind == .login else { return }
      self.change(.password, to: password)
      self.revealed.remove(.password)
      self.endGenerator()
    }
  }
  public func endGenerator() {
    generator?.revoke()
    generator = nil
  }

  public func beginGroups() {
    guard state == .editing, groupBrowser == nil else { return }
    groupBrowser = GroupPickerModel(
      store: store, generation: generation, current: value(.group).isEmpty ? "/" : value(.group)
    ) { [weak self] path in
      self?.change(.group, to: path == "/" ? "" : path)
      self?.endGroups()
    }
  }
  public func endGroups() {
    groupBrowser?.revoke()
    groupBrowser = nil
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
  /// Network recognised from the digits typed so far; stored with the card and drawn on its face.
  public var cardBrand: PaymentCardBrand? { PaymentCardBrand.detect(value(.cardNumber)) }

  /// A card needs no name: this is the one Core gives it when the name is left empty.
  public var cardTitleHint: String? {
    kind == .paymentCard ? PaymentCardTyping.titleHint(number: value(.cardNumber)) : nil
  }

  /// A number Core would store but that fails the network's length or check digit; shown once
  /// the number field is left, and never blocks the save.
  public var numberWarning: String? {
    guard kind == .paymentCard, numberSettled else { return nil }
    return PaymentCardTyping.numberWarning(value(.cardNumber))
  }

  public func value(_ field: Field) -> String { values[field] ?? "" }
  public func change(_ field: Field, to value: String) {
    guard state == .editing, self.value(field) != value else { return }
    var value = value
    var next: Field?? = nil
    if kind == .paymentCard, let typed = cardTyping(field, value) {
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
      let limit = Int(PaymentCardRules.inspect(value(.cardNumber)).format.codeDigits)
      return PaymentCardTyping.code(typed, previous: previous, limit: limit)
    default: return nil
    }
  }

  /// Number, expiry and code in the order a card is read out; then the holder while it is
  /// empty, else the keyboard goes.
  private func nextCardField(after field: Field) -> Field? {
    switch field {
    case .cardNumber: .month
    case .month: .year
    case .year: .cardCode
    case .cardCode: value(.cardholder).isEmpty ? .cardholder : nil
    default: nil
    }
  }
  public func selectKind(_ kind: Kind) {
    guard state == .editing else { return }
    if self.kind != kind {
      endGenerator()
      endWebsites()
    }
    self.kind = kind
    errors = [:]
    issue = nil
  }
  public func toggleVisibility(_ field: Field) {
    guard state == .editing, [.password, .cardNumber, .cardCode].contains(field) else { return }
    if revealed.contains(field) { revealed.remove(field) } else { revealed.insert(field) }
    focus = field
    focusRevision += 1
  }

  public func requestDismiss() { confirmingDiscard = isDirty }
  public func cancelDiscard() { confirmingDiscard = false }

  public func save() {
    guard state == .editing, generator == nil, websiteEditor == nil else { return }
    errors = [:]
    issue = nil
    // A card needs no name: Core names it from its network and last four digits.
    let required: [Field] =
      kind == .login ? [.title] : [.cardholder, .cardNumber, .month, .year]
    for field in required where value(field).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      errors[field] = "This field is required."
    }
    // Parsing is presentation work. Domain validation and card normalization stay in Core.
    if kind == .paymentCard {
      if errors[.cardNumber] == nil, let error = PaymentCardTyping.numberError(value(.cardNumber)) {
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
    do {
      let request = try makeRequest()
      state = .saving
      work.start { [weak self, store, generation] run in
        do {
          let result = try await store.createCredential(request, generation: generation)
          guard let self, run.isCurrent, self.state == .saving else { return }
          guard result.entryID == self.id.uuidString else {
            self.markUncertain()
            return
          }
          self.websites = []
          self.endWebsites()
          self.values = [:]
          self.initialGroup = ""
          self.revealed = []
          self.selectedTags = []
          self.endTags()
          self.endGroups()
          self.state = .saved
          self.onSaved()
        } catch {
          guard let self, run.isCurrent, self.state == .saving else { return }
          if error.isSessionRevoked {
            self.revoke()
          } else if case BridgeError.PayloadTooLarge = error {
            self.state = .editing
            self.issue = "This credential is too large. Shorten its fields and try again."
          } else if let failure = error as? RPCFailure {
            self.state = .editing
            switch failure.code {
            case "NAME_EXIST":
              self.errors[.title] = "A credential with this name already exists in this group."
              self.focus = .title
              self.focusRevision += 1
            case "EMPTY_PAYLOAD":
              self.issue =
                "Check the name, required fields and selected tags. For a card, check its number and security code."
            case "ACCESS_DENIED":
              self.issue = "This vault does not allow this change."
            default:
              self.markUncertain()
            }
          } else {
            // Transport/cancellation is not proof that the transaction did not commit.
            self.markUncertain()
          }
        }
      }
    } catch {
      issue = "Couldn’t prepare this credential. Check the fields and try again."
    }
  }

  public func revoke() {
    endWebsites()
    websites = []
    endGenerator()
    state = .revoked
    endGroups()
    endTags()
    selectedTags = []
    work.cancel()
    values = [:]
    initialGroup = ""
    errors = [:]
    issue = nil
    revealed = []
    focus = nil
    numberSettled = false
    confirmingDiscard = false
  }

  private func markUncertain() {
    state = .uncertain
    issue =
      "The save result could not be confirmed. Close this form and check the vault before creating the credential again."
  }

  private enum DraftError: Error { case invalidNumber }

  private func makeRequest() throws -> PassmanagerEntryCreateRequest {
    let card = kind == .paymentCard
    var paymentCard: JSONAny?
    if card {
      guard let month = PaymentCardExpiry.month(value(.month)),
        let year = PaymentCardExpiry.year(value(.year))
      else {
        throw DraftError.invalidNumber
      }
      let metadata = PaymentCardMetadata(
        brand: cardBrand?.wire ?? "unknown", cardholderName: value(.cardholder),
        expMonth: month, expYear: year, last4: nil)
      paymentCard = try JSONDecoder().decode(JSONAny.self, from: JSONEncoder().encode(metadata))
    }
    let urls = websites.map { ["value": $0.value, "match": $0.matchMode] }
    return PassmanagerEntryCreateRequest(
      createdTs: nil, entryID: id.uuidString, entryType: kind.rawValue,
      groupPath: value(.group).isEmpty ? nil : value(.group), iconRef: nil, otps: nil,
      paymentCard: paymentCard,
      secrets: PassmanagerEntryCreateSecrets(
        cardCvv: card ? optional(.cardCode) : nil, cardPan: card ? value(.cardNumber) : nil,
        note: optional(.note), password: card ? nil : optional(.password)),
      tagKeys: selectedTags.map(\.key), tags: nil, title: value(.title), updatedTs: nil,
      urls: card ? nil : try JSONDecoder().decode(JSONAny.self, from: JSONEncoder().encode(urls)),
      username: card ? nil : value(.username))
  }

  private func optional(_ field: Field) -> String? { value(field).isEmpty ? nil : value(field) }
}
