import Foundation

public struct StorageBackupProgress: Sendable, Equatable {
  public let completedBytes: UInt64
  public let totalBytes: UInt64

  public init(completedBytes: UInt64, totalBytes: UInt64) {
    self.completedBytes = completedBytes
    self.totalBytes = totalBytes
  }
}

/// Cleanup failures identify the backup attempt for an actionable user message.
public struct StorageBackupCleanupFailure: Error {
  public let folderName: String
  public let cause: any Error
  public let cleanupError: any Error
}

@MainActor
public protocol StorageBackupStore: AnyObject {
  func saveStorageBackup(
    to directory: URL, masterPassword: String, generation: UInt64,
    progress: @escaping @MainActor (StorageBackupProgress) -> Void
  ) async throws -> URL
}

extension RuntimeClient: StorageBackupStore {
  public func saveStorageBackup(
    to directory: URL, masterPassword: String, generation: UInt64,
    progress: @escaping @MainActor (StorageBackupProgress) -> Void
  ) async throws -> URL {
    let destination = CoordinatedBackupDestination(directory: directory)
    registerStorageBackup(destination, generation: generation)
    return try await withTaskCancellationHandler {
      var activeTransfer: StorageBackupTransfer?
      do {
        let transfer = try await prepareStorageBackup(
          masterPassword: masterPassword, generation: generation)
        activeTransfer = transfer
        let artifacts = try transfer.artifacts()
        let total = try artifacts.reduce(UInt64(0)) { sum, artifact in
          let (next, overflow) = sum.addingReportingOverflow(artifact.byteCount)
          guard !overflow else { throw BridgeError.InvalidBackupState }
          return next
        }
        try Task.checkCancellation()
        try await destination.open()
        var completed: UInt64 = 0
        progress(StorageBackupProgress(completedBytes: completed, totalBytes: total))
        for (index, artifact) in artifacts.enumerated() {
          try Task.checkCancellation()
          try await destination.openArtifact(name: artifact.name, size: artifact.byteCount)
          while true {
            let bytes = try await transfer.read(artifact: UInt32(index))
            if bytes.isEmpty { break }
            try Task.checkCancellation()
            try await destination.append(bytes)
            completed += UInt64(bytes.count)
            progress(StorageBackupProgress(completedBytes: completed, totalBytes: total))
          }
          try await destination.finishArtifact()
        }
        try await transfer.close()
        activeTransfer = nil
        try Task.checkCancellation()
        let current = try snapshot()
        guard current.generation == generation, !current.cleanupPending,
          current.phase == .locked || current.phase == .unlocked
        else { throw BridgeError.SessionRevoked }
        let result = try await destination.publish()
        try Task.checkCancellation()
        guard try snapshot().generation == generation else { throw BridgeError.SessionRevoked }
        try await destination.close(remove: false)
        return result
      } catch {
        try? await activeTransfer?.close()
        do { try await destination.close(remove: true) } catch let cleanupError {
          throw StorageBackupCleanupFailure(
            folderName: destination.name, cause: error, cleanupError: cleanupError)
        }
        throw error
      }
    } onCancel: {
      destination.cancel()
    }
  }
}

final class WeakStorageBackupDestination {
  weak var value: CoordinatedBackupDestination?
  let generation: UInt64

  init(_ value: CoordinatedBackupDestination, generation: UInt64) {
    self.value = value
    self.generation = generation
  }
}
