import ChromVoidBridge
import Foundation

enum MediaReadError: Error { case invalidRange, incomplete, sourceChanged, revoked }

/// Each seek gets a revocable Rust reader; every chunk must belong to the initially opened revision.
@MainActor
final class MediaByteSource {
  private(set) var metadata: SourceMetadataResponse?
  private let store: any FileReadStore
  private let nodeID: UInt64
  private let generation: UInt64
  private var readers: [UUID: any FileReading] = [:]

  private init(
    store: any FileReadStore, nodeID: UInt64, generation: UInt64, metadata: SourceMetadataResponse
  ) {
    self.store = store
    self.nodeID = nodeID
    self.generation = generation
    self.metadata = metadata
  }

  static func open(store: any FileReadStore, nodeID: UInt64, generation: UInt64) async throws
    -> MediaByteSource
  {
    let reader = try store.openFileReader(nodeID: nodeID, generation: generation)
    defer { try? reader.cancel() }
    var probe = try await reader.read(offset: 0, length: 1)
    defer { probe.bytes.resetBytes(in: 0..<probe.bytes.count) }
    try Task.checkCancellation()
    guard probe.metadata.size > 0, UInt64(exactly: probe.metadata.nodeID) == nodeID else {
      throw MediaReadError.incomplete
    }
    return MediaByteSource(
      store: store, nodeID: nodeID, generation: generation, metadata: probe.metadata)
  }

  func read(id: UUID = UUID(), offset: UInt64, length: UInt64, receive: (Data) -> Void) async throws
  {
    guard let metadata else { throw MediaReadError.revoked }
    guard let size = UInt64(exactly: metadata.size), offset <= size else {
      throw MediaReadError.invalidRange
    }
    let end = offset + min(length, size - offset)
    guard offset < end else { return }
    try Task.checkCancellation()
    let reader = try store.openFileReader(nodeID: nodeID, generation: generation)
    readers[id] = reader
    defer {
      try? reader.cancel()
      readers.removeValue(forKey: id)
    }
    var position = offset
    while position < end {
      var chunk = try await reader.read(
        offset: position, length: min(reader.maximumChunkBytes, end - position))
      defer { chunk.bytes.resetBytes(in: 0..<chunk.bytes.count) }
      try Task.checkCancellation()
      guard self.metadata != nil else { throw MediaReadError.revoked }
      guard chunk.metadata.nodeID == metadata.nodeID,
        chunk.metadata.sourceRevision == metadata.sourceRevision,
        chunk.metadata.size == metadata.size
      else { throw MediaReadError.sourceChanged }
      guard !chunk.bytes.isEmpty, chunk.bytes.count <= end - position else {
        throw MediaReadError.incomplete
      }
      receive(chunk.bytes)
      position += UInt64(chunk.bytes.count)
    }
  }

  func cancelRead(id: UUID) { try? readers[id]?.cancel() }

  private func cancelReads() { for reader in readers.values { try? reader.cancel() } }

  func revoke() {
    cancelReads()
    readers.removeAll()
    metadata = nil
  }
}
