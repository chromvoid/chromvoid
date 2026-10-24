import Foundation

public struct StorageRestoreProgress: Sendable, Equatable {
  public let completedBytes: UInt64
  public let totalBytes: UInt64
  public init(completedBytes: UInt64, totalBytes: UInt64) {
    self.completedBytes = completedBytes
    self.totalBytes = totalBytes
  }
}

public struct StorageRestoreCleanupFailure: Error {
  public let cause: any Error
  public let cleanupError: any Error
}

@MainActor
public protocol StorageRestoreStore: AnyObject {
  func reviewStorageBackup(
    at directory: URL, masterPassword: String, generation: UInt64,
    progress: @escaping @MainActor (StorageRestoreProgress) -> Void
  ) async throws -> any StorageRestoreReview
}

extension RuntimeClient: StorageRestoreStore {
  public func reviewStorageBackup(
    at directory: URL, masterPassword: String, generation: UInt64,
    progress: @escaping @MainActor (StorageRestoreProgress) -> Void
  ) async throws -> any StorageRestoreReview {
    let source = CoordinatedRestoreSource(directory: directory)
    registerStorageRestore(source, generation: generation)
    return try await withTaskCancellationHandler {
      var transfer: StorageRestoreTransfer?
      do {
        try Task.checkCancellation()
        let limits = storageRestoreLimits
        let receiving = try beginStorageRestore(generation: generation)
        transfer = receiving
        let total = try await source.open(limits.artifacts)
        var completed: UInt64 = 0
        progress(StorageRestoreProgress(completedBytes: completed, totalBytes: total))
        for spec in limits.artifacts {
          while true {
            try Task.checkCancellation()
            guard let bytes = try await source.read(spec.artifact, maximum: limits.chunkBytes)
            else {
              break
            }
            // An empty present file must reach Core; only absence permits legacy fallback.
            try await receiving.append(bytes, artifact: spec.artifact)
            if bytes.isEmpty { break }
            completed += UInt64(bytes.count)
            progress(StorageRestoreProgress(completedBytes: completed, totalBytes: total))
          }
        }
        try await source.close()
        let review = try await receiving.review(masterPassword: masterPassword)
        try Task.checkCancellation()
        let current = try snapshot()
        guard current.generation == generation, !current.cleanupPending,
          current.phase == .locked || current.phase == .unlocked
        else { throw BridgeError.SessionRevoked }
        return review
      } catch {
        var cleanupError: Error?
        do { try await source.close() } catch { cleanupError = error }
        do { try await transfer?.close() } catch { cleanupError = cleanupError ?? error }
        if let cleanupError {
          throw StorageRestoreCleanupFailure(cause: error, cleanupError: cleanupError)
        }
        if let current = try? snapshot(), current.generation != generation {
          throw BridgeError.SessionRevoked
        }
        throw error
      }
    } onCancel: {
      source.cancel()
    }
  }
}

final class WeakStorageRestoreSource {
  weak var value: CoordinatedRestoreSource?
  let generation: UInt64
  init(_ value: CoordinatedRestoreSource, generation: UInt64) {
    self.value = value
    self.generation = generation
  }
}
