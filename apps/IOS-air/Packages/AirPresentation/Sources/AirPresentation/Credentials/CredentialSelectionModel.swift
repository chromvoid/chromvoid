import ChromVoidBridge
import Foundation
import Observation

/// One explicit batch of independent Core deletions, with a result for every selected entry.
@Observable
@MainActor
public final class CredentialSelectionModel: Identifiable {
  public enum State: Equatable { case selecting, confirming, deleting, finished, revoked }
  public enum Outcome: Equatable {
    case deleted, absent, denied, unconfirmed, notAttempted
    public var label: String {
      switch self {
      case .deleted: "Deleted"
      case .absent: "Already absent"
      case .denied: "Not deleted: access denied"
      case .unconfirmed: "Deletion could not be confirmed"
      case .notAttempted: "Not attempted"
      }
    }
  }
  public struct Result: Identifiable {
    public let entry: CredentialSummary
    public let outcome: Outcome
    public var id: String { entry.id }
  }
  public let id = UUID()
  public private(set) var state: State = .selecting
  public private(set) var chosen: [CredentialSummary] = []
  public private(set) var results: [Result] = []
  public var deletedCount: Int { results.filter { $0.outcome == .deleted }.count }
  public var needsCheck: Bool { results.contains { $0.outcome == .unconfirmed } }
  private let store: any CredentialStore
  private let clipboard: any CredentialClipboard
  private let generation: UInt64
  private let work = ModelWork()

  public init(store: any CredentialStore, generation: UInt64, clipboard: any CredentialClipboard) {
    self.store = store
    self.generation = generation
    self.clipboard = clipboard
  }
  public func contains(_ id: String) -> Bool { chosen.contains { $0.id == id } }
  public func canSelect(_ entry: CredentialSummary) -> Bool {
    state == .selecting && ["login", "payment_card"].contains(entry.entryType)
  }
  public func toggle(_ entry: CredentialSummary) {
    guard canSelect(entry) else { return }
    if contains(entry.id) {
      chosen.removeAll { $0.id == entry.id }
    } else {
      chosen.append(entry)
    }
  }
  public func requestDeletion() {
    if state == .selecting && !chosen.isEmpty { state = .confirming }
  }
  public func cancelDeletion() {
    if state == .confirming { state = .selecting }
  }
  @discardableResult
  public func confirmDeletion() -> Task<Void, Never>? {
    guard state == .confirming else { return nil }
    state = .deleting
    let entries = chosen
    return work.start { [weak self, store, generation, clipboard] run in
      for (index, entry) in entries.enumerated() {
        guard run.isCurrent, self?.state == .deleting else { return }
        let outcome: Outcome
        do {
          try await store.deleteCredential(id: entry.id, generation: generation)
          outcome = .deleted
        } catch {
          if error.isSessionRevoked {
            self?.revoke()
            return
          }
          switch error.coreFailureKind {
          case .missing: outcome = .absent
          case .denied: outcome = .denied
          default: outcome = .unconfirmed
          }
        }
        guard let self, run.isCurrent, self.state == .deleting else { return }
        if outcome == .deleted { clipboard.clearOwned() }
        self.results.append(Result(entry: entry, outcome: outcome))
        if outcome == .unconfirmed {
          self.results.append(
            contentsOf: entries.dropFirst(index + 1).map {
              Result(entry: $0, outcome: .notAttempted)
            })
          break
        }
      }
      guard let self, run.isCurrent, self.state == .deleting else { return }
      self.state = .finished
    }
  }
  public func revoke() {
    state = .revoked
    work.cancel()
    chosen = []
    results = []
  }
}
