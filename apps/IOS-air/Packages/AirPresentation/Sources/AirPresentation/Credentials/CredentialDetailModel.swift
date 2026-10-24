import ChromVoidBridge
import Foundation
import Observation

@Observable
@MainActor
public final class CredentialDetailModel {
  public enum State: Equatable { case loading, ready, failed, missing, revoked }
  public enum Deletion: Equatable { case idle, confirming, deleting, denied, uncertain }
  public enum MetadataField {
    case username
    case website(Int)
    case cardholder
  }
  private enum SecretAction { case reveal, copy }
  public let id: String
  public private(set) var state: State = .loading
  public private(set) var detail: CredentialDetail?
  /// Codes shown on the page itself; they are managed from the edit form.
  public private(set) var otp: CredentialOTPModel?
  /// A fresh copy of a page that is already shown is loading.
  public private(set) var refreshing = false
  public private(set) var editor: CredentialEditorModel?
  /// The protected fields are being read for the edit form.
  public private(set) var openingEditor = false
  public private(set) var editIssue: String?
  public private(set) var secrets: [String: String] = [:]
  public private(set) var secretIssues: [String: String] = [:]
  public private(set) var loadingSecret: String?
  public private(set) var deletion: Deletion = .idle
  public private(set) var copyFeedback: UUID?
  private let store: any CredentialStore
  private let clipboard: any CredentialClipboard
  private let generation: UInt64
  private let onMutation: () -> Void
  private let onDelete: () -> Void
  private let work = ModelWork()
  private let deletionWork = ModelWork()
  private let secretWork = ModelWork()

  public init(
    id: String, store: any CredentialStore, generation: UInt64,
    clipboard: any CredentialClipboard = SystemCredentialClipboard(),
    onDelete: @escaping () -> Void = {}, onMutation: @escaping () -> Void
  ) {
    self.id = id
    self.store = store
    self.clipboard = clipboard
    self.generation = generation
    self.onMutation = onMutation
    self.onDelete = onDelete
    reload()
  }
  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked, editor == nil, deletion != .deleting else {
      return nil
    }
    hideSecrets()
    // A page that is already on screen stays on screen while the fresh copy loads: no jump to
    // a spinner and back. The first load, a failure or a missing entry still replace it.
    if detail == nil { state = .loading }
    refreshing = detail != nil
    return work.start { [weak self, store, generation, id] run in
      do {
        let detail = try await store.credentialDetail(id: id, generation: generation)
        guard let self, run.isCurrent else { return }
        guard detail.id == id else { throw CredentialStoreError.invalidPage }
        self.detail = detail
        self.deletion = .idle
        self.state = .ready
        self.refreshing = false
        if detail.entryType == "login" {
          if let otp = self.otp {
            otp.reload()
          } else {
            self.otp = CredentialOTPModel(
              id: id, store: store, generation: generation, clipboard: self.clipboard,
              showsFirstCode: true, onCopied: { [weak self] in self?.copyFeedback = UUID() },
              onMutation: self.onMutation)
          }
        } else {
          self.otp?.revoke()
          self.otp = nil
          self.showCardNumber()
        }
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.state = error.coreFailureKind == .missing ? .missing : .failed
        self.refreshing = false
        self.detail = nil
        self.otp?.revoke()
        self.otp = nil
      }
    }
  }
  /// Brings the inline one-time code back after a hidden page.
  public func showFirstCode() {
    guard canInteract else { return }
    otp?.showFirstCode()
    showCardNumber()
  }
  /// The number is the card's face, not a secret to uncover: it loads with the page and comes
  /// back whenever the page does. Only the security code waits for the eye.
  private func showCardNumber() {
    guard detail?.entryType == "payment_card", secrets["card_pan"] == nil,
      secretIssues["card_pan"] == nil
    else { return }
    fetchSecret("card_pan", action: .reveal)
  }
  /// The page left the screen: hide every secret, including the inline code. While the page is
  /// visible the code stays on, whatever else happens on it.
  public func coverPage() {
    hideSecrets()
    otp?.hideCode()
  }
  /// Opens the edit form with every field in it, the protected ones included: they are read
  /// first, and a field with no saved value opens empty.
  @discardableResult
  public func beginEditing() -> Task<Void, Never>? {
    guard canInteract, loadingSecret == nil, let detail,
      ["login", "payment_card"].contains(detail.entryType)
    else { return nil }
    hideSecrets()
    openingEditor = true
    let types = allowedSecrets
    return secretWork.start { [weak self, store, generation, id] run in
      do {
        var secrets: [String: String] = [:]
        for type in types {
          try Task.checkCancellation()
          do {
            secrets[type] = try await store.readCredentialSecret(
              id: id, type: type, generation: generation)
          } catch let error where error.coreFailureKind == .missing {
            secrets[type] = ""
          }
        }
        guard let self, run.isCurrent else { return }
        self.openingEditor = false
        self.editor = CredentialEditorModel(
          detail: detail, secrets: secrets, store: store, generation: generation,
          clipboard: self.clipboard
        ) { [weak self] in self?.finishEditing() }
      } catch {
        guard let self, run.isCurrent else { return }
        self.openingEditor = false
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.editIssue =
          error.isPayloadTooLarge
          ? "This credential has a field too large to open on this device."
          : "Couldn’t open the editor. Try again."
        self.showCardNumber()
      }
    }
  }
  public func reveal(_ type: String) {
    guard canInteract else { return }
    if secrets[type] != nil {
      secrets[type] = nil
      return
    }
    fetchSecret(type, action: .reveal)
  }
  @discardableResult
  public func copySecret(_ type: String) -> Task<Void, Never>? {
    fetchSecret(type, action: .copy)
  }
  @discardableResult
  private func fetchSecret(_ type: String, action: SecretAction) -> Task<Void, Never>? {
    guard canInteract, editor == nil, loadingSecret == nil, allowedSecrets.contains(type) else {
      return nil
    }
    loadingSecret = type
    secretIssues[type] = nil
    return secretWork.start { [weak self, store, generation, id] run in
      do {
        let value = try await store.readCredentialSecret(id: id, type: type, generation: generation)
        guard let self, run.isCurrent else { return }
        self.loadingSecret = nil
        switch action {
        case .reveal:
          self.secrets[type] = value
        case .copy:
          // An empty field has nothing to copy; replacing the clipboard with "" would only
          // take away what the user had on it.
          guard !value.isEmpty else {
            self.secretIssues[type] = "This field has no saved value."
            return
          }
          self.clipboard.copy(value)
          self.copyFeedback = UUID()
        }
      } catch {
        guard let self, run.isCurrent else { return }
        self.loadingSecret = nil
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.secretIssues[type] = Self.secretIssue(error)
      }
    }
  }
  public var canInteract: Bool {
    state == .ready && !openingEditor && editor == nil
      && deletion != .deleting && deletion != .uncertain && deletion != .confirming
  }
  public func copyMetadata(_ field: MetadataField) {
    guard canInteract, editor == nil, loadingSecret == nil, let detail else { return }
    let value: String
    switch field {
    case .username: value = detail.username
    case .cardholder: value = detail.paymentCard?.cardholderName ?? ""
    case .website(let index):
      guard detail.websites.indices.contains(index) else { return }
      value = detail.websites[index]
    }
    guard !value.isEmpty else { return }
    clipboard.copy(value)
    copyFeedback = UUID()
  }
  public func clearCopyFeedback(_ id: UUID) {
    if copyFeedback == id { copyFeedback = nil }
  }
  public func requestDeletion() {
    guard canInteract, editor == nil, !allowedSecrets.isEmpty else { return }
    hideSecrets()
    deletion = .confirming
  }
  public func cancelDeletion() {
    if deletion == .confirming { deletion = .idle }
  }
  @discardableResult
  public func confirmDeletion() -> Task<Void, Never>? {
    guard state == .ready, deletion == .confirming else { return nil }
    deletion = .deleting
    return deletionWork.start { [weak self, store, generation, id] run in
      do {
        try await store.deleteCredential(id: id, generation: generation)
        guard let self, run.isCurrent else { return }
        self.clipboard.clearOwned()
        self.detail = nil
        self.state = .missing
        self.deletion = .idle
        self.onDelete()
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        switch error.coreFailureKind {
        case .missing:
          self.detail = nil
          self.state = .missing
          self.deletion = .idle
          self.onMutation()
        case .denied: self.deletion = .denied
        default:
          self.deletion = .uncertain
          self.onMutation()
        }
      }
    }
  }
  /// Why a protected field could not be read: missing, too large for one bridge reply, or
  /// something to try again.
  private static func secretIssue(_ error: any Error) -> String {
    if error.coreFailureKind == .missing { return "This field has no saved value." }
    if error.isPayloadTooLarge { return "This field is too large to show on this device." }
    return "Couldn’t read this field. Try again."
  }
  public var allowedSecrets: [String] {
    switch detail?.entryType {
    case "login": ["password", "note"]
    case "payment_card": ["card_pan", "card_cvv", "note"]
    default: []
    }
  }
  public func hideSecrets() {
    secretWork.cancel()
    secrets = [:]
    secretIssues = [:]
    loadingSecret = nil
    openingEditor = false
    editIssue = nil
    copyFeedback = nil
  }
  public func endEditing() {
    let refetch =
      editor?.needsReload == true || editor?.savedPartially == true
      || editor?.savedOutsideForm == true
    editor?.revoke()
    editor = nil
    if refetch {
      onMutation()
      reload()
    } else {
      showFirstCode()
    }
  }
  private func finishEditing() {
    editor?.revoke()
    editor = nil
    onMutation()
    reload()
  }
  public func revoke() {
    otp?.revoke()
    otp = nil
    state = .revoked
    refreshing = false
    work.cancel()
    deletionWork.cancel()
    hideSecrets()
    editor?.revoke()
    editor = nil
    detail = nil
    deletion = .idle
  }
}
