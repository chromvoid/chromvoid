import Foundation

extension RuntimeClient {
  /// The editor's transient UTF-8 draft enters the existing create-only Rust transaction.
  /// No previous document ID is accepted, and source text never enters the metadata RPC envelope.
  public func createNote(name: String, text: String, parent: String, generation: UInt64)
    async throws
    -> UploadResponse
  {
    try Task.checkCancellation()
    var bytes = Data(text.utf8)
    defer { bytes.resetBytes(in: 0..<bytes.count) }
    let writer = try beginFileWrite(
      AirFileWriteTarget(
        parentPath: parent, name: name, mimeType: "text/markdown",
        byteCount: UInt64(bytes.count)), generation: generation)
    do {
      let limit = Int(fileTransferLimits.writeChunkBytes)
      for offset in stride(from: 0, to: bytes.count, by: limit) {
        try Task.checkCancellation()
        var chunk = bytes.subdata(in: offset..<min(offset + limit, bytes.count))
        defer { chunk.resetBytes(in: 0..<chunk.count) }
        _ = try await writer.append(chunk)
      }
      try Task.checkCancellation()
      return try await writer.finish()
    } catch {
      try await writer.close()
      throw error
    }
  }
}
