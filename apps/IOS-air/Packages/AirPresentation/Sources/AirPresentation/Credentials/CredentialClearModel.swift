import ChromVoidBridge
import Foundation
import Observation

/// Explicit credential-domain replacement; an unconfirmed mutation is never retried here.
@Observable
@MainActor
public final class CredentialClearModel: Identifiable {
  public enum State: Equatable {
    case ready, confirming, clearing, finished, denied, uncertain, revoked
  }
  public let id = UUID()
  public private(set) var state: State = .ready
  private let store: any CredentialMaintenanceStore
  private let clipboard: any CredentialClipboard
  private let generation: UInt64
  private let onCleared: () -> Void
  private let work = ModelWork()

  public init(
    store: any CredentialMaintenanceStore, generation: UInt64,
    clipboard: any CredentialClipboard, onCleared: @escaping () -> Void
  ) {
    self.store = store
    self.generation = generation
    self.clipboard = clipboard
    self.onCleared = onCleared
  }
  public func requestClear() {
    if state == .ready { state = .confirming }
  }
  public func cancelClear() {
    if state == .confirming { state = .ready }
  }
  @discardableResult
  public func confirmClear() -> Task<Void, Never>? {
    guard state == .confirming else { return nil }
    state = .clearing
    return work.start { [weak self, store, generation] run in
      do {
        try await store.clearCredentials(generation: generation)
        guard let self, run.isCurrent, self.state == .clearing else { return }
        self.clipboard.clearOwned()
        self.state = .finished
        self.onCleared()
      } catch {
        guard let self, run.isCurrent, self.state == .clearing else { return }
        if error.isSessionRevoked {
          self.revoke()
        } else {
          self.state = error.coreFailureKind == .denied ? .denied : .uncertain
        }
      }
    }
  }
  public func revoke() {
    state = .revoked
    work.cancel()
  }
}
