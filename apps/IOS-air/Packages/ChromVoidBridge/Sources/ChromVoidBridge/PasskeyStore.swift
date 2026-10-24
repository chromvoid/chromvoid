import Foundation

/// Metadata-only management of Core's separate passkey domain.
@MainActor
public protocol PasskeyStore: AnyObject {
  func listPasskeys(generation: UInt64) async throws -> VaultPasskeysListResponse
  func deletePasskey(_ request: VaultPasskeyDeleteRequest, generation: UInt64) async throws
    -> VaultPasskeyDeleteResponse
}

extension RuntimeClient: PasskeyStore {}
