import Foundation

@MainActor
public protocol CredentialMaintenanceStore: AnyObject {
  func clearCredentials(generation: UInt64) async throws
}
