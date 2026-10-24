import ChromVoidBridge
import Foundation
import Observation

@MainActor
@Observable
public final class StorageRestoreModel: Identifiable {
  public enum State: Equatable {
    case editing, reviewing, review, cancelling, committing, completed, uncertain, revoked
  }
  public enum Issue: Equatable {
    case directoryRequired, passwordRequired, invalidBackup, targetNotEmpty, failed, cleanupFailed
  }
  public private(set) var state: State = .editing
  public private(set) var directory: URL?
  public private(set) var password = ""
  public private(set) var progress: StorageRestoreProgress?
  public private(set) var preview: AirRestorePreview?
  public private(set) var issue: Issue?
  private let store: any StorageRestoreStore
  public let generation: UInt64
  private let onRestored: () -> Void
  @ObservationIgnored private var reviewed: (any StorageRestoreReview)?
  @ObservationIgnored private var work: Task<Void, Never>?

  public init(
    store: any StorageRestoreStore, generation: UInt64, onRestored: @escaping () -> Void
  ) {
    self.store = store
    self.generation = generation
    self.onRestored = onRestored
  }
  deinit { work?.cancel() }

  public func selectDirectory(_ directory: URL) {
    guard state == .editing else { return }
    self.directory = directory
    issue = nil
  }

  public func changePassword(_ password: String) {
    guard state == .editing else { return }
    self.password = password
    issue = nil
  }

  @discardableResult
  public func submit() -> Task<Void, Never>? {
    guard state == .editing else { return nil }
    guard let directory else {
      issue = .directoryRequired
      return nil
    }
    guard !password.isEmpty else {
      issue = .passwordRequired
      return nil
    }
    let password = password
    self.password = ""
    issue = nil
    progress = nil
    state = .reviewing
    let task = Task { [weak self, store, generation] in
      do {
        let review = try await store.reviewStorageBackup(
          at: directory, masterPassword: password, generation: generation,
          progress: { [weak self] update in
            guard let self, self.state == .reviewing else { return }
            self.progress = update
          })
        guard let self, self.state == .reviewing, !Task.isCancelled else {
          // A late successful review still owns Rust resources and must be released.
          review.cancel()
          var cleanupFailed = false
          do { try await review.close() } catch { cleanupFailed = true }
          self?.finishCancelledReview()
          if cleanupFailed, self?.state != .revoked { self?.issue = .cleanupFailed }
          return
        }
        self.reviewed = review
        self.preview = review.preview
        self.directory = nil
        self.progress = nil
        self.state = .review
        self.work = nil
      } catch {
        guard let self, self.state != .revoked else { return }
        self.work = nil
        self.progress = nil
        self.state = .editing
        if error is StorageRestoreCleanupFailure {
          self.issue = .cleanupFailed
        } else if error.isSessionRevoked {
          self.revoke()
        } else if Task.isCancelled || error is CancellationError {
          self.issue = nil
        } else {
          switch error.coreFailure?.code {
          case "INVALID_BACKUP": self.issue = .invalidBackup
          case "STORAGE_NOT_BLANK": self.issue = .targetNotEmpty
          default: self.issue = .failed
          }
        }
      }
    }
    work = task
    return task
  }

  /// Only an explicit action on the reviewed summary can consume the Rust transaction.
  @discardableResult
  public func confirmRestore() -> Task<Void, Never>? {
    guard state == .review, let reviewed else { return nil }
    state = .committing
    let task = Task { [weak self] in
      var committed = false
      var failure: Error?
      do {
        try await reviewed.commit()
        committed = true
      } catch { failure = error }
      var cleanupFailed = false
      do { try await reviewed.close() } catch { cleanupFailed = true }
      guard let self, self.state != .revoked else { return }
      self.reviewed = nil
      self.work = nil
      self.preview = nil
      if committed {
        self.state = .completed
        self.issue = cleanupFailed ? .cleanupFailed : nil
        self.onRestored()
      } else if failure?.isSessionRevoked == true {
        self.revoke()
      } else {
        // Never turn an unknown write outcome into a retry button.
        self.state = .uncertain
        self.issue = cleanupFailed ? .cleanupFailed : nil
      }
    }
    work = task
    return task
  }

  @discardableResult
  public func cancel() -> Task<Void, Never>? {
    if state == .reviewing {
      state = .cancelling
      work?.cancel()
      return work
    }
    guard state == .review, let reviewed else { return nil }
    state = .cancelling
    preview = nil
    reviewed.cancel()
    let task = Task { [weak self] in
      var cleanupFailed = false
      do { try await reviewed.close() } catch { cleanupFailed = true }
      guard let self, self.state != .revoked else { return }
      self.reviewed = nil
      self.finishCancelledReview()
      self.issue = cleanupFailed ? .cleanupFailed : nil
    }
    work = task
    return task
  }

  public func revoke() {
    state = .revoked
    work?.cancel()
    work = nil
    reviewed?.cancel()
    reviewed = nil
    password = ""
    directory = nil
    progress = nil
    preview = nil
    issue = nil
  }

  private func finishCancelledReview() {
    guard state == .cancelling else { return }
    work = nil
    state = .editing
    progress = nil
    issue = nil
  }
}
