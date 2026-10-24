import Foundation

/// A transient setup snapshot, never an authorization grant for a provider request.
public struct AutoFillStatus {
  public let systemEnabled: Bool?
  public let core: CredentialProviderStatusResponse
  public let identities: ProviderIdentityState
  public let access: ProviderAccessState

  public init(
    systemEnabled: Bool?, core: CredentialProviderStatusResponse,
    identities: ProviderIdentityState, access: ProviderAccessState
  ) {
    self.systemEnabled = systemEnabled
    self.core = core
    self.identities = identities
    self.access = access
  }
}

@MainActor
public protocol AutoFillStore: AnyObject {
  func autoFillStatus(generation: UInt64) async throws -> AutoFillStatus
}

extension RuntimeClient: AutoFillStore {}
