import Foundation

public struct OpenedDocument {
  public let nodeID: UInt64
  public let sourceRevision: UInt64
  public let name: String
  public let text: String
  public let mimeType: String?

  public init(
    nodeID: UInt64, sourceRevision: UInt64, name: String, text: String, mimeType: String? = nil
  ) {
    self.nodeID = nodeID
    self.sourceRevision = sourceRevision
    self.name = name
    self.text = text
    self.mimeType = mimeType
  }
}

public enum DocumentReadError: Error { case tooLarge, unsupportedText }

@MainActor
public protocol DocumentStore: AnyObject {
  var documentByteLimit: UInt64 { get }
  func readDocument(nodeID: UInt64, generation: UInt64) async throws -> OpenedDocument
  func resolveDocumentLink(
    nodeID: UInt64, path: String, kind: CatalogDocumentLinkKind, generation: UInt64
  )
    async throws -> CatalogDocumentLinkResponse
  func saveDocument(nodeID: UInt64, sourceRevision: UInt64, text: String, generation: UInt64)
    async throws -> CatalogFileReplaceResponse
}

extension RuntimeClient: DocumentStore {
  public var documentByteLimit: UInt64 { fileTransferLimits.documentBytes }

  public func resolveDocumentLink(
    nodeID: UInt64, path: String, kind: CatalogDocumentLinkKind, generation: UInt64
  ) async throws -> CatalogDocumentLinkResponse {
    guard let id = Int(exactly: nodeID) else { throw FileCatalogError.invalidPage }
    return try await perform(
      "catalog:document:resolve-link",
      data: CatalogDocumentLinkRequest(kind: kind, path: path, sourceNodeID: id),
      phase: .unlocked, generation: generation)
  }

  public func readDocument(nodeID: UInt64, generation: UInt64) async throws -> OpenedDocument {
    let reader = try beginFileRead(nodeID: nodeID, generation: generation)
    defer { try? reader.cancel() }
    var bytes = Data()
    defer { bytes.resetBytes(in: 0..<bytes.count) }
    while true {
      try Task.checkCancellation()
      let chunk = try await reader.read(
        offset: UInt64(bytes.count), length: fileTransferLimits.readChunkBytes)
      guard chunk.metadata.size <= documentByteLimit else { throw DocumentReadError.tooLarge }
      bytes.append(chunk.bytes)
      if bytes.count == chunk.metadata.size {
        guard let text = String(data: bytes, encoding: .utf8), !text.contains("\0") else {
          throw DocumentReadError.unsupportedText
        }
        return OpenedDocument(
          nodeID: nodeID, sourceRevision: UInt64(chunk.metadata.sourceRevision),
          name: chunk.metadata.name, text: text, mimeType: chunk.metadata.mimeType)
      }
      guard !chunk.bytes.isEmpty else { throw BridgeError.InvalidFileLength }
    }
  }
}
