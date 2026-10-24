import ChromVoidBridge
import Foundation
import XCTest

@testable import AirPresentation

@MainActor
final class TestFileCatalogStore: FileCatalogStore, FileImportStore, DerivativeStore {
  var reader: @MainActor (UInt64) throws -> any FileReading = { _ in
    throw BridgeError.RuntimeUnavailable
  }
  var derivative: @MainActor (UInt64, DerivativeTier, Bool) async throws -> DerivativeBytes = {
    _, _, _ in throw BridgeError.CapabilityUnavailable
  }
  var derivativeLimitBytes: UInt64 { 8 * 1024 * 1024 }
  func derivative(
    nodeID: UInt64, sourceRevision: UInt64, tier: DerivativeTier, ensure: Bool,
    generation: UInt64
  ) async throws -> DerivativeBytes {
    try await derivative(nodeID, tier, ensure)
  }
  func openFileReader(nodeID: UInt64, generation: UInt64) throws -> any FileReading {
    try reader(nodeID)
  }

  func resolveDocumentLink(
    nodeID: UInt64, path: String, kind: CatalogDocumentLinkKind, generation: UInt64
  )
    async throws -> CatalogDocumentLinkResponse
  { throw FileCatalogError.invalidPage }

  var documentByteLimit: UInt64 { 1024 * 1024 }
  func readDocument(nodeID: UInt64, generation: UInt64) async throws -> OpenedDocument {
    throw BridgeError.RuntimeUnavailable
  }
  func saveDocument(nodeID: UInt64, sourceRevision: UInt64, text: String, generation: UInt64)
    async throws -> CatalogFileReplaceResponse
  {
    throw BridgeError.RuntimeUnavailable
  }
  var export: @MainActor (UInt64) async throws -> FileExportCopy = { _ in
    throw BridgeError.RuntimeUnavailable
  }
  func prepareFileExport(
    id: UInt64, generation: UInt64, progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> FileExportCopy { try await export(id) }
  var note: @MainActor (String, String, String) async throws -> UploadResponse = { _, _, _ in
    throw BridgeError.RuntimeUnavailable
  }
  func createNote(name: String, text: String, parent: String, generation: UInt64) async throws
    -> UploadResponse
  {
    try await note(name, text, parent)
  }
  func importMarkdownImage(
    _ input: MarkdownImageInput, folder: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> String {
    throw CocoaError(.fileReadUnknown)
  }

  func importFile(
    _ url: URL, parent: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> UploadResponse {
    throw BridgeError.RuntimeUnavailable
  }
  var requests: [CatalogFolderPageRequest] = []
  var mutations: [String] = []
  var mutate: @MainActor (UInt64) async throws -> Void = { _ in }
  var page: @MainActor (CatalogFolderPageRequest) async throws -> CatalogFolderPageResponse = {
    request in
    CatalogFolderPageResponse(
      currentPath: request.path ?? "/",
      filterCounts: CatalogFolderFilterCounts(all: 0, images: 0, markdown: 0),
      items: [], limit: 50, nextOffset: nil, offset: request.offset ?? 0,
      reloadRequired: false, totalCount: 0, version: 1)
  }
  func filePage(_ request: CatalogFolderPageRequest, generation: UInt64) async throws
    -> CatalogFolderPageResponse
  {
    requests.append(request)
    return try await page(request)
  }
  func createFolder(name: String, parent: String, generation: UInt64) async throws {
    mutations.append("create:\(parent):\(name)")
  }
  func renameFile(id: UInt64, name: String, generation: UInt64) async throws {
    mutations.append("rename:\(id):\(name)")
    try await mutate(id)
  }
  func moveFile(id: UInt64, parent: String, generation: UInt64) async throws {
    mutations.append("move:\(id):\(parent)")
    try await mutate(id)
  }
  func deleteFile(id: UInt64, generation: UInt64) async throws {
    mutations.append("delete:\(id)")
    try await mutate(id)
  }
  func fileInfo(id: UInt64, generation: UInt64) async throws -> SourceMetadataResponse {
    throw BridgeError.RuntimeUnavailable
  }
}

final class FilesModelTests: XCTestCase {
  @MainActor
  func testDeniedRenameExplainsRestrictionAndPreservesCatalogAndDraft() async throws {
    let store = TestFileCatalogStore()
    let file = item(id: 13, name: "report.txt", directory: false)
    store.page = { request in
      CatalogFolderPageResponse(
        currentPath: request.path ?? "/",
        filterCounts: CatalogFolderFilterCounts(all: 1, images: 0, markdown: 0),
        items: [file], limit: 50, nextOffset: nil, offset: 0,
        reloadRequired: false, totalCount: 1, version: 1)
    }
    store.mutate = { _ in
      _ = try JSONDecoder().decode(
        RPCResult<JSONNull>.self, from: Data(#"{"ok":false,"code":"ACCESS_DENIED"}"#.utf8))
      XCTFail("Expected the real RPC decoder to throw the denial")
    }
    let model = FilesModel(store: store, imports: store, generation: 7)
    defer { model.revoke() }
    await model.reload()?.value
    let requestsBeforeRename = store.requests.count
    model.rename(file)
    model.setName("renamed.txt")
    model.saveName()
    XCTAssertTrue(model.saving)
    await settled { !model.saving }

    XCTAssertEqual(model.issue, "Access to this item is denied.")
    model.setName("renamed.txt")
    XCTAssertEqual(model.issue, "Access to this item is denied.")
    let issue = try XCTUnwrap(model.issue)
    XCTAssertEqual(
      AirCopy(locale: Locale(identifier: "ru")).text(issue), "Нет доступа к этому элементу.")
    XCTAssertEqual(model.state, .ready)
    XCTAssertEqual(model.items.map(\.name), ["report.txt"])
    XCTAssertEqual(model.name, "renamed.txt")
    XCTAssertNotNil(model.edit)
    XCTAssertEqual(store.requests.count, requestsBeforeRename)
    XCTAssertEqual(store.mutations, ["rename:13:renamed.txt"])
    model.dismissEdit()
    XCTAssertNil(model.edit)
    XCTAssertNil(model.issue)
    XCTAssertEqual(model.items.map(\.nodeID), [13])
    XCTAssertEqual(store.mutations.count, 1)
  }

  @MainActor
  func testAttachmentFolderSelectionUsesItsOwnRouteAndPersistsOnlyAfterConfirmation() async throws {
    let suite = "air-attachment-folder-" + UUID().uuidString
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let preferences = FilePreferences(defaults: defaults)
    let store = TestFileCatalogStore()
    let folder = item(id: 12, name: "Photos 100%", directory: true)
    let file = item(id: 13, name: "note.md", directory: false)
    let emptyPage = store.page
    store.page = { request in
      let page = try await emptyPage(request)
      return CatalogFolderPageResponse(
        currentPath: page.currentPath, filterCounts: page.filterCounts,
        items: page.currentPath == "/" ? [folder, file] : [], limit: 50,
        nextOffset: nil, offset: 0, reloadRequired: false, totalCount: 2, version: 1)
    }
    let root = FilesModel(store: store, imports: store, generation: 7, preferences: preferences)
    defer { root.revoke() }
    root.setQuery("keep this search")
    root.chooseAttachmentFolder()
    let picker = try XCTUnwrap(root.attachmentFolderPicker)
    await picker.browser.reload()?.value
    XCTAssertEqual(picker.folders(in: picker.browser).map(\.nodeID), [12])
    picker.select(picker.browser)
    XCTAssertEqual(picker.issue, "Choose a folder inside the vault.")
    XCTAssertEqual(preferences.attachmentFolder, "/attachments")
    picker.open(file, in: picker.browser)
    XCTAssertNil(picker.browser.child)
    picker.open(folder, in: picker.browser)
    let child = try XCTUnwrap(picker.browser.child)
    picker.select(child)
    XCTAssertEqual(picker.issue, "Wait for the destination folder to load.")
    await child.reload()?.value
    picker.select(child)
    XCTAssertNil(root.attachmentFolderPicker)
    XCTAssertEqual(child.state, .revoked)
    XCTAssertEqual(preferences.attachmentFolder, "/Photos 100%")
    XCTAssertEqual(FilePreferences(defaults: defaults).attachmentFolder, "/Photos 100%")
    XCTAssertEqual(root.query, "keep this search")
    XCTAssertNil(root.child)
    XCTAssertTrue(store.mutations.isEmpty)
  }

  @MainActor
  func testCanceledOrRevokedAttachmentPickerCannotChangeThePreference() async throws {
    let suite = "air-attachment-folder-" + UUID().uuidString
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let preferences = FilePreferences(defaults: defaults)
    let store = TestFileCatalogStore()
    let root = FilesModel(store: store, imports: store, generation: 7, preferences: preferences)
    root.chooseAttachmentFolder()
    let canceled = try XCTUnwrap(root.attachmentFolderPicker)
    root.dismissAttachmentFolder()
    XCTAssertEqual(canceled.browser.state, .revoked)
    canceled.select(canceled.browser)
    root.chooseAttachmentFolder()
    let locked = try XCTUnwrap(root.attachmentFolderPicker)
    root.revoke()
    XCTAssertNil(root.attachmentFolderPicker)
    XCTAssertEqual(locked.browser.state, .revoked)
    locked.select(locked.browser)
    root.chooseAttachmentFolder()
    XCTAssertNil(root.attachmentFolderPicker)
    XCTAssertEqual(preferences.attachmentFolder, "/attachments")
    XCTAssertTrue(store.mutations.isEmpty)
  }

  @MainActor
  func testFilePreferencesPersistAndRefreshOpenFolderRoutesWithoutLosingSearch() async throws {
    let suite = "air-file-preferences-" + UUID().uuidString
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let preferences = FilePreferences(defaults: defaults)
    XCTAssertFalse(preferences.showHidden)
    XCTAssertTrue(preferences.confirmDeletion)
    let store = TestFileCatalogStore()
    let root = FilesModel(store: store, imports: store, generation: 7, preferences: preferences)
    defer { root.revoke() }
    root.setQuery("Archive")
    root.setSort(.date)
    await root.reload()?.value
    root.open(item(id: 12, name: "Archive", directory: true))
    let child = try XCTUnwrap(root.child)
    await child.reload()?.value
    let rootRefreshed = expectation(description: "Root applies default filter")
    let childRefreshed = expectation(description: "Child applies default filter")
    let page = store.page
    store.page = { request in
      if request.filter?.includeHidden == true {
        if request.path == "/" { rootRefreshed.fulfill() }
        if request.path == "/Archive" { childRefreshed.fulfill() }
      }
      return try await page(request)
    }
    preferences.setShowHidden(true)
    preferences.setConfirmDeletion(false)
    await fulfillment(of: [rootRefreshed, childRefreshed], timeout: 2)
    XCTAssertEqual(root.query, "Archive")
    XCTAssertEqual(root.sort, .date)
    XCTAssertTrue(root.includeHidden)
    XCTAssertTrue(child.includeHidden)
    let restored = FilePreferences(defaults: defaults)
    XCTAssertTrue(restored.showHidden)
    XCTAssertFalse(restored.confirmDeletion)
  }

  @MainActor
  func testMoveBrowserSharesHiddenDefaultAndRevokedRoutesStopObserving() async throws {
    let suite = "air-file-browser-" + UUID().uuidString
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let preferences = FilePreferences(defaults: defaults)
    let store = TestFileCatalogStore()
    let model = FilesModel(store: store, imports: store, generation: 7, preferences: preferences)
    await model.reload()?.value
    model.setIncludeHidden(true)
    await model.reload()?.value
    let before = store.requests.count
    preferences.setShowHidden(true)
    XCTAssertEqual(store.requests.count, before)
    XCTAssertTrue(model.includeHidden)
    model.operate(.move, item: item(id: 14, name: "report.txt", directory: false))
    let browser = try XCTUnwrap(model.operation?.browser)
    await browser.reload()?.value
    XCTAssertTrue(browser.includeHidden)
    XCTAssertEqual(store.requests.last?.filter?.includeHidden, true)
    model.revoke()
    preferences.setShowHidden(false)
    XCTAssertEqual(model.state, .revoked)
    XCTAssertEqual(browser.state, .revoked)
    XCTAssertTrue(model.includeHidden, "Revoked routes no longer consume preference updates")
    XCTAssertTrue(browser.includeHidden)
  }

  @MainActor
  func testDeletionOptOutUsesExistingSingleAndBatchMutationFlows() async throws {
    let suite = "air-file-deletion-" + UUID().uuidString
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let preferences = FilePreferences(defaults: defaults)
    let store = TestFileCatalogStore()
    let model = FilesModel(store: store, imports: store, generation: 7, preferences: preferences)
    defer { model.revoke() }
    await model.reload()?.value
    let file = item(id: 14, name: "report.txt", directory: false)
    model.operate(.delete, item: file)
    XCTAssertEqual(model.operation?.state, .reviewing)
    XCTAssertTrue(store.mutations.isEmpty)
    model.dismissOperation()
    preferences.setConfirmDeletion(false)
    let singleDeleted = expectation(description: "Single explicit delete")
    store.mutate = { _ in singleDeleted.fulfill() }
    model.requestDelete(file)
    XCTAssertNil(model.deleting)
    await fulfillment(of: [singleDeleted], timeout: 2)
    XCTAssertEqual(store.mutations, ["delete:14"])
    await model.reload()?.value
    let batchDeleted = expectation(description: "Batch explicit delete")
    store.mutate = { _ in batchDeleted.fulfill() }
    model.operate(.delete, item: item(id: 15, name: "second.txt", directory: false))
    XCTAssertEqual(model.operation?.state, .running)
    await fulfillment(of: [batchDeleted], timeout: 2)
    XCTAssertEqual(store.mutations, ["delete:14", "delete:15"])
  }

  @MainActor
  func testSearchSortAndHiddenSettingsReachTheCorePageContract() async throws {
    let store = TestFileCatalogStore()
    let model = FilesModel(store: store, imports: store, generation: 7)
    model.setQuery("report")
    model.setSort(.date)
    model.setDescending(true)
    model.setIncludeHidden(true)
    await model.reload()?.value
    let request = try XCTUnwrap(store.requests.last)
    XCTAssertEqual(request.path, "/")
    XCTAssertEqual(request.offset, 0)
    XCTAssertNil(request.expectedVersion)
    XCTAssertEqual(request.filter?.query, "report")
    XCTAssertEqual(request.filter?.includeHidden, true)
    XCTAssertEqual(request.sort?.by, "date")
    XCTAssertEqual(request.sort?.direction, "desc")
    XCTAssertEqual(model.state, .ready)
    model.revoke()
  }

  @MainActor
  func testFolderNavigationReturnsToItsOriginalSearchAndRevokeClearsAllRoutes() async throws {
    let store = TestFileCatalogStore()
    let model = FilesModel(store: store, imports: store, generation: 7)
    model.setQuery("Archive")
    await model.reload()?.value
    let folder = item(id: 12, name: "Archive", directory: true)
    model.open(folder)
    let child = try XCTUnwrap(model.child)
    XCTAssertEqual(child.path, "/Archive")
    await child.reload()?.value
    model.closeChild()
    XCTAssertEqual(model.query, "Archive")
    XCTAssertEqual(child.state, .revoked)
    model.open(folder)
    let activeChild = try XCTUnwrap(model.child)
    model.revoke()
    XCTAssertNil(model.child)
    XCTAssertEqual(activeChild.state, .revoked)
    XCTAssertEqual(activeChild.path, "/")
    XCTAssertEqual(model.query, "")
    XCTAssertTrue(model.items.isEmpty)
  }

  @MainActor
  func testInvalidSubmitAndUnconfirmedDeleteCannotMutateTheCatalog() async {
    let store = TestFileCatalogStore()
    let model = FilesModel(store: store, imports: store, generation: 7)
    await model.reload()?.value
    model.createFolder()
    model.setName("   ")
    model.saveName()
    XCTAssertNotNil(model.issue)
    XCTAssertEqual(model.validationRevision, 1)
    XCTAssertTrue(store.mutations.isEmpty)
    model.dismissEdit()
    model.requestDelete(item(id: 14, name: "report.txt", directory: false))
    model.dismissDelete()
    model.deleteConfirmed()
    XCTAssertTrue(store.mutations.isEmpty)
    model.revoke()
  }

  @MainActor
  func testLateCatalogReplyCannotRepopulateARevokedFolder() async throws {
    let store = TestFileCatalogStore()
    let ready = expectation(description: "Catalog request suspended")
    var pending: CheckedContinuation<Void, Never>?
    let staleItem = item(id: 13, name: "private.txt", directory: false)
    store.page = { _ in
      await withCheckedContinuation { continuation in
        pending = continuation
        ready.fulfill()
      }
      return CatalogFolderPageResponse(
        currentPath: "/", filterCounts: CatalogFolderFilterCounts(all: 1, images: 0, markdown: 0),
        items: [staleItem], limit: 50,
        nextOffset: nil, offset: 0, reloadRequired: false, totalCount: 1, version: 1)
    }
    let model = FilesModel(store: store, imports: store, generation: 7)
    let work = model.reload()
    await fulfillment(of: [ready], timeout: 2)
    model.revoke()
    let continuation = try XCTUnwrap(pending)
    model.rename(staleItem)
    model.setName("private.txt")
    model.setQuery("private")
    XCTAssertNil(model.edit)
    XCTAssertEqual(model.name, "")
    XCTAssertEqual(model.query, "")
    continuation.resume()
    await work?.value
    XCTAssertEqual(model.state, .revoked)
    XCTAssertTrue(model.items.isEmpty)
    XCTAssertEqual(model.total, 0)
  }

  @MainActor
  func testNotesProjectionSearchesTheNotesAndRenameKeepsTheMarkdownSuffix() async throws {
    let store = TestFileCatalogStore()
    let note = item(id: 21, name: "Daily.md", directory: false)
    store.page = { request in
      CatalogFolderPageResponse(
        currentPath: request.path ?? "/",
        filterCounts: CatalogFolderFilterCounts(all: 1, images: 0, markdown: 1),
        items: [note], limit: 50, nextOffset: nil, offset: 0, reloadRequired: false,
        totalCount: 1, version: 1)
    }
    let model = FilesModel(store: store, imports: store, generation: 5)
    await settled { model.state == .ready }
    XCTAssertEqual(store.requests.last?.filter?.includeTextContent, false)
    model.setNotesOnly(true)
    await settled { store.requests.last?.filter?.recursive == true }
    // The Notes prompt promises the notes themselves, not only their names.
    XCTAssertEqual(store.requests.last?.filter?.includeTextContent, true)
    XCTAssertEqual(store.requests.last?.filter?.fileTypes, ["markdown"])
    model.rename(note)
    model.setName("Weekly")
    model.saveName()
    await settled { !store.mutations.isEmpty }
    XCTAssertEqual(store.mutations, ["rename:21:Weekly.md"])
    // A name that already carries the suffix, and a folder, are left as typed.
    XCTAssertEqual(FilesModel.keepingMarkdownSuffix("Weekly.MD", of: note), "Weekly.MD")
    XCTAssertEqual(
      FilesModel.keepingMarkdownSuffix("Plans", of: item(id: 3, name: "Trip", directory: true)),
      "Plans")
    model.revoke()
  }

  private func item(id: Int, name: String, directory: Bool) -> CatalogListItem {
    CatalogListItem(
      createdAt: 1, isDir: directory, mediaInfo: nil, mediaInspectedRevision: 0,
      mimeType: nil, name: name, nodeID: id, parentPath: "/", path: "/" + name,
      size: directory ? nil : 1, sourceRevision: 1, updatedAt: 1)
  }

  @MainActor
  private func settled(_ predicate: () -> Bool, file: StaticString = #filePath, line: UInt = #line)
    async
  {
    let deadline = ContinuousClock.now + .seconds(2)
    while !predicate(), ContinuousClock.now < deadline { await Task.yield() }
    XCTAssertTrue(predicate(), "Expected asynchronous state transition", file: file, line: line)
  }
}
