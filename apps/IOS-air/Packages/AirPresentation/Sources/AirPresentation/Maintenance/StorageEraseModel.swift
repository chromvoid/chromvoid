import ChromVoidBridge
import Foundation
import Observation

public enum StorageEraseOutcome: Equatable {
  case completed, incomplete, unconfirmed
}

@MainActor
@Observable
public final class StorageEraseModel {
  public enum State: Equatable { case initial, reviewing, ready, committing, failed, revoked }
  public enum Issue: Equatable {
    case acknowledgementRequired, passwordRequired, invalidPassword, reviewFailed, reviewExpired
  }
  public private(set) var state: State = .initial
  public private(set) var password = ""
  public private(set) var acknowledged = false
  public private(set) var issue: Issue?
  public let generation: UInt64
  private let store: any StorageEraseStore
  private let onFinished: (StorageEraseOutcome) -> Void
  @ObservationIgnored private var review: (any StorageEraseReview)?
  private let work = ModelWork()

  public init(
    store: any StorageEraseStore, generation: UInt64,
    onFinished: @escaping (StorageEraseOutcome) -> Void
  ) {
    self.store = store
    self.generation = generation
    self.onFinished = onFinished
  }

  @discardableResult
  public func prepare() -> Task<Void, Never>? {
    guard state == .initial || state == .failed else { return nil }
    state = .reviewing
    issue = nil
    return work.start { [weak self, store, generation] run in
      do {
        let review = try await store.reviewStorageErase(generation: generation)
        guard let self, run.isCurrent, self.state == .reviewing else {
          review.cancel()
          return
        }
        self.review = review
        self.state = .ready
      } catch {
        guard let self, run.isCurrent else { return }
        self.state = .failed
        self.issue = .reviewFailed
      }
    }
  }

  public func changePassword(_ value: String) {
    guard state == .ready else { return }
    password = value
    issue = nil
  }
  public func acknowledge(_ value: Bool) {
    guard state == .ready else { return }
    acknowledged = value
    issue = nil
  }

  @discardableResult
  public func submit() -> Task<Void, Never>? {
    guard state == .ready, let review else { return nil }
    guard acknowledged else {
      issue = .acknowledgementRequired
      return nil
    }
    guard !password.isEmpty else {
      issue = .passwordRequired
      return nil
    }
    let password = password
    self.password = ""
    issue = nil
    state = .committing
    // The result belongs to the application even if revocation releases this screen.
    return work.start { [weak self, onFinished] run in
      do {
        try Task.checkCancellation()
        let receipt = try await review.commit(masterPassword: password)
        review.cancel()
        self?.revoke()
        switch receipt {
        case .completed: onFinished(.completed)
        case .incomplete: onFinished(.incomplete)
        }
      } catch {
        if error is StorageEraseCompletionUnknown {
          self?.revoke()
          onFinished(.unconfirmed)
          return
        }
        guard let self, run.isCurrent else { return }
        if error.coreFailure?.code == "INVALID_MASTER_PASSWORD" {
          self.state = .ready
          self.issue = .invalidPassword
        } else if Self.isRevocation(error) {
          self.revoke()
        } else {
          review.cancel()
          self.review = nil
          self.state = .failed
          self.acknowledged = false
          self.issue = .reviewExpired
        }
      }
    }
  }

  public func revoke() {
    state = .revoked
    password = ""
    acknowledged = false
    issue = nil
    work.cancel()
    review?.cancel()
    review = nil
  }

  private static func isRevocation(_ error: Error) -> Bool {
    if error is CancellationError { return true }
    switch error {
    case BridgeError.SessionRevoked, BridgeError.RequestCanceled: return true
    default: return false
    }
  }
}
