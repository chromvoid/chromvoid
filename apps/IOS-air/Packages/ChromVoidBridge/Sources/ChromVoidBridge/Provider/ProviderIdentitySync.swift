import Foundation

public enum ProviderIdentityState: Equatable, Sendable {
  case unavailable, disabled, updating, cleared
  case synchronized(Int)
  case failed
}

public enum ProviderAccessState: Equatable, Sendable {
  case unknown, authorized, unavailable
}

/// Serializes noncancelable Apple store writes. Revocation supersedes loading and
/// queues clear behind an already-submitted save, so a late save cannot win last.
@MainActor
final class ProviderIdentitySync {
  private enum Update {
    case replace([AirPasswordIdentity], UUID)
    case clear
  }

  private let store: any ProviderIdentityStore
  private var generation = UUID()
  private var loading: Task<Void, Never>?
  private var writing: Task<Void, Never>?
  private var pending: Update?
  private var clearPending = false
  private(set) var state = ProviderIdentityState.updating
  private(set) var access = ProviderAccessState.unknown

  init(store: any ProviderIdentityStore) { self.store = store }

  @discardableResult
  func refresh(_ load: @escaping @MainActor () async throws -> [AirPasswordIdentity]) -> Task<
    Void, Never
  > {
    generation = UUID()
    let generation = generation
    loading?.cancel()
    state = .updating
    access = .unknown
    let task = Task { [weak self] in
      do {
        let identities = try await load()
        try Task.checkCancellation()
        guard let self, self.generation == generation else { return }
        self.access = .authorized
        self.enqueue(.replace(identities, generation))
      } catch {
        guard let self, self.generation == generation, !Task.isCancelled else { return }
        self.access = .unavailable
        self.enqueue(.clear)
      }
    }
    loading = task
    return task
  }

  func clear() {
    access = .unknown
    generation = UUID()
    loading?.cancel()
    loading = nil
    enqueue(.clear)
  }

  /// Waits for admitted work; used by explicit setup refresh and lifecycle verification.
  func settled() async {
    var observed: UUID
    repeat {
      observed = generation
      await loading?.value
      await writing?.value
    } while observed != generation
  }

  func systemEnabled() async -> Bool { await store.isEnabled() }

  private func enqueue(_ update: Update) {
    if case .clear = update {
      clearPending = true
      pending = nil
    } else {
      pending = update
    }
    state = .updating
    guard writing == nil else { return }
    writing = Task { [self] in
      while clearPending || pending != nil {
        let update: Update
        if clearPending {
          clearPending = false
          update = .clear
        } else if let next = pending {
          pending = nil
          update = next
        } else {
          break
        }
        let generation = generation
        let enabled = await store.isEnabled()
        if !enabled {
          if self.generation == generation { state = .disabled }
          continue
        }
        do {
          switch update {
          case .replace(let identities, let expected):
            guard expected == self.generation else { continue }
            try await store.replace(identities)
            if expected == self.generation { state = .synchronized(identities.count) }
          case .clear:
            try await store.removeAll()
            if generation == self.generation { state = .cleared }
          }
        } catch {
          // A failed replacement cannot leave an older credential index advertised.
          if case .replace = update { try? await store.removeAll() }
          if generation == self.generation { state = .failed }
        }
      }
      writing = nil
    }
  }
}
