import Foundation

/// Bounded file transfers and document saves.
extension RuntimeClient {
  public var fileTransferLimits: AirFileLimits { runtime.fileTransferLimits() }

  /// Uses the revision captured while reading, never a refreshed revision that could hide a conflict.
  public func saveDocument(
    nodeID: UInt64, sourceRevision: UInt64, text: String, generation: UInt64
  ) async throws -> CatalogFileReplaceResponse {
    try Task.checkCancellation()
    guard text.utf8.count <= fileTransferLimits.documentBytes else {
      throw BridgeError.InvalidFileLength
    }
    var bytes = Data(text.utf8)
    defer { bytes.resetBytes(in: 0..<bytes.count) }
    return try await performExecution(phase: .unlocked, generation: generation) { id, _ in
      try runtime.beginDocumentSave(
        requestId: id, generation: generation, nodeId: nodeID,
        expectedSourceRevision: sourceRevision, bytes: bytes)
    }
  }

  public func beginFileRead(nodeID: UInt64, generation: UInt64) throws -> FileReadTransfer {
    try Task.checkCancellation()
    let handle = try runtime.beginFileReader(generation: generation, nodeId: nodeID)
    return FileReadTransfer(client: self, handle: handle, generation: generation)
  }

  public func beginFileWrite(_ target: AirFileWriteTarget, generation: UInt64) throws
    -> FileWriteTransfer
  {
    try Task.checkCancellation()
    let handle = try runtime.beginFileWriter(generation: generation, target: target)
    return FileWriteTransfer(client: self, handle: handle, generation: generation)
  }

  func registerFileExport(_ copy: FileExportCopy) {
    fileExports.removeAll { $0.value == nil }
    fileExports.append(WeakFileExportCopy(copy))
  }

  func revokeFileExports() {
    for copy in fileExports { copy.value?.revoke() }
    fileExports = []
  }
}
