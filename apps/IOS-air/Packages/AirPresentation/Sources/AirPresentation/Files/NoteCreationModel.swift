import ChromVoidBridge
import Foundation
import Observation

@MainActor
@Observable
public final class NoteCreationModel: Identifiable {
  public enum State: Equatable { case editing, saving, uncertain, revoked }
  public let id = UUID()
  public private(set) var name = ""
  public private(set) var text = ""
  public private(set) var parent: String
  public private(set) var state: State = .editing
  public private(set) var issue: String?
  public private(set) var validationRevision = 0
  public private(set) var confirmingDiscard = false
  /// Anything typed is worth a question before it is thrown away.
  public var isDirty: Bool { !name.isEmpty || !text.isEmpty }
  private let store: any FileCatalogStore
  private let generation: UInt64
  private let onSaved: () -> Void
  private let work = ModelWork()
  public var busy: Bool { state == .saving }

  public init(
    store: any FileCatalogStore, parent: String, generation: UInt64, onSaved: @escaping () -> Void
  ) {
    self.store = store
    self.parent = parent
    self.generation = generation
    self.onSaved = onSaved
  }
  public func setName(_ value: String) {
    guard state == .editing, name != value else { return }
    name = value
    issue = nil
  }
  public func setText(_ value: String) {
    guard state == .editing else { return }
    text = value
  }
  /// Cancel and the swipe down go through here: a draft with anything in it asks first.
  public func requestDismiss() { confirmingDiscard = isDirty && state == .editing }
  public func cancelDiscard() { confirmingDiscard = false }
  @discardableResult
  public func save() -> Task<Void, Never>? {
    guard state == .editing else { return nil }
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      issue = "Enter a name."
      validationRevision += 1
      return nil
    }
    // A dot-name is saved but hidden by the catalog, so the note would vanish on save.
    guard !trimmed.hasPrefix(".") else {
      issue = "A note name cannot start with a dot."
      validationRevision += 1
      return nil
    }
    guard UInt64(text.utf8.count) <= store.documentByteLimit else {
      issue = "This note is too large to save. Shorten it and try again."
      validationRevision += 1
      return nil
    }
    let filename =
      trimmed.lowercased().hasSuffix(".md") || trimmed.lowercased().hasSuffix(".markdown")
      ? trimmed : trimmed + ".md"
    state = .saving
    issue = nil
    return work.start { [weak self, store, generation, parent, text] run in
      do {
        try Task.checkCancellation()
        let saved = try await store.createNote(
          name: filename, text: text, parent: parent, generation: generation)
        guard let self, run.isCurrent else { return }
        guard saved.completed else { throw BridgeError.InvalidFileWriteState }
        self.revoke()
        self.onSaved()
      } catch {
        guard let self, run.isCurrent else { return }
        if let failure = error as? RPCFailure,
          [
            "NAME_EXIST", "EMPTY_PAYLOAD", "INVALID_NAME", "NODE_NOT_FOUND", "PATH_NOT_FOUND",
            "SYSTEM_SHARD_DENIED",
          ].contains(failure.code ?? "")
        {
          self.state = .editing
          self.issue = FilesModel.message(error)
          self.validationRevision += 1
        } else {
          self.state = .uncertain
          self.issue =
            "The note could not be confirmed. Close this draft and check the folder before creating it again."
        }
      }
    }
  }
  public func revoke() {
    work.cancel()
    state = .revoked
    name = ""
    text = ""
    parent = ""
    issue = nil
    confirmingDiscard = false
  }
}
