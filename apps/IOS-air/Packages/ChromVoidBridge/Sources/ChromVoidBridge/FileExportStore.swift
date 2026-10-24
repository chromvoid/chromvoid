import Foundation

extension RuntimeClient {
  /// Call only after the user requests an external copy, never for in-app document preview.
  public func prepareFileExport(
    id: UInt64, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> FileExportCopy {
    let reader = try beginFileRead(nodeID: id, generation: generation)
    defer { try? reader.cancel() }
    let copy = FileExportCopy(generation: generation)
    registerFileExport(copy)
    do {
      var offset: UInt64 = 0
      var metadata: SourceMetadataResponse?
      while true {
        try Task.checkCancellation()
        let chunk = try await reader.read(offset: offset, length: fileTransferLimits.readChunkBytes)
        var bytes = chunk.bytes
        defer { bytes.resetBytes(in: 0..<bytes.count) }
        if metadata == nil {
          metadata = chunk.metadata
          try await copy.open(name: chunk.metadata.name)
          progress(0, UInt64(chunk.metadata.size))
        }
        try Task.checkCancellation()
        if bytes.isEmpty { break }
        try await copy.append(bytes)
        offset += UInt64(bytes.count)
        progress(offset, UInt64(chunk.metadata.size))
      }
      guard let metadata, offset == UInt64(metadata.size) else {
        throw BridgeError.InvalidFileReadState
      }
      try await copy.finish(metadata: metadata)
      try Task.checkCancellation()
      let current = try snapshot()
      guard current.phase == .unlocked, current.generation == generation, !current.cleanupPending
      else { throw BridgeError.SessionRevoked }
      return copy
    } catch {
      try await copy.close()
      throw error
    }
  }
}
