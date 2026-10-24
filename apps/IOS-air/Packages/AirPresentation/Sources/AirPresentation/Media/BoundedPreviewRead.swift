import ChromVoidBridge
import Foundation

enum BoundedPreviewReadError: Error { case tooLarge, incomplete, sourceChanged }

struct BoundedPreviewSource {
  var data: Data
  let metadata: SourceMetadataResponse
}

/// Full-body Apple decoders share one bounded read. The caller owns reader cancellation.
@MainActor
enum BoundedPreviewRead {
  static func read(_ reader: any FileReading, maximumBytes: Int) async throws -> Data {
    try await readSource(reader, maximumBytes: maximumBytes).data
  }

  /// `firstChunk` receives the file head once, before the rest streams in.
  static func readSource(
    _ reader: any FileReading, maximumBytes: Int, firstChunk: ((Data) -> Void)? = nil
  ) async throws -> BoundedPreviewSource {
    var data = Data()
    var source: SourceMetadataResponse?
    do {
      while true {
        var chunk = try await reader.read(
          offset: UInt64(data.count), length: reader.maximumChunkBytes)
        defer { chunk.bytes.resetBytes(in: 0..<chunk.bytes.count) }
        try Task.checkCancellation()
        if let source,
          source.nodeID != chunk.metadata.nodeID
            || source.sourceRevision != chunk.metadata.sourceRevision
            || source.size != chunk.metadata.size
        {
          throw BoundedPreviewReadError.sourceChanged
        }
        source = chunk.metadata
        guard let size = Int(exactly: chunk.metadata.size), size <= maximumBytes else {
          throw BoundedPreviewReadError.tooLarge
        }
        guard size >= data.count, chunk.bytes.count <= size - data.count else {
          throw BoundedPreviewReadError.incomplete
        }
        data.append(chunk.bytes)
        if data.count == chunk.bytes.count, data.count < size { firstChunk?(data) }
        if data.count == size { return BoundedPreviewSource(data: data, metadata: chunk.metadata) }
        if chunk.bytes.isEmpty { throw BoundedPreviewReadError.incomplete }
      }
    } catch {
      data.resetBytes(in: 0..<data.count)
      throw error
    }
  }
}
