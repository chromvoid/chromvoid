import Foundation

@MainActor
public protocol StorageRestoreReview: AnyObject {
  var preview: AirRestorePreview { get }
  func commit() async throws
  func cancel()
  func close() async throws
}

/// Source authentication and the consuming transaction remain in Rust.
@MainActor
public final class StorageRestoreTransfer {
  private let client: RuntimeClient
  private var handle: AirStorageRestore?
  public let generation: UInt64

  init(client: RuntimeClient, handle: AirStorageRestore, generation: UInt64) {
    self.client = client
    self.handle = handle
    self.generation = generation
  }
  deinit { try? handle?.cancel() }

  func append(_ bytes: Data, artifact: AirRestoreArtifact) async throws {
    guard let handle else { throw BridgeError.InvalidRestoreState }
    let _: JSONNull = try await client.performExecution(phase: try phase(), generation: generation)
    { id, _ in
      try handle.beginAppend(requestId: id, artifact: artifact, bytes: bytes)
    }
  }

  func review(masterPassword: String) async throws -> any StorageRestoreReview {
    guard let handle else { throw BridgeError.InvalidRestoreState }
    let _: JSONNull = try await client.performExecution(phase: try phase(), generation: generation)
    { id, _ in
      try handle.beginReview(requestId: id, masterPassword: masterPassword)
    }
    return ReviewedStorageRestore(transfer: self, preview: try handle.preview())
  }

  fileprivate func commit() async throws {
    guard let handle else { throw BridgeError.InvalidRestoreState }
    // The envelope reports success/failure; preview carries the reviewed counts. No wire DTO copy.
    try await client.performStorageRestoreCommit(handle, generation: generation)
  }

  func cancel() { try? handle?.cancel() }

  func close() async throws {
    guard let handle else { return }
    defer { self.handle = nil }
    try await handle.cancelAndWait()
  }

  private func phase() throws -> AirPhase {
    let phase = try client.snapshot().phase
    guard phase == .locked || phase == .unlocked else { throw BridgeError.SessionRevoked }
    return phase
  }
}

@MainActor
private final class ReviewedStorageRestore: StorageRestoreReview {
  let preview: AirRestorePreview
  private let transfer: StorageRestoreTransfer
  init(transfer: StorageRestoreTransfer, preview: AirRestorePreview) {
    self.transfer = transfer
    self.preview = preview
  }
  func commit() async throws { try await transfer.commit() }
  func cancel() { transfer.cancel() }
  func close() async throws { try await transfer.close() }
}
