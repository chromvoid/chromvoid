import ChromVoidBridge
import Foundation

// Legacy access/detail doubles have no group catalog; never fabricate an empty successful page.
extension CredentialStore {
  func reviewCredentialFile(
    _ url: URL, mode: AirImportMode, generation: UInt64, sourcePassword: String?
  ) async throws
    -> any CredentialImportReview
  { throw CredentialStoreError.invalidPage }
  func groupPage(parent: String, offset: UInt32, generation: UInt64) async throws
    -> PassmanagerGroupPageResponse
  { throw CredentialStoreError.invalidPage }
  func ensureGroup(path: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }
  func renameGroup(path: String, name: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }
  func deleteGroup(path: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }
}

extension CredentialStore {
  func otpRecords(id: String, generation: UInt64) async throws -> PassmanagerOtpRecordsResponse {
    throw CredentialStoreError.invalidPage
  }
  func saveOTP(_ request: PassmanagerOtpRecordSaveRequest, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }
  func deleteOTP(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }
  func otpCode(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws
    -> OtpPreviewResponse
  { throw CredentialStoreError.invalidPage }
}

extension CredentialOTPStore {
  func parseOTPURI(_ uri: String, generation: UInt64) async throws -> PassmanagerOtpURIResponse {
    throw CredentialStoreError.invalidPage
  }
}

extension CredentialStore {
  func generatePassword(_ request: PassmanagerPasswordGenerateRequest, generation: UInt64)
    async throws -> String
  { throw CredentialStoreError.invalidPage }
}

extension CredentialStore {
  func securityAuditPage(_ request: PassmanagerSecurityAuditPageRequest, generation: UInt64)
    async throws -> PassmanagerSecurityAuditPageResponse
  { throw CredentialStoreError.invalidPage }
}

extension CredentialStore {
  func sshPage(_ request: PassmanagerSSHPageRequest, generation: UInt64) async throws
    -> PassmanagerSSHPageResponse
  { throw CredentialStoreError.invalidPage }
  func generateSSH(_ request: PassmanagerSSHKeygenRequest, generation: UInt64) async throws
    -> PassmanagerSSHKeyCreateResponse
  { throw CredentialStoreError.invalidPage }
  func importSSH(_ request: PassmanagerSSHImportRequest, generation: UInt64) async throws
    -> PassmanagerSSHKeyCreateResponse
  { throw CredentialStoreError.invalidPage }
  func exportSSH(_ request: PassmanagerSSHExportRequest, generation: UInt64) async throws
    -> PassmanagerSSHExportResponse
  { throw CredentialStoreError.invalidPage }
  func editSSH(_ request: PassmanagerSSHEditRequest, generation: UInt64) async throws
    -> SSHKeySummary
  { throw CredentialStoreError.invalidPage }
  func deleteSSH(id: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }
}

extension CredentialStore {
  func websiteRules(id: String, generation: UInt64) async throws -> PassmanagerWebsiteResult {
    throw CredentialStoreError.invalidPage
  }
  func validateWebsites(_ rules: [CredentialWebsiteRule], generation: UInt64) async throws
    -> PassmanagerWebsiteResult
  {
    throw CredentialStoreError.invalidPage
  }
  func updateWebsites(_ request: PassmanagerWebsiteUpdateRequest, generation: UInt64) async throws
    -> PassmanagerWebsiteResult
  {
    throw CredentialStoreError.invalidPage
  }
}

extension CredentialStore {
  func clearCredentials(generation: UInt64) async throws { throw CredentialStoreError.invalidPage }
}

@MainActor
extension CredentialStore {
  func exportCredentialDocument(generation: UInt64) async throws -> Data {
    throw CredentialStoreError.invalidPage
  }
}
