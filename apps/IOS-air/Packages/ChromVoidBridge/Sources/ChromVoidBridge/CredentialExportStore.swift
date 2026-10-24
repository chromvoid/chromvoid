import Foundation

@MainActor
public protocol CredentialExportStore: AnyObject {
  /// Explicit plaintext export for a transient native document handoff, never an app-owned cache.
  func exportCredentialDocument(generation: UInt64) async throws -> Data
}

enum CredentialExportBytes {
  static func read(_ handle: AirExport) async throws -> Data {
    let task = Task.detached {
      let expected = try handle.byteCount()
      guard let size = Int(exactly: expected) else { throw BridgeError.InvalidExportState }
      var data = Data()
      data.reserveCapacity(size)
      while true {
        try Task.checkCancellation()
        let chunk = try handle.readChunk()
        if chunk.isEmpty { break }
        data.append(chunk)
      }
      try Task.checkCancellation()
      guard data.count == size else { throw BridgeError.InvalidExportState }
      return data
    }
    return try await withTaskCancellationHandler {
      try await task.value
    } onCancel: {
      task.cancel()
      try? handle.cancel()
    }
  }
}
