import ChromVoidBridge
import Foundation
import Observation

@Observable
@MainActor
public final class SSHDetailModel {
  public enum State: Equatable { case ready, working, uncertain, revoked }
  public enum ExportKind { case publicKey, privateKey }
  public private(set) var row: SSHKeySummary?
  public private(set) var state: State = .ready
  public private(set) var editing = false
  public private(set) var focusRevision = 0
  public private(set) var name = ""
  public private(set) var keepSource = true
  public private(set) var issue: String?
  public private(set) var exportKind: ExportKind?
  public private(set) var passphrase = ""
  public private(set) var confirmingPlaintext = false
  public private(set) var confirmingDelete = false
  public private(set) var document: SSHKeyDocument?
  public private(set) var filename = ""
  public private(set) var presentingDocument = false
  public private(set) var copied = false
  private let store: any SSHStore
  private let generation: UInt64
  private let clipboard: any CredentialClipboard
  private let onMutation: () -> Void
  private let onDelete: () -> Void
  private let onOpenSource: (String) -> Void
  private let work = ModelWork()
  @ObservationIgnored private var exporting = false

  public init(
    row: SSHKeySummary, store: any SSHStore, generation: UInt64, clipboard: any CredentialClipboard,
    onMutation: @escaping () -> Void, onDelete: @escaping () -> Void,
    onOpenSource: @escaping (String) -> Void
  ) {
    self.row = row
    self.store = store
    self.generation = generation
    self.clipboard = clipboard
    self.onMutation = onMutation
    self.onDelete = onDelete
    self.onOpenSource = onOpenSource
  }
  public func openSource() {
    guard state == .ready, let source = row?.key.sourceEntryID else { return }
    cancelExport()
    onOpenSource(source)
  }
  public func beginEdit() {
    guard state == .ready, exportKind == nil, let row else { return }
    name = row.key.name ?? ""
    keepSource = true
    editing = true
    issue = nil
  }
  public func changeName(_ value: String) {
    guard state == .ready else { return }
    name = value
    issue = nil
  }
  public func setKeepSource(_ value: Bool) {
    guard state == .ready else { return }
    keepSource = value
  }
  public func cancelEdit() {
    guard state == .ready else { return }
    editing = false
    name = ""
    issue = nil
  }
  @discardableResult
  public func save() -> Task<Void, Never>? {
    guard state == .ready, editing, exportKind == nil, let row else { return nil }
    let request = PassmanagerSSHEditRequest(
      keyID: row.key.id, name: name, revision: row.revision,
      sourceEntryID: keepSource ? row.key.sourceEntryID : nil)
    return mutate { [store, generation] in try await store.editSSH(request, generation: generation)
    }
  }
  public func requestDelete() {
    guard state == .ready, exportKind == nil else { return }
    confirmingDelete = true
  }
  public func cancelDelete() { confirmingDelete = false }
  @discardableResult
  public func delete() -> Task<Void, Never>? {
    guard state == .ready, confirmingDelete, let row else { return nil }
    confirmingDelete = false
    return mutate { [store, generation] in
      try await store.deleteSSH(id: row.key.id, generation: generation)
      return nil
    }
  }
  private func mutate(_ action: @escaping @MainActor () async throws -> SSHKeySummary?) -> Task<
    Void, Never
  > {
    state = .working
    issue = nil
    return work.start { [weak self] run in
      do {
        let row = try await action()
        guard let self, run.isCurrent else { return }
        self.state = .ready
        self.editing = false
        self.name = ""
        self.row = row
        self.onMutation()
        if row == nil { self.onDelete() }
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        switch error.coreFailureKind {
        case .invalidInput, .denied:
          self.state = .ready
          if error.coreFailure?.code == "EMPTY_PAYLOAD" { self.focusRevision += 1 }
          self.issue = "Couldn’t update this key. Check its name and vault permissions."
        default:
          self.state = .uncertain
          self.issue = "SSH keys may have changed. Go back and reload before continuing."
          self.onMutation()
        }
      }
    }
  }
  public func beginExport(_ kind: ExportKind) {
    guard state == .ready, !editing else { return }
    exportKind = kind
    passphrase = ""
    issue = nil
  }
  public func changePassphrase(_ value: String) {
    guard state == .ready else { return }
    passphrase = value
  }
  public func cancelPlaintext() { confirmingPlaintext = false }
  @discardableResult
  public func export(allowPlaintext: Bool = false) -> Task<Void, Never>? {
    guard state == .ready, let exportKind else { return nil }
    if exportKind == .privateKey && passphrase.isEmpty && !allowPlaintext {
      confirmingPlaintext = true
      return nil
    }
    confirmingPlaintext = false
    return readExport(privateKey: exportKind == .privateKey, copy: false)
  }
  @discardableResult
  public func copyPublicKey() -> Task<Void, Never>? {
    guard state == .ready else { return nil }
    return readExport(privateKey: false, copy: true)
  }
  private func readExport(privateKey: Bool, copy: Bool) -> Task<Void, Never>? {
    guard let row else { return nil }
    let request = PassmanagerSSHExportRequest(
      format: privateKey ? "openssh_private" : "openssh_public", keyID: row.key.id,
      passphrase: privateKey && !passphrase.isEmpty ? passphrase : nil)
    state = .working
    issue = nil
    copied = false
    exporting = true
    return work.start { [weak self, store, generation] run in
      do {
        let result = try await store.exportSSH(request, generation: generation)
        guard let self, run.isCurrent else { return }
        guard result.content.utf8.count <= 65536,
          result.filename == row.key.id || result.filename == row.key.id + ".pub"
        else { throw CredentialStoreError.invalidPage }
        self.state = .ready
        self.exporting = false
        self.passphrase = ""
        if copy {
          self.clipboard.copy(result.content)
          self.copied = true
        } else {
          self.document = SSHKeyDocument(content: result.content)
          self.filename = result.filename
          self.presentingDocument = true
        }
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.state = .ready
        self.exporting = false
        self.issue = "Couldn’t export this key. Reload it and try again."
      }
    }
  }
  public func dismissDocument() {
    presentingDocument = false
    document = nil
    filename = ""
  }
  public func finishExport(_ result: Result<URL, Error>) {
    guard state != .revoked else { return }
    cancelExport()
    if case .failure = result { issue = "Couldn’t save the key file. Try again." }
  }
  public func cancelExport() {
    if exporting {
      work.cancel()
      if state == .working { state = .ready }
    }
    exporting = false
    dismissDocument()
    passphrase = ""
    exportKind = nil
    confirmingPlaintext = false
  }
  public func revoke() {
    work.cancel()
    state = .revoked
    row = nil
    name = ""
    issue = nil
    editing = false
    passphrase = ""
    exportKind = nil
    confirmingPlaintext = false
    confirmingDelete = false
    copied = false
    dismissDocument()
  }
}
