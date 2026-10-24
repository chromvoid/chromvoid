import Foundation

/// Core reauthenticates the administrator and reconstructs HD recovery material.
/// Callers retain the returned secrets only for the active, revocable presentation.
@MainActor
public protocol WalletRecoveryStore: AnyObject {
  func exportWalletRecovery(_ request: WalletBackupExportRequest, generation: UInt64)
    async throws -> WalletBackupExportResponse
  /// Rotates the on-chain signing key of a TON account backed by a TEP-0003 rotation phrase.
  /// The response carries the complete replacement phrase; Core keeps the previous phrase valid
  /// until the rotation is observed on-chain.
  func rotateTonSigningKey(_ request: WalletTonRotateKeyRequest, generation: UInt64)
    async throws -> WalletTonRotateKeyResponse
}

extension WalletRecoveryStore {
  public func rotateTonSigningKey(_ request: WalletTonRotateKeyRequest, generation: UInt64)
    async throws -> WalletTonRotateKeyResponse
  {
    throw RPCFailure(code: "UNSUPPORTED_ACCOUNT_MODEL")
  }
}

extension RuntimeClient: WalletRecoveryStore {
  public func exportWalletRecovery(_ request: WalletBackupExportRequest, generation: UInt64)
    async throws -> WalletBackupExportResponse
  {
    try await perform(
      "wallet:backup:export", data: request, phase: .unlocked, generation: generation)
  }

  public func rotateTonSigningKey(_ request: WalletTonRotateKeyRequest, generation: UInt64)
    async throws -> WalletTonRotateKeyResponse
  {
    try await perform(
      "wallet:ton:rotateKey", data: request, phase: .unlocked, generation: generation)
  }
}
