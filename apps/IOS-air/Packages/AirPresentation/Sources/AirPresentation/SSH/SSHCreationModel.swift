import ChromVoidBridge
import Foundation
import Observation

@Observable
@MainActor
public final class SSHCreationModel: Identifiable {
  public enum Mode: String, CaseIterable { case generate, importKey }
  public enum State: Equatable { case editing, reading, saving, uncertain, revoked }
  public enum Field: Hashable { case name, comment, privateKey, passphrase }
  public let id = UUID()
  public private(set) var state: State = .editing
  public private(set) var mode: Mode = .generate
  public private(set) var algorithm = "ed25519"
  public private(set) var issue: String?
  public private(set) var focus: Field?
  public private(set) var focusRevision = 0
  public private(set) var importingFile = false
  public private(set) var confirmingDiscard = false
  private var values: [Field: String] = [:]
  private let store: any SSHStore
  private let generation: UInt64
  private let sourceID: String?
  private let onSaved: () -> Void
  private let work = ModelWork()
  public var isDirty: Bool { values.values.contains(where: { !$0.isEmpty }) }

  public init(
    store: any SSHStore, generation: UInt64, sourceID: String? = nil, onSaved: @escaping () -> Void
  ) {
    self.store = store
    self.generation = generation
    self.sourceID = sourceID
    self.onSaved = onSaved
  }
  public func value(_ field: Field) -> String { values[field] ?? "" }
  public func change(_ field: Field, to value: String) {
    guard state == .editing, self.value(field) != value else { return }
    values[field] = value
    issue = nil
  }
  public func setMode(_ mode: Mode) {
    guard state == .editing else { return }
    self.mode = mode
    values[.privateKey] = nil
    values[.passphrase] = nil
    issue = nil
  }
  public func setAlgorithm(_ algorithm: String) {
    guard state == .editing else { return }
    self.algorithm = algorithm
  }
  public func requestClose() -> Bool {
    guard !isDirty, state != .saving, state != .reading else {
      confirmingDiscard = true
      return false
    }
    return true
  }
  public func cancelDiscard() { confirmingDiscard = false }
  public func beginFileImport() {
    guard state == .editing, mode == .importKey else { return }
    importingFile = true
  }
  public func dismissFileImport() { importingFile = false }
  @discardableResult
  public func importFile(_ result: Result<URL, Error>) -> Task<Void, Never>? {
    importingFile = false
    guard state == .editing, mode == .importKey else { return nil }
    guard case .success(let url) = result else {
      issue = "Couldn’t read the selected key file."
      return nil
    }
    state = .reading
    return work.start { [weak self] run in
      do {
        let value = try await SSHFileAccess.read(url)
        guard let self, run.isCurrent else { return }
        self.values[.privateKey] = value
        self.state = .editing
        self.issue = nil
      } catch {
        guard let self, run.isCurrent else { return }
        self.state = .editing
        self.issue = "Choose an OpenSSH private key file up to 64 KiB."
      }
    }
  }
  @discardableResult
  public func submit() -> Task<Void, Never>? {
    guard state == .editing else { return nil }
    issue = nil
    if mode == .importKey && value(.privateKey).isEmpty {
      issue = "Paste a private key or choose a key file."
      focus = .privateKey
      focusRevision += 1
      return nil
    }
    for (field, limit) in [
      (Field.name, 256), (.comment, 1024), (.privateKey, 65536), (.passphrase, 1024),
    ] where value(field).utf8.count > limit {
      issue = "This field is too long. Shorten it and try again."
      focus = field
      focusRevision += 1
      return nil
    }
    let generate = PassmanagerSSHKeygenRequest(
      comment: value(.comment), keyType: algorithm, name: value(.name), sourceEntryID: sourceID)
    let imported = PassmanagerSSHImportRequest(
      name: value(.name), passphrase: value(.passphrase).isEmpty ? nil : value(.passphrase),
      privateKey: value(.privateKey), sourceEntryID: sourceID)
    let mode = mode
    state = .saving
    return work.start { [weak self, store, generation] run in
      do {
        if mode == .generate {
          _ = try await store.generateSSH(generate, generation: generation)
        } else {
          _ = try await store.importSSH(imported, generation: generation)
        }
        guard let self, run.isCurrent else { return }
        self.values = [:]
        self.onSaved()
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        switch error.coreFailureKind {
        case .invalidInput, .missing, .denied:
          self.state = .editing
          self.issue = "Couldn’t save this key. Check its format, passphrase and linked credential."
          self.focus = mode == .importKey ? .privateKey : .name
          self.focusRevision += 1
        default:
          self.state = .uncertain
          self.values = [:]
          self.issue =
            "The save result could not be confirmed. Close this form and check SSH keys before trying again."
        }
      }
    }
  }
  public func revoke() {
    work.cancel()
    values = [:]
    issue = nil
    focus = nil
    importingFile = false
    confirmingDiscard = false
    state = .revoked
  }
}
