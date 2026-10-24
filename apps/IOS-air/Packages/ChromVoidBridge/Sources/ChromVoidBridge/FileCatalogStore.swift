import Foundation

public enum FileCatalogError: Error { case invalidPage }

@MainActor
public protocol FileCatalogStore: DocumentStore, FileReadStore {
  func filePage(_ request: CatalogFolderPageRequest, generation: UInt64) async throws
    -> CatalogFolderPageResponse
  func createFolder(name: String, parent: String, generation: UInt64) async throws
  func createNote(name: String, text: String, parent: String, generation: UInt64) async throws
    -> UploadResponse
  func renameFile(id: UInt64, name: String, generation: UInt64) async throws
  func moveFile(id: UInt64, parent: String, generation: UInt64) async throws
  func deleteFile(id: UInt64, generation: UInt64) async throws
  func fileInfo(id: UInt64, generation: UInt64) async throws -> SourceMetadataResponse
  func prepareFileExport(
    id: UInt64, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> FileExportCopy
}

extension RuntimeClient: FileCatalogStore {
  public func filePage(_ request: CatalogFolderPageRequest, generation: UInt64) async throws
    -> CatalogFolderPageResponse
  {
    try await perform(
      "catalog:folder:list", data: request, phase: .unlocked, generation: generation)
  }

  public func createFolder(name: String, parent: String, generation: UInt64) async throws {
    let _: NodeCreatedResponse = try await perform(
      "catalog:createDir", data: ["name": name, "parent_path": parent],
      phase: .unlocked, generation: generation)
  }

  public func renameFile(id: UInt64, name: String, generation: UInt64) async throws {
    let _: JSONNull = try await perform(
      "catalog:rename", data: RenameRequest(nodeID: id, newName: name),
      phase: .unlocked, generation: generation)
  }

  public func moveFile(id: UInt64, parent: String, generation: UInt64) async throws {
    let _: JSONNull = try await perform(
      "catalog:move",
      data: MoveRequest(nodeID: id, newParentPath: parent, replaceExisting: false),
      phase: .unlocked, generation: generation)
  }

  public func deleteFile(id: UInt64, generation: UInt64) async throws {
    let _: JSONNull = try await perform(
      "catalog:delete", data: ["node_id": id], phase: .unlocked, generation: generation)
  }

  public func fileInfo(id: UInt64, generation: UInt64) async throws -> SourceMetadataResponse {
    try await perform(
      "catalog:source:metadata", data: ["node_id": id], phase: .unlocked, generation: generation)
  }

  private struct RenameRequest: Encodable {
    let nodeID: UInt64
    let newName: String
    enum CodingKeys: String, CodingKey {
      case nodeID = "node_id"
      case newName = "new_name"
    }
  }
  private struct MoveRequest: Encodable {
    let nodeID: UInt64
    let newParentPath: String
    let replaceExisting: Bool
    enum CodingKeys: String, CodingKey {
      case nodeID = "node_id"
      case newParentPath = "new_parent_path"
      case replaceExisting = "replace_existing"
    }
  }
}
