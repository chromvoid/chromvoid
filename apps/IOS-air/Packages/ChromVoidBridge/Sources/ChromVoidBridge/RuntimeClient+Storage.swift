import Foundation

/// Storage erase, backup and restore transfers.
extension RuntimeClient {
  public var storageRestoreLimits: AirRestoreLimits { runtime.storageRestoreLimits() }

  func beginStorageErase(generation: UInt64) throws -> AirStorageErase {
    try Task.checkCancellation()
    return try runtime.beginStorageErase(generation: generation)
  }

  func beginStorageRestore(generation: UInt64) throws -> StorageRestoreTransfer {
    try Task.checkCancellation()
    let handle = try runtime.beginStorageRestore(generation: generation)
    return StorageRestoreTransfer(client: self, handle: handle, generation: generation)
  }

  func performStorageRestoreCommit(_ handle: AirStorageRestore, generation: UInt64) async throws {
    let phase = try snapshot().phase
    guard phase == .locked || phase == .unlocked else { throw BridgeError.SessionRevoked }
    let _: EmptyResult = try await performExecution(phase: phase, generation: generation) { id, _ in
      try handle.beginCommit(requestId: id)
    }
  }

  public func prepareStorageBackup(masterPassword: String, generation: UInt64) async throws
    -> StorageBackupTransfer
  {
    try Task.checkCancellation()
    let phase = try snapshot().phase
    guard phase == .locked || phase == .unlocked else { throw BridgeError.SessionRevoked }
    let handle = try runtime.beginStorageBackup(generation: generation)
    do {
      let _: JSONNull = try await performExecution(phase: phase, generation: generation) { id, _ in
        try handle.beginPrepare(requestId: id, masterPassword: masterPassword)
      }
      try Task.checkCancellation()
      return StorageBackupTransfer(client: self, handle: handle, generation: generation)
    } catch {
      try? await handle.cancelAndWait()
      throw error
    }
  }

  func registerStorageRestore(_ source: CoordinatedRestoreSource, generation: UInt64) {
    storageRestores.removeAll { $0.value == nil }
    storageRestores.append(WeakStorageRestoreSource(source, generation: generation))
  }

  func revokeStorageRestores() {
    for source in storageRestores { source.value?.cancel() }
    storageRestores = []
  }

  func registerStorageBackup(_ destination: CoordinatedBackupDestination, generation: UInt64) {
    storageBackups.removeAll { $0.value == nil }
    storageBackups.append(WeakStorageBackupDestination(destination, generation: generation))
  }

  func revokeStorageBackups() {
    for backup in storageBackups { backup.value?.cancel() }
    storageBackups = []
  }
}
