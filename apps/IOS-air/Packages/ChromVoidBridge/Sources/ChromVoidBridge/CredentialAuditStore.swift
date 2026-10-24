import Foundation

@MainActor
public protocol CredentialAuditStore: AnyObject {
  func securityAuditPage(_ request: PassmanagerSecurityAuditPageRequest, generation: UInt64)
    async throws -> PassmanagerSecurityAuditPageResponse
}
