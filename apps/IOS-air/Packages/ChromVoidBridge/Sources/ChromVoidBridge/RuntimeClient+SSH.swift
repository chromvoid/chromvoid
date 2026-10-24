import Foundation

/// SSH key commands.
extension RuntimeClient {
  public func sshPage(_ request: PassmanagerSSHPageRequest, generation: UInt64) async throws
    -> PassmanagerSSHPageResponse
  {
    try await perform(
      "passmanager:ssh:page", data: request, phase: .unlocked, generation: generation)
  }
  public func generateSSH(_ request: PassmanagerSSHKeygenRequest, generation: UInt64) async throws
    -> PassmanagerSSHKeyCreateResponse
  {
    try await perform(
      "passmanager:ssh:keygen", data: request, phase: .unlocked, generation: generation)
  }
  public func importSSH(_ request: PassmanagerSSHImportRequest, generation: UInt64) async throws
    -> PassmanagerSSHKeyCreateResponse
  {
    try await perform(
      "passmanager:ssh:key:import", data: request, phase: .unlocked, generation: generation)
  }
  public func exportSSH(_ request: PassmanagerSSHExportRequest, generation: UInt64) async throws
    -> PassmanagerSSHExportResponse
  {
    try await perform(
      "passmanager:ssh:key:export", data: request, phase: .unlocked, generation: generation)
  }
  public func editSSH(_ request: PassmanagerSSHEditRequest, generation: UInt64) async throws
    -> SSHKeySummary
  {
    try await perform(
      "passmanager:ssh:key:edit", data: request, phase: .unlocked, generation: generation)
  }
  public func deleteSSH(id: String, generation: UInt64) async throws {
    let _: JSONNull = try await perform(
      "passmanager:ssh:key:delete", data: ["key_id": id], phase: .unlocked, generation: generation)
  }
}
