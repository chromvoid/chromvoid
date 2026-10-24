import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite @MainActor
struct SSHModelTests {
  @Test func creationUsesCoreAndPurgesDraftOnRevoke() async throws {
    let store = SSHTestStore()
    var saved = 0
    let model = SSHCreationModel(store: store, generation: 7, sourceID: "source") { saved += 1 }
    model.setMode(.importKey)
    #expect(model.submit() == nil && model.focus == .privateKey)
    #expect(model.issue == "Paste a private key or choose a key file.")
    model.change(.name, to: "")
    model.change(.privateKey, to: "")
    #expect(model.issue == "Paste a private key or choose a key file.")
    #expect(store.imports.isEmpty && store.generations.isEmpty)
    model.change(.privateKey, to: "synthetic-private")
    #expect(model.issue == nil)
    model.change(.passphrase, to: "synthetic-passphrase")
    await model.submit()?.value
    #expect(store.imports.first?.privateKey == "synthetic-private")
    #expect(store.imports.first?.sourceEntryID == "source" && saved == 1)
    #expect(model.value(.privateKey).isEmpty)
    model.revoke()
    #expect(model.value(.passphrase).isEmpty && model.submit() == nil)
  }
  @Test func selectedFileIsBoundedAndClearedWhenTheFormCloses() async throws {
    let store = SSHTestStore()
    let model = SSHCreationModel(store: store, generation: 7) {}
    model.setMode(.importKey)
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(
      UUID().uuidString + ".key")
    defer { try? FileManager.default.removeItem(at: url) }
    try Data("synthetic-file-input".utf8).write(to: url)
    await model.importFile(.success(url))?.value
    #expect(model.value(.privateKey) == "synthetic-file-input" && model.issue == nil)
    model.change(.privateKey, to: "")
    try Data(repeating: 65, count: 65537).write(to: url)
    await model.importFile(.success(url))?.value
    #expect(model.value(.privateKey).isEmpty && model.issue != nil)
    try Data("late-synthetic-file".utf8).write(to: url)
    let late = model.importFile(.success(url))
    model.revoke()
    await late?.value
    #expect(model.value(.privateKey).isEmpty && model.state == .revoked)
  }

  @Test func uncertainCreationCannotResubmit() async {
    let store = SSHTestStore()
    store.failure = CredentialStoreError.invalidPage
    let model = SSHCreationModel(store: store, generation: 7) {}
    await model.submit()?.value
    #expect(model.state == .uncertain && model.issue != nil)
    #expect(model.submit() == nil && store.generations.count == 1)
  }
  @Test func privateExportRequiresExplicitPlaintextChoiceAndLockDropsLateResult() async throws {
    let store = SSHTestStore()
    let clipboard = SSHClipboard()
    let model = SSHDetailModel(
      row: store.row, store: store, generation: 7, clipboard: clipboard, onMutation: {},
      onDelete: {}, onOpenSource: { _ in })
    model.beginExport(.privateKey)
    #expect(model.export() == nil && model.confirmingPlaintext && store.exports.isEmpty)
    model.cancelPlaintext()
    model.changePassphrase("protect-output")
    store.delayedExport = true
    let task = model.export()
    await store.waitForExport()
    #expect(
      store.exports.first?.format == "openssh_private"
        && store.exports.first?.passphrase == "protect-output")
    model.revoke()
    store.finishExport()
    await task?.value
    #expect(model.document == nil && !model.presentingDocument && model.passphrase.isEmpty)
    #expect(model.row == nil && clipboard.values.isEmpty)
  }
  @Test func publicCopyDoesNotRevealOrRetainAnExport() async {
    let store = SSHTestStore()
    let clipboard = SSHClipboard()
    let model = SSHDetailModel(
      row: store.row, store: store, generation: 7, clipboard: clipboard, onMutation: {},
      onDelete: {}, onOpenSource: { _ in })
    await model.copyPublicKey()?.value
    #expect(
      store.exports.first?.format == "openssh_public" && store.exports.first?.passphrase == nil)
    #expect(clipboard.values == ["synthetic-export"] && model.document == nil && model.copied)
    store.delayedExport = true
    let pending = model.copyPublicKey()
    await store.waitForExport()
    model.cancelExport()
    store.finishExport()
    await pending?.value
    #expect(clipboard.values.count == 1)
  }
  @Test func editPreservesRevisionAndDeletionRequiresConfirmation() async {
    let store = SSHTestStore()
    var deleted = 0
    let model = SSHDetailModel(
      row: store.row, store: store, generation: 7, clipboard: SSHClipboard(), onMutation: {},
      onDelete: { deleted += 1 }, onOpenSource: { _ in })
    #expect(model.delete() == nil && store.deletions.isEmpty)
    model.beginEdit()
    model.changeName("Renamed")
    await model.save()?.value
    #expect(
      store.edits.first?.revision == store.row.revision && store.edits.first?.name == "Renamed")
    #expect(store.edits.first?.sourceEntryID == "source")
    model.requestDelete()
    await model.delete()?.value
    #expect(store.deletions == ["key"] && deleted == 1)
  }
  @Test func catalogFiltersReloadFromCoreAndClearTogether() async {
    let store = SSHTestStore()
    let model = SSHModel(store: store, generation: 7, sourceID: "source")
    await model.reload()?.value
    await model.setKeyType(.rsa)?.value
    #expect(store.pages.last?.keyType == "rsa" && store.pages.last?.offset == 0)
    #expect(store.pages.last?.revision == nil && store.pages.last?.sourceEntryID == "source")
    await model.search("Server")?.value
    #expect(store.pages.last?.query == "Server" && store.pages.last?.keyType == "rsa")
    let count = store.pages.count
    await model.clearFilters()?.value
    #expect(store.pages.count == count + 1 && !model.hasFilters)
    #expect(store.pages.last?.query == "" && store.pages.last?.keyType == nil)
    model.revoke()
    #expect(model.setKeyType(.ecdsa) == nil && model.keyType == .all)
  }
  @Test func catalogRevokeClearsChildDraftAndSelection() async throws {
    let store = SSHTestStore()
    let model = SSHModel(store: store, generation: 7, sourceID: "source", clipboard: SSHClipboard())
    await model.reload()?.value
    #expect(model.keys.count == 1 && store.pages.first?.sourceEntryID == "source")
    model.select("key")
    let selected = try #require(model.selected)
    selected.beginExport(.privateKey)
    selected.changePassphrase("secret")
    model.beginCreation()
    let creation = try #require(model.creation)
    creation.setMode(.importKey)
    creation.change(.privateKey, to: "private")
    model.revoke()
    #expect(model.keys.isEmpty && model.selected == nil && model.creation == nil)
    #expect(selected.passphrase.isEmpty && creation.value(.privateKey).isEmpty)
  }
}

@MainActor private final class SSHClipboard: CredentialClipboard {
  var values: [String] = []
  func copy(_ value: String) { values.append(value) }
  func clearOwned() { values = [] }
}
@MainActor private final class SSHTestStore: CredentialStore {
  let row = SSHKeySummary(
    key: SSHKeyMetadata(
      comment: "fixed", createdTs: 1, fingerprint: "SHA256:synthetic", id: "key", name: "Synthetic",
      sourceEntryID: "source", type: "ed25519", updatedTs: 1),
    revision: String(repeating: "a", count: 64), sourcePath: "/Ops/Server", sourceTitle: "Server")
  var imports: [PassmanagerSSHImportRequest] = []
  var generations: [PassmanagerSSHKeygenRequest] = []
  var exports: [PassmanagerSSHExportRequest] = []
  var edits: [PassmanagerSSHEditRequest] = []
  var pages: [PassmanagerSSHPageRequest] = []
  var deletions: [String] = []
  var failure: Error?
  var delayedExport = false
  var pending: CheckedContinuation<PassmanagerSSHExportResponse, Error>?
  var started: CheckedContinuation<Void, Never>?
  var created: PassmanagerSSHKeyCreateResponse {
    PassmanagerSSHKeyCreateResponse(
      fingerprint: row.key.fingerprint, keyID: "key", keyType: "ed25519",
      publicKeyOpenssh: "synthetic-public")
  }
  func sshPage(_ request: PassmanagerSSHPageRequest, generation: UInt64) async throws
    -> PassmanagerSSHPageResponse
  {
    pages.append(request)
    return PassmanagerSSHPageResponse(
      keys: [row], nextOffset: nil, revision: row.revision, totalCount: 1)
  }
  func generateSSH(_ request: PassmanagerSSHKeygenRequest, generation: UInt64) async throws
    -> PassmanagerSSHKeyCreateResponse
  {
    generations.append(request)
    if let failure { throw failure }
    return created
  }
  func importSSH(_ request: PassmanagerSSHImportRequest, generation: UInt64) async throws
    -> PassmanagerSSHKeyCreateResponse
  {
    imports.append(request)
    if let failure { throw failure }
    return created
  }
  func exportSSH(_ request: PassmanagerSSHExportRequest, generation: UInt64) async throws
    -> PassmanagerSSHExportResponse
  {
    exports.append(request)
    if delayedExport {
      return try await withCheckedThrowingContinuation {
        pending = $0
        started?.resume()
        started = nil
      }
    }
    return PassmanagerSSHExportResponse(content: "synthetic-export", filename: "key")
  }
  func waitForExport() async {
    if pending != nil { return }
    await withCheckedContinuation { started = $0 }
  }
  func finishExport() {
    pending?.resume(
      returning: PassmanagerSSHExportResponse(content: "synthetic-export", filename: "key"))
    pending = nil
  }
  func editSSH(_ request: PassmanagerSSHEditRequest, generation: UInt64) async throws
    -> SSHKeySummary
  {
    edits.append(request)
    return row
  }
  func deleteSSH(id: String, generation: UInt64) async throws { deletions.append(id) }
  func deleteCredential(id: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }
  func credentialDetail(id: String, generation: UInt64) async throws -> CredentialDetail {
    throw CredentialStoreError.invalidPage
  }
  func updateCredential(_ request: PassmanagerEntryUpdateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  {
    throw CredentialStoreError.invalidPage
  }
  func readCredentialSecret(id: String, type: String, generation: UInt64) async throws -> String {
    throw CredentialStoreError.invalidPage
  }
  func saveCredentialSecret(id: String, type: String, value: String, generation: UInt64)
    async throws
  {
    throw CredentialStoreError.invalidPage
  }
  func createCredential(_ request: PassmanagerEntryCreateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  {
    throw CredentialStoreError.invalidPage
  }
  func credentialPage(
    _ request: PassmanagerEntryPageRequest, generation: UInt64
  ) async throws -> PassmanagerEntryPageResponse { throw CredentialStoreError.invalidPage }
  func tagPage(offset: UInt32, generation: UInt64) async throws -> PassmanagerTagPageResponse {
    throw CredentialStoreError.invalidPage
  }
  func saveTag(sourceKey: String?, label: String, colorID: String, generation: UInt64) async throws
    -> CredentialTagSummary
  {
    throw CredentialStoreError.invalidPage
  }
  func deleteTag(key: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }
}
