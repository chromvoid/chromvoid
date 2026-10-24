import ChromVoidBridge
import Foundation
import Observation

@MainActor
@Observable
public final class StorageBackupModel: Identifiable {
  public enum State: Equatable { case editing, working, cancelling, completed, revoked }
  public enum Issue: Equatable {
    case directoryRequired, passwordRequired, reauthentication, failed
    case cleanupFailed(String)
  }
  public private(set) var state: State = .editing
  public private(set) var directory: URL?
  public private(set) var password = ""
  public private(set) var progress: StorageBackupProgress?
  public private(set) var savedDirectory: URL?
  public private(set) var issue: Issue?
  private let store: any StorageBackupStore
  public let generation: UInt64
  @ObservationIgnored private var work: Task<Void, Never>?

  public init(store: any StorageBackupStore, generation: UInt64) {
    self.store = store
    self.generation = generation
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
    state = .working
    let task = Task { [weak self, store, generation] in
      do {
        let saved = try await store.saveStorageBackup(
          to: directory, masterPassword: password, generation: generation,
          progress: { [weak self] update in
            guard let self, self.state == .working else { return }
            self.progress = update
          })
        guard let self, self.state != .revoked else { return }
        // A successful store result is an existing output, even if cancel raced completion.
        self.savedDirectory = saved
        self.state = .completed
        self.work = nil
      } catch {
        guard let self, self.state != .revoked else { return }
        self.work = nil
        self.progress = nil
        self.state = .editing
        if let failure = error as? StorageBackupCleanupFailure {
          self.issue = .cleanupFailed(failure.folderName)
        } else if error.isSessionRevoked {
          self.revoke()
        } else if Task.isCancelled || error is CancellationError {
          self.issue = nil
        } else if error.coreFailure?.code == "INVALID_MASTER_PASSWORD" {
          self.issue = .reauthentication
        } else {
          self.issue = .failed
        }
      }
    }
    work = task
    return task
  }

  public func cancel() {
    guard state == .working else { return }
    state = .cancelling
    work?.cancel()
  }

  public func revoke() {
    work?.cancel()
    work = nil
    password = ""
    directory = nil
    savedDirectory = nil
    progress = nil
    issue = nil
    state = .revoked
  }
}
