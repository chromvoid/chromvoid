import Foundation

/// Password-manager commands: entries, groups, tags, secrets, codes, websites, import/export.
extension RuntimeClient {
  public var credentialImportLimits: AirImportLimits { runtime.credentialImportLimits() }

  public func exportCredentialDocument(generation: UInt64) async throws -> Data {
    let handle = try runtime.beginRootExport(generation: generation)
    defer { try? handle.cancel() }
    let _: JSONNull = try await performExecution(phase: .unlocked, generation: generation) {
      id, _ in
      try handle.beginPrepare(requestId: id)
    }
    let data = try await CredentialExportBytes.read(handle)
    try Task.checkCancellation()
    let latest = try runtime.snapshot()
    guard latest.generation == generation, latest.phase == .unlocked, !latest.cleanupPending else {
      throw BridgeError.SessionRevoked
    }
    return data
  }

  public func reviewCredentialFile(
    _ url: URL, mode: AirImportMode, generation: UInt64, sourcePassword: String? = nil
  ) async throws
    -> any CredentialImportReview
  {
    let handle = try await CredentialImportFile.read(
      url, runtime: runtime, mode: mode, generation: generation)
    let transfer = CredentialImportTransfer(client: self, handle: handle, generation: generation)
    let preview = try await transfer.review(sourcePassword: sourcePassword)
    return ReviewedCredentialImport(preview: preview, transfer: transfer)
  }

  public func beginCredentialImport(byteCount: UInt64, mode: AirImportMode, generation: UInt64)
    throws -> CredentialImportTransfer
  {
    try Task.checkCancellation()
    let handle = try runtime.beginRootImport(
      generation: generation, byteCount: byteCount, mode: mode)
    return CredentialImportTransfer(client: self, handle: handle, generation: generation)
  }

  public func clearCredentials(generation: UInt64) async throws {
    let empty = try JSONDecoder().decode(JSONAny.self, from: Data("[]".utf8))
    let request = PassmanagerRootImportRequest(
      allowDestructive: true, entries: empty, expectedRevision: nil, folders: empty,
      foldersMeta: nil, icons: nil,
      mode: "replace", sshKeys: nil, tagMeta: nil, tags: nil)
    let _: JSONNull = try await perform(
      "passmanager:root:import", data: request, phase: .unlocked, generation: generation)
  }

  public func websiteRules(id: String, generation: UInt64) async throws -> PassmanagerWebsiteResult
  {
    try await perform(
      "passmanager:entry:websites:read", data: PassmanagerWebsiteReadRequest(entryID: id),
      phase: .unlocked, generation: generation)
  }
  public func validateWebsites(_ rules: [CredentialWebsiteRule], generation: UInt64) async throws
    -> PassmanagerWebsiteResult
  {
    try await perform(
      "passmanager:entry:websites:validate", data: PassmanagerWebsiteValidateRequest(rules: rules),
      phase: .unlocked, generation: generation)
  }
  public func updateWebsites(_ request: PassmanagerWebsiteUpdateRequest, generation: UInt64)
    async throws
    -> PassmanagerWebsiteResult
  {
    try await perform(
      "passmanager:entry:websites:update", data: request, phase: .unlocked, generation: generation)
  }

  public func credentialPage(_ request: PassmanagerEntryPageRequest, generation: UInt64)
    async throws
    -> PassmanagerEntryPageResponse
  {
    let sequence = try snapshot().sequence
    let page: PassmanagerEntryPageResponse = try await perform(
      "passmanager:entry:page", data: request, phase: .unlocked, generation: generation)
    guard try snapshot().sequence == sequence else { throw CredentialStoreError.catalogChanged }
    return page
  }

  /// At most 64 digests per call (the Core limit); the cache batches accordingly.
  public func credentialIcons(_ refs: [String], generation: UInt64) async throws
    -> PassmanagerIconGetManyResponse
  {
    try await perform(
      "passmanager:icon:getMany", data: PassmanagerIconGetManyRequest(iconRefs: refs),
      phase: .unlocked, generation: generation)
  }

  public func securityAuditPage(_ request: PassmanagerSecurityAuditPageRequest, generation: UInt64)
    async throws -> PassmanagerSecurityAuditPageResponse
  {
    let sequence = try snapshot().sequence
    let page: PassmanagerSecurityAuditPageResponse = try await perform(
      "passmanager:securityAudit:page", data: request, phase: .unlocked, generation: generation)
    guard try snapshot().sequence == sequence else { throw CredentialStoreError.catalogChanged }
    return page
  }

  public func tagPage(offset: UInt32, generation: UInt64) async throws -> PassmanagerTagPageResponse
  {
    let sequence = try snapshot().sequence
    let page: PassmanagerTagPageResponse = try await perform(
      "passmanager:tag:page", data: PassmanagerTagPageRequest(limit: 50, offset: Int(offset)),
      phase: .unlocked, generation: generation)
    guard try snapshot().sequence == sequence else { throw CredentialStoreError.catalogChanged }
    return page
  }
  public func saveTag(sourceKey: String?, label: String, colorID: String, generation: UInt64)
    async throws -> CredentialTagSummary
  {
    try await perform(
      "passmanager:tag:save",
      data: PassmanagerTagSaveRequest(colorID: colorID, label: label, sourceKey: sourceKey),
      phase: .unlocked, generation: generation)
  }
  public func deleteTag(key: String, generation: UInt64) async throws {
    let _: JSONNull = try await perform(
      "passmanager:tag:delete", data: PassmanagerTagDeleteRequest(key: key),
      phase: .unlocked, generation: generation)
  }

  public func groupPage(parent: String, offset: UInt32, generation: UInt64) async throws
    -> PassmanagerGroupPageResponse
  {
    let sequence = try snapshot().sequence
    let page: PassmanagerGroupPageResponse = try await perform(
      "passmanager:group:page",
      data: PassmanagerGroupPageRequest(limit: 50, offset: Int(offset), parent: parent),
      phase: .unlocked, generation: generation)
    guard try snapshot().sequence == sequence else { throw CredentialStoreError.catalogChanged }
    return page
  }

  public func ensureGroup(path: String, generation: UInt64) async throws {
    let _: JSONNull = try await perform(
      "passmanager:group:ensure", data: ["path": path], phase: .unlocked, generation: generation)
  }
  public func renameGroup(path: String, name: String, generation: UInt64) async throws {
    let _: JSONNull = try await perform(
      "passmanager:group:rename", data: PassmanagerGroupRenameRequest(name: name, path: path),
      phase: .unlocked, generation: generation)
  }
  public func deleteGroup(path: String, generation: UInt64) async throws {
    let _: JSONNull = try await perform(
      "passmanager:group:delete", data: ["path": path], phase: .unlocked, generation: generation)
  }

  public func createCredential(_ request: PassmanagerEntryCreateRequest, generation: UInt64)
    async throws
    -> PassmanagerEntrySaveResponse
  {
    try await perform(
      "passmanager:entry:create", data: request, phase: .unlocked, generation: generation)
  }

  public func credentialDetail(id: String, generation: UInt64) async throws -> CredentialDetail {
    if let seconds = RuntimeClient.slowCredentialDetail {
      try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }
    return try await perform(
      "passmanager:entry:detail", data: ["entry_id": id], phase: .unlocked, generation: generation)
  }

  public func deleteCredential(id: String, generation: UInt64) async throws {
    let _: JSONNull = try await perform(
      "passmanager:entry:delete", data: ["entry_id": id], phase: .unlocked,
      generation: generation)
  }

  public func updateCredential(_ request: PassmanagerEntryUpdateRequest, generation: UInt64)
    async throws -> PassmanagerEntrySaveResponse
  {
    try await perform(
      "passmanager:entry:update", data: request, phase: .unlocked, generation: generation)
  }

  public func readCredentialSecret(id: String, type: String, generation: UInt64) async throws
    -> String
  {
    let result: PassmanagerSecretReadResponse = try await perform(
      "passmanager:secret:read", data: ["entry_id": id, "secret_type": type], phase: .unlocked,
      generation: generation)
    return result.value
  }

  public func saveCredentialSecret(id: String, type: String, value: String, generation: UInt64)
    async throws
  {
    let _: JSONNull = try await perform(
      "passmanager:secret:save", data: ["entry_id": id, "secret_type": type, "value": value],
      phase: .unlocked, generation: generation)
  }

  public func generatePassword(_ request: PassmanagerPasswordGenerateRequest, generation: UInt64)
    async throws -> String
  {
    let response: PassmanagerPasswordGenerateResponse = try await perform(
      "passmanager:password:generate", data: request, phase: .unlocked, generation: generation)
    return response.password
  }

  public func parseOTPURI(_ uri: String, generation: UInt64) async throws
    -> PassmanagerOtpURIResponse
  {
    try await perform(
      "passmanager:otp:parseUri", data: PassmanagerOtpURIRequest(fallbackLabel: nil, uri: uri),
      phase: .unlocked, generation: generation)
  }
  public func otpRecords(id: String, generation: UInt64) async throws
    -> PassmanagerOtpRecordsResponse
  {
    try await perform(
      "passmanager:otp:record:list", data: PassmanagerOtpRecordsRequest(entryID: id),
      phase: .unlocked, generation: generation)
  }
  public func saveOTP(_ request: PassmanagerOtpRecordSaveRequest, generation: UInt64) async throws {
    let _: JSONNull = try await perform(
      "passmanager:otp:record:save", data: request, phase: .unlocked, generation: generation)
  }
  public func deleteOTP(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws {
    let _: JSONNull = try await perform(
      "passmanager:otp:record:delete", data: request, phase: .unlocked, generation: generation)
  }
  public func otpCode(_ request: PassmanagerOtpRecordRequest, generation: UInt64) async throws
    -> OtpPreviewResponse
  {
    try await perform(
      "passmanager:otp:record:code", data: request, phase: .unlocked, generation: generation)
  }
}
