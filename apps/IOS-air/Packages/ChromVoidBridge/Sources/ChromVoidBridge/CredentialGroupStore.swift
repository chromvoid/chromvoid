import Foundation

@MainActor
public protocol CredentialGroupStore: AnyObject {
  func groupPage(parent: String, offset: UInt32, generation: UInt64) async throws
    -> PassmanagerGroupPageResponse
  func ensureGroup(path: String, generation: UInt64) async throws
  func renameGroup(path: String, name: String, generation: UInt64) async throws
  func deleteGroup(path: String, generation: UInt64) async throws
}
