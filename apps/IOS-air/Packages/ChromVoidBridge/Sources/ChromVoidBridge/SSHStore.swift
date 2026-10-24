import Foundation

@MainActor
public protocol SSHStore: AnyObject {
  func sshPage(_ request: PassmanagerSSHPageRequest, generation: UInt64) async throws
    -> PassmanagerSSHPageResponse
  func generateSSH(_ request: PassmanagerSSHKeygenRequest, generation: UInt64) async throws
    -> PassmanagerSSHKeyCreateResponse
  func importSSH(_ request: PassmanagerSSHImportRequest, generation: UInt64) async throws
    -> PassmanagerSSHKeyCreateResponse
  func exportSSH(_ request: PassmanagerSSHExportRequest, generation: UInt64) async throws
    -> PassmanagerSSHExportResponse
  func editSSH(_ request: PassmanagerSSHEditRequest, generation: UInt64) async throws
    -> SSHKeySummary
  func deleteSSH(id: String, generation: UInt64) async throws
}
