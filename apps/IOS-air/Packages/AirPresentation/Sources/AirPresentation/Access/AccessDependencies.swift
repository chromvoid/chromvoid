import ChromVoidBridge
import Foundation
import LocalAuthentication

@MainActor
public protocol AccessRuntime: AnyObject {
  var maintenance: any MaintenanceStore { get }
  var storageBackups: any StorageBackupStore { get }
  var storageRestores: any StorageRestoreStore { get }
  var storageErasure: any StorageEraseStore { get }
  var credentials: any CredentialStore { get }
  var files: any FileCatalogStore { get }
  var fileImports: any FileImportStore { get }
  var autoFill: any AutoFillStore { get }
  var passkeys: any PasskeyStore { get }
  var connections: any HostStore { get }
  var wallet: any WalletStore { get }
  var walletSend: any WalletSendStore { get }
  var walletRecovery: any WalletRecoveryStore { get }
  var walletHistory: any WalletHistoryStore { get }
  var walletContacts: any WalletAddressBookStore { get }
  func snapshot() throws -> AirSnapshot
  func setAutoLockTimeout(seconds: UInt64, generation: UInt64) throws
  func recordUserActivity(generation: UInt64) throws
  func activate() throws -> AirSnapshot
  func deactivate() throws -> AirSnapshot
  func lock() throws -> AirSnapshot
  func close() throws -> AirSnapshot
  func events(after sequence: UInt64) async throws -> AirEventBatch
  func setupAdministrator(password: String) async throws
  func unlock(password: String) async throws
}

extension RuntimeClient: AccessRuntime {
  public var maintenance: any MaintenanceStore { self }
  public var storageBackups: any StorageBackupStore { self }
  public var storageRestores: any StorageRestoreStore { self }
  public var storageErasure: any StorageEraseStore { self }
  public var credentials: any CredentialStore { self }
  public var files: any FileCatalogStore { self }
  public var fileImports: any FileImportStore { self }
  public var autoFill: any AutoFillStore { self }
  public var passkeys: any PasskeyStore { self }
  public var connections: any HostStore { self }
  public var wallet: any WalletStore { self }
  public var walletSend: any WalletSendStore { self }
  public var walletRecovery: any WalletRecoveryStore { self }
  public var walletHistory: any WalletHistoryStore { self }
  public var walletContacts: any WalletAddressBookStore { self }
}

@MainActor
public protocol PresenceChecking: AnyObject {
  func authenticate() async throws -> Bool
  func cancel()
}

@MainActor
public final class SystemPresenceCheck: PresenceChecking {
  private var context: LAContext?
  public init() {}

  public func authenticate() async throws -> Bool {
    let context = LAContext()
    self.context = context
    defer { if self.context === context { self.context = nil } }
    return try await context.evaluatePolicy(
      .deviceOwnerAuthentication,
      localizedReason: String(
        localized: "Confirm it’s you to enter ChromVoid Air.", bundle: .module))
  }

  public func cancel() {
    context?.invalidate()
    context = nil
  }
}
