import Foundation

/// Transient Rust-owned credential import input. Swift keeps a revocable handle, never a document model.
@MainActor
public final class CredentialImportTransfer {
  private let client: RuntimeClient
  private var handle: AirImport?
  public let generation: UInt64

  init(client: RuntimeClient, handle: AirImport, generation: UInt64) {
    self.client = client
    self.handle = handle
    self.generation = generation
  }

  @discardableResult
  public func append(_ chunk: Data) throws -> UInt64 {
    guard let handle else { throw BridgeError.InvalidImportState }
    do {
      try Task.checkCancellation()
      return try handle.append(chunk: chunk)
    } catch {
      try? cancel()
      throw error
    }
  }

  public func review(sourcePassword: String? = nil) async throws -> PassmanagerRootImportPreview {
    guard let handle else { throw BridgeError.InvalidImportState }
    do {
      return try await client.performExecution(phase: .unlocked, generation: generation) { id, _ in
        try handle.beginReview(requestId: id, sourcePassword: sourcePassword)
      }
    } catch {
      try? cancel()
      throw error
    }
  }

  public func commit() async throws {
    guard let handle else { throw BridgeError.InvalidImportState }
    defer { try? cancel() }
    let _: JSONNull = try await client.performExecution(phase: .unlocked, generation: generation) {
      id, _ in
      try handle.beginCommit(requestId: id)
    }
  }

  public func cancel() throws {
    defer { handle = nil }
    try handle?.cancel()
  }
}
