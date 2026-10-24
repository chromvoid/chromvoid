import ChromVoidBridge
import Foundation
import Observation

/// A transient metadata projection. Core alone authorizes and commits local deletion.
@MainActor
@Observable
public final class PasskeysModel: Identifiable {
  public enum State: Equatable { case loading, ready, deleting, failed, uncertain, revoked }
  public enum Notice: String {
    case deleted = "Passkey deleted from this vault."
    case missing = "This passkey is no longer in this vault."
    case uncertain = "Deletion could not be confirmed. Refresh the list before trying again."
  }

  public let id = UUID()
  public private(set) var state: State = .loading
  public private(set) var rows: [VaultPasskeySummary] = []
  public private(set) var query = ""
  public private(set) var selectedID: String?
  public private(set) var confirmingDelete = false
  public private(set) var notice: Notice?
  public var selected: VaultPasskeySummary? {
    rows.first { $0.credentialIDB64URL == selectedID }
  }
  public var matches: [VaultPasskeySummary] {
    let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return rows }
    return rows.filter {
      [$0.rpID, $0.rpName, $0.userName, $0.userDisplayName]
        .contains { $0.localizedStandardContains(query) }
    }
  }

  private let store: any PasskeyStore
  private let generation: UInt64
  @ObservationIgnored private var sequence: UInt64?
  private let work = ModelWork()
  private let deletion = ModelWork()

  public init(store: any PasskeyStore, generation: UInt64) {
    self.store = store
    self.generation = generation
  }

  public func search(_ value: String) {
    guard state != .revoked else { return }
    query = value
  }
  public func select(_ id: String) {
    guard state == .ready, rows.contains(where: { $0.credentialIDB64URL == id }) else { return }
    selectedID = id
    notice = nil
  }
  public func closeDetail() {
    selectedID = nil
    confirmingDelete = false
  }
  public func requestDelete() {
    guard state == .ready, selected != nil else { return }
    confirmingDelete = true
  }
  public func cancelDelete() { confirmingDelete = false }

  public func synchronize(sequence: UInt64) {
    guard state != .revoked, self.sequence != sequence else { return }
    self.sequence = sequence
    // An admitted mutation resolves through its own acknowledgement and subsequent refresh.
    if state != .deleting { reload() }
  }

  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked, state != .deleting else { return nil }
    rows = []
    closeDetail()
    state = .loading
    return work.start { [weak self, store, generation] run in
      do {
        let result = try await store.listPasskeys(generation: generation)
        guard let self, run.isCurrent else { return }
        self.rows = result.passkeys
        self.state = .ready
        if self.notice == .uncertain { self.notice = nil }
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
        } else {
          self.state = .failed
        }
      }
    }
  }

  @discardableResult
  public func confirmDelete() -> Task<Void, Never>? {
    guard state == .ready, confirmingDelete, let selectedID else { return nil }
    confirmingDelete = false
    state = .deleting
    notice = nil
    return deletion.start { [weak self, store, generation] run in
      do {
        let result = try await store.deletePasskey(
          VaultPasskeyDeleteRequest(credentialIDB64URL: selectedID), generation: generation)
        guard let self, run.isCurrent else { return }
        self.notice = result.deleted ? .deleted : .missing
        self.state = .ready
        // A successful acknowledgement still reloads the authoritative collection.
        await self.reload()?.value
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
        } else {
          self.rows = []
          self.closeDetail()
          self.notice = .uncertain
          self.state = .uncertain
        }
      }
    }
  }

  public func revoke() {
    work.cancel()
    deletion.cancel()
    rows = []
    query = ""
    closeDetail()
    notice = nil
    state = .revoked
  }
}
