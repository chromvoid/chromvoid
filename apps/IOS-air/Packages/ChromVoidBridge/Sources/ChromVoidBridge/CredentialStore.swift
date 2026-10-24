import Foundation

@MainActor
public protocol CredentialStore: CredentialGroupStore, CredentialTagStore, CredentialOTPStore,
  PasswordGeneratorStore, CredentialAuditStore, SSHStore, WebsiteStore, CredentialMaintenanceStore,
  CredentialImportStore, CredentialExportStore, CredentialIconStore
{
  func deleteCredential(id: String, generation: UInt64) async throws
  func credentialDetail(id: String, generation: UInt64) async throws -> CredentialDetail
  func updateCredential(_ request: PassmanagerEntryUpdateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  func readCredentialSecret(id: String, type: String, generation: UInt64) async throws -> String
  func saveCredentialSecret(id: String, type: String, value: String, generation: UInt64)
    async throws

  func createCredential(_ request: PassmanagerEntryCreateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse

  func credentialPage(
    _ request: PassmanagerEntryPageRequest, generation: UInt64
  )
    async throws
    -> PassmanagerEntryPageResponse
}

public enum CredentialStoreError: Error { case catalogChanged, invalidPage }

/// Entry icons of the vault icon store, by digest. A store without icons answers every digest
/// as missing, which is what the test doubles do.
@MainActor
public protocol CredentialIconStore: AnyObject {
  func credentialIcons(_ refs: [String], generation: UInt64) async throws
    -> PassmanagerIconGetManyResponse
}

extension CredentialIconStore {
  public func credentialIcons(_ refs: [String], generation: UInt64) async throws
    -> PassmanagerIconGetManyResponse
  {
    PassmanagerIconGetManyResponse(icons: [], missingIconRefs: refs)
  }
}

extension RuntimeClient: CredentialStore {}

extension CredentialStore {
  public func credentialPage(
    offset: UInt32, query: String, groupPath: String? = nil, sort: String? = nil,
    descending: Bool = false, entryType: String? = nil, tagKey: String? = nil,
    quickFilters: [String] = [], generation: UInt64
  ) async throws -> PassmanagerEntryPageResponse {
    try await credentialPage(
      PassmanagerEntryPageRequest(
        descending: descending, entryType: entryType, groupBy: nil, groupPath: groupPath,
        groupingTime: nil, limit: 50, offset: Int(offset), query: query,
        quickFilters: quickFilters, sort: sort, tagKey: tagKey), generation: generation)
  }
}
