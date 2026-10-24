import Foundation

@MainActor
public protocol StorageEraseStore: AnyObject {
  func reviewStorageErase(generation: UInt64) async throws -> any StorageEraseReview
}

@MainActor
public protocol StorageEraseReview: AnyObject {
  func commit(masterPassword: String) async throws -> AirEraseReceipt
  func cancel()
}

/// The worker could not be fenced and no actual completion receipt was available.
public struct StorageEraseCompletionUnknown: Error {
  public init() {}
}

extension RuntimeClient: StorageEraseStore {
  public func reviewStorageErase(generation: UInt64) async throws -> any StorageEraseReview {
    let handle = try beginStorageErase(generation: generation)
    do {
      let phase = try snapshot().phase
      guard phase == .locked || phase == .unlocked else { throw BridgeError.SessionRevoked }
      let _: JSONNull = try await performExecution(phase: phase, generation: generation) { id, _ in
        try handle.beginReview(requestId: id)
      }
      return ReviewedStorageErase(client: self, handle: handle, generation: generation)
    } catch {
      try? handle.cancel()
      throw error
    }
  }
}

@MainActor
private final class ReviewedStorageErase: StorageEraseReview {
  private let client: RuntimeClient
  private let handle: AirStorageErase
  private let generation: UInt64
  private var committing = false

  init(client: RuntimeClient, handle: AirStorageErase, generation: UInt64) {
    self.client = client
    self.handle = handle
    self.generation = generation
  }
  deinit { try? handle.cancel() }

  func commit(masterPassword: String) async throws -> AirEraseReceipt {
    // A duplicate caller must not cancel the first caller's admitted operation.
    guard !committing else { throw BridgeError.InvalidEraseState }
    committing = true
    defer { committing = false }
    do {
      let phase = try client.snapshot().phase
      guard phase == .locked || phase == .unlocked else { throw BridgeError.SessionRevoked }
      let _: JSONNull = try await client.performExecution(phase: phase, generation: generation) {
        id, _ in try handle.beginCommit(requestId: id, masterPassword: masterPassword)
      }
      guard let receipt = try handle.receipt() else { throw BridgeError.InvalidEraseState }
      return receipt
    } catch {
      // Only this pre-deletion denial preserves the reviewed confirmation for retry.
      if (error as? RPCFailure)?.code == "INVALID_MASTER_PASSWORD" { throw error }
      if let receipt = try? handle.receipt() { return receipt }
      do {
        if let receipt = try await handle.cancelAndWait() { return receipt }
      } catch {
        // Close may stop the worker after deletion; its published receipt still stands.
        if let receipt = try? handle.receipt() { return receipt }
        throw StorageEraseCompletionUnknown()
      }
      // A completed fence with no receipt does not establish a destructive attempt.
      throw error
    }
  }

  func cancel() { try? handle.cancel() }
}
