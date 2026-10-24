import Foundation

@MainActor
public protocol CredentialTagStore: AnyObject {
  func tagPage(offset: UInt32, generation: UInt64) async throws -> PassmanagerTagPageResponse
  func saveTag(sourceKey: String?, label: String, colorID: String, generation: UInt64) async throws
    -> CredentialTagSummary
  func deleteTag(key: String, generation: UInt64) async throws
}
