import Foundation

/// Core owns the format and snapshot; the Apple consumer owns its selected destination.
@MainActor
public final class StorageBackupTransfer {
  private let client: RuntimeClient
  private var handle: AirStorageBackup?
  public let generation: UInt64

  init(client: RuntimeClient, handle: AirStorageBackup, generation: UInt64) {
    self.client = client
    self.handle = handle
    self.generation = generation
  }

  deinit { try? handle?.cancel() }

  public func artifacts() throws -> [AirBackupArtifact] {
    guard let handle else { throw BridgeError.InvalidBackupState }
    return try handle.artifacts()
  }

  /// Sequential reads for one artifact; an empty result is EOF. No full-file buffering.
  public func read(artifact: UInt32) async throws -> Data {
    guard let handle else { throw BridgeError.InvalidBackupState }
    do {
      let phase = try client.snapshot().phase
      guard phase == .locked || phase == .unlocked else { throw BridgeError.SessionRevoked }
      let _: JSONNull = try await client.performExecution(phase: phase, generation: generation) {
        id, _ in
        try handle.beginRead(requestId: id, artifact: artifact)
      }
      try Task.checkCancellation()
      return try handle.takeChunk()
    } catch {
      try? cancel()
      throw error
    }
  }

  public func cancel() throws {
    try handle?.cancel()
  }

  /// Await worker cleanup before starting another attempt, including after cancellation.
  public func close() async throws {
    guard let handle else { return }
    defer { self.handle = nil }
    try await handle.cancelAndWait()
  }
}
