import Foundation

/// Exclusive, transient Core upload. Only a successful finish returns a durable catalog ID.
@MainActor
public final class FileWriteTransfer {
  private let client: RuntimeClient
  private var handle: AirFileWriter?
  public let generation: UInt64

  init(client: RuntimeClient, handle: AirFileWriter, generation: UInt64) {
    self.client = client
    self.handle = handle
    self.generation = generation
  }

  deinit { try? handle?.cancel() }

  /// Progress metadata contains a staging ID; do not persist it or use it as a route identity.
  public func append(_ chunk: Data) async throws -> UploadResponse {
    guard let handle else { throw BridgeError.InvalidFileWriteState }
    do {
      return try await client.performExecution(phase: .unlocked, generation: generation) { id, _ in
        try handle.beginAppend(requestId: id, chunk: chunk)
      }
    } catch {
      try? handle.cancel()
      throw error
    }
  }

  /// Cancellation during finish has an uncertain commit outcome; reconcile the catalog.
  public func finish() async throws -> UploadResponse {
    guard let handle else { throw BridgeError.InvalidFileWriteState }
    do {
      let result: UploadResponse = try await client.performExecution(
        phase: .unlocked, generation: generation
      ) { id, _ in
        try handle.beginFinish(requestId: id)
      }
      self.handle = nil
      return result
    } catch {
      try? handle.cancel()
      throw error
    }
  }

  /// Immediately prevents more work. Await close before starting the next file.
  public func cancel() throws { try handle?.cancel() }

  /// Cleanup is awaited even in a canceled Swift task. Release the Rust writer lease afterward.
  public func close() async throws {
    guard let handle else { return }
    defer { self.handle = nil }
    try await handle.cancelAndWait()
  }
}
