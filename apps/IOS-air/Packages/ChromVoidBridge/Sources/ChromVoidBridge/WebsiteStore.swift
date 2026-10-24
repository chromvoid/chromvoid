import Foundation

@MainActor
public protocol WebsiteStore: AnyObject {
  func websiteRules(id: String, generation: UInt64) async throws -> PassmanagerWebsiteResult
  func validateWebsites(_ rules: [CredentialWebsiteRule], generation: UInt64) async throws
    -> PassmanagerWebsiteResult
  func updateWebsites(_ request: PassmanagerWebsiteUpdateRequest, generation: UInt64) async throws
    -> PassmanagerWebsiteResult
}
