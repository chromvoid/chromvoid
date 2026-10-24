import Foundation

/// A revision-pinned Rust reader. Consumers release each chunk after use.
@MainActor
public protocol FileReading: AnyObject {
  var maximumChunkBytes: UInt64 { get }
  func read(offset: UInt64, length: UInt64) async throws -> FileReadChunk
  func cancel() throws
}

@MainActor
public protocol FileReadStore: AnyObject {
  func openFileReader(nodeID: UInt64, generation: UInt64) throws -> any FileReading
}

extension RuntimeClient: FileReadStore {
  public func openFileReader(nodeID: UInt64, generation: UInt64) throws -> any FileReading {
    try beginFileRead(nodeID: nodeID, generation: generation)
  }
}
