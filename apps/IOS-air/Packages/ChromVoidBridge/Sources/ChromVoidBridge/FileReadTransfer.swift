import Foundation

/// One bounded plaintext chunk. The caller must release it after consumption and on revoke.
public struct FileReadChunk {
  public let metadata: SourceMetadataResponse
  public var bytes: Data

  public init(metadata: SourceMetadataResponse, bytes: Data) {
    self.metadata = metadata
    self.bytes = bytes
  }
}

/// Positioned reads pin a Core source revision. Reopen after a source-changed error.
@MainActor
public final class FileReadTransfer: FileReading {
  private let client: RuntimeClient
  private var handle: AirFileReader?
  public let generation: UInt64
  public var maximumChunkBytes: UInt64 { client.fileTransferLimits.readChunkBytes }

  init(client: RuntimeClient, handle: AirFileReader, generation: UInt64) {
    self.client = client
    self.handle = handle
    self.generation = generation
  }

  deinit { try? handle?.cancel() }

  public func read(offset: UInt64, length: UInt64) async throws -> FileReadChunk {
    guard let handle else { throw BridgeError.InvalidFileReadState }
    do {
      let metadata: SourceMetadataResponse = try await client.performExecution(
        phase: .unlocked, generation: generation
      ) { id, _ in
        try handle.beginRead(requestId: id, offset: offset, length: length)
      }
      try Task.checkCancellation()
      // takeChunk checks Rust authority again; no suspension between consume and return.
      return FileReadChunk(metadata: metadata, bytes: try handle.takeChunk())
    } catch {
      try? cancel()
      throw error
    }
  }

  public func cancel() throws {
    defer { handle = nil }
    try handle?.cancel()
  }
}
