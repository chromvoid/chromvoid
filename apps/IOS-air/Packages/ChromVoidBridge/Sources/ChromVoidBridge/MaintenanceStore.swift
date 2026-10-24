import Foundation

/// Core owns password validation, staging, commit and recovery of maintenance operations.
@MainActor
public protocol MaintenanceStore: AnyObject {
  func rekeyVault(_ request: VaultRekeyRequest, generation: UInt64)
    async throws -> VaultRekeyResponse
  func rekeyMaster(_ request: MasterRekeyRequest, generation: UInt64)
    async throws -> MasterRekeyResponse
}

extension RuntimeClient: MaintenanceStore {
  public func rekeyVault(_ request: VaultRekeyRequest, generation: UInt64)
    async throws -> VaultRekeyResponse
  {
    try await perform("vault:rekey", data: request, phase: .unlocked, generation: generation)
  }

  public func rekeyMaster(_ request: MasterRekeyRequest, generation: UInt64)
    async throws -> MasterRekeyResponse
  {
    let phase = try snapshot().phase
    guard phase == .locked || phase == .unlocked else { throw BridgeError.SessionRevoked }
    return try await perform("master:rekey", data: request, phase: phase, generation: generation)
  }
}
