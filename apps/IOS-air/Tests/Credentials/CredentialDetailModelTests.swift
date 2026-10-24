import AirPresentation
import ChromVoidBridge
import Foundation
import XCTest

@MainActor
final class CredentialDetailModelTests: XCTestCase {
  func testCatalogRefreshKeepsOpenDraftOnFailureButRevocationPurgesIt() async throws {
    let store = DetailStore()
    let catalog = CredentialsModel(store: store, generation: 7)
    defer { catalog.revoke() }
    catalog.search("Original")
    await settle { store.page != nil }
    let page = try JSONEncoder().encode(
      PassmanagerEntryPageResponse(
        entries: [
          CredentialSummary(
            entryType: "login", groupKey: nil, groupPath: "/Team", hasCodes: false, iconRef: nil,
            id: "entry",
            title: "Original", username: "alice", website: nil)
        ], nextOffset: nil, totalCount: nil))
    store.page?.resume(returning: page)
    store.page = nil
    await settle { catalog.state == .ready }
    catalog.select("entry")
    let detail = try XCTUnwrap(catalog.selected)
    await settle { detail.state == .ready }
    store.stored = ["password": "stored password", "note": ""]
    await detail.beginEditing()?.value
    let editor = try XCTUnwrap(detail.editor)
    editor.change(.title, to: "Unsaved title")

    let refresh = try XCTUnwrap(catalog.reload())
    await settle { store.page != nil }
    XCTAssertEqual(catalog.state, .loading)
    XCTAssertTrue(catalog.selected === detail)
    XCTAssertTrue(detail.editor === editor)
    XCTAssertEqual(editor.value(.title), "Unsaved title")
    XCTAssertEqual(catalog.query, "Original")
    store.page?.resume(throwing: CredentialStoreError.invalidPage)
    store.page = nil
    await refresh.value
    XCTAssertEqual(catalog.state, .failed)
    XCTAssertTrue(catalog.selected === detail)
    XCTAssertEqual(detail.state, .ready)
    XCTAssertEqual(editor.value(.title), "Unsaved title")
    XCTAssertTrue(store.updates.isEmpty)
    detail.endEditing()
    catalog.closeDetail()
    XCTAssertNil(catalog.selected)
    XCTAssertEqual(catalog.query, "Original")
    XCTAssertTrue(editor.values.isEmpty)

    catalog.select("entry")
    let reopened = try XCTUnwrap(catalog.selected)
    await settle { reopened.state == .ready }
    await reopened.beginEditing()?.value
    let nextDraft = try XCTUnwrap(reopened.editor)
    nextDraft.change(.title, to: "Discard on lock")
    let pending = try XCTUnwrap(catalog.reload())
    await settle { store.page != nil }
    catalog.revoke()
    store.page?.resume(returning: page)
    store.page = nil
    await pending.value
    XCTAssertEqual(catalog.state, .revoked)
    XCTAssertNil(catalog.selected)
    XCTAssertTrue(catalog.query.isEmpty && catalog.entries.isEmpty)
    XCTAssertEqual(reopened.state, .revoked)
    XCTAssertTrue(nextDraft.values.isEmpty)
    XCTAssertTrue(store.updates.isEmpty)
  }

  func testOpeningDoesNotReadSecretsAndLateRevealCannotSurviveNavigation() async {
    let store = DetailStore()
    let model = CredentialDetailModel(id: "entry", store: store, generation: 7) {}
    await settle { model.state == .ready }
    XCTAssertEqual(store.secretReads, 0)
    model.reveal("password")
    await settle { store.secretRead != nil }
    model.hideSecrets()
    store.secretRead?.resume(returning: "late secret")
    store.secretRead = nil
    await settle { store.secretReads == 1 }
    XCTAssertTrue(model.secrets.isEmpty)
    model.reveal("password")
    await settle { store.secretRead != nil }
    store.secretRead?.resume(returning: "visible secret")
    store.secretRead = nil
    await settle { model.secrets["password"] != nil }
    model.revoke()
    XCTAssertNil(model.detail)
    XCTAssertTrue(model.secrets.isEmpty)
    XCTAssertEqual(model.state, .revoked)
  }

  func testMetadataPatchOnlySendsChangedFieldsAndConflictRequiresReload() async throws {
    let store = DetailStore()
    let model = CredentialEditorModel(detail: store.detail, store: store, generation: 7) {}
    model.change(.title, to: "")
    model.save()
    XCTAssertEqual(model.focus, .title)
    XCTAssertTrue(store.updates.isEmpty)
    model.change(.title, to: "Changed")
    model.save()
    model.save()
    await settle { store.update != nil }
    let request = try XCTUnwrap(store.updates.first)
    XCTAssertEqual(request.revision, "revision-one")
    XCTAssertEqual(request.title, "Changed")
    XCTAssertNil(request.tagKeys)
    XCTAssertNil(request.username)
    XCTAssertNil(request.websites)
    XCTAssertNil(request.cardholderName)
    store.update?.resume(throwing: failure("SYNC_CONFLICT"))
    store.update = nil
    await settle { model.needsReload }
    model.save()
    XCTAssertEqual(store.updates.count, 1)
    XCTAssertEqual(model.value(.title), "Changed")
    model.revoke()
    XCTAssertTrue(model.values.isEmpty)
  }

  func testTagSelectionCancelsOrSavesOnlyChangedKeysAndRevokesPicker() async throws {
    let store = DetailStore()
    let model = CredentialEditorModel(detail: store.detail, store: store, generation: 7) {}
    XCTAssertFalse(model.isDirty)
    model.beginTags()
    let cancelled = try XCTUnwrap(model.tagBrowser)
    await cancelled.reload()?.value
    cancelled.choose(store.tag)
    model.endTags()
    XCTAssertFalse(model.isDirty)
    XCTAssertEqual(model.selectedTags.map(\.key), ["work"])
    model.beginTags()
    let picker = try XCTUnwrap(model.tagBrowser)
    await picker.reload()?.value
    picker.choose(store.tag)
    picker.applySelection()
    XCTAssertTrue(model.isDirty)
    XCTAssertNil(model.tagBrowser)
    model.save()
    await settle { store.update != nil }
    XCTAssertEqual(store.updates.first?.tagKeys, [])
    XCTAssertNil(store.updates.first?.title)
    store.update?.resume(returning: PassmanagerEntrySaveResponse(entryID: "entry"))
    store.update = nil
    await settle { model.state == .saved }
    model.revoke()
    XCTAssertTrue(picker.selection.isEmpty)
    XCTAssertTrue(model.selectedTags.isEmpty)
  }

  func testEditFormReadsProtectedFieldsAndPurgesOnRevokeDuringSave() async throws {
    let store = DetailStore()
    let model = CredentialDetailModel(id: "entry", store: store, generation: 7) {}
    await settle { model.state == .ready }
    XCTAssertEqual(store.secretReads, 0)
    let opening = try XCTUnwrap(model.beginEditing())
    XCTAssertTrue(model.openingEditor)
    XCTAssertFalse(model.canInteract)
    await settle { store.secretRead != nil }
    store.secretRead?.resume(returning: "stored password")
    store.secretRead = nil
    await settle { store.secretRead != nil }
    store.secretRead?.resume(returning: "original\nnote")
    store.secretRead = nil
    await opening.value
    XCTAssertFalse(model.openingEditor)
    let editor = try XCTUnwrap(model.editor)
    XCTAssertEqual(editor.secretFields, [.password, .note])
    XCTAssertEqual(editor.value(.password), "stored password")
    XCTAssertEqual(editor.value(.note), "original\nnote")
    XCTAssertFalse(editor.revealed)
    XCTAssertFalse(editor.isDirty)
    editor.change(.note, to: "edited\nnote")
    editor.save()
    editor.save()
    await settle { store.secretSave != nil }
    // Only the changed field is written, and no metadata call goes with it.
    XCTAssertEqual(store.secretWrites, ["note:edited\nnote"])
    XCTAssertTrue(store.updates.isEmpty)
    model.revoke()
    store.secretSave?.resume()
    store.secretSave = nil
    await Task.yield()
    XCTAssertEqual(editor.state, .revoked)
    XCTAssertTrue(editor.values.isEmpty)
    XCTAssertNil(model.editor)
    XCTAssertNil(model.detail)
  }

  func testUncertainSaveIsNotRepeatedAndClosingRefetches() async throws {
    let store = DetailStore()
    var mutations = 0
    let model = CredentialDetailModel(id: "entry", store: store, generation: 7) { mutations += 1 }
    await settle { model.state == .ready }
    store.stored = ["password": "stored password", "note": ""]
    await model.beginEditing()?.value
    let editor = try XCTUnwrap(model.editor)
    editor.change(.username, to: "new")
    editor.save()
    await settle { store.update != nil }
    store.update?.resume(throwing: CredentialStoreError.invalidPage)
    store.update = nil
    await settle { editor.needsReload }
    editor.save()
    XCTAssertEqual(store.updates.count, 1)
    model.endEditing()
    // The page stays ready while its fresh copy loads; wait for that read to finish.
    await settle { model.state == .ready && !model.refreshing }
    XCTAssertEqual(mutations, 1)
    XCTAssertEqual(store.detailReads, 2)
    XCTAssertTrue(editor.values.isEmpty)
    model.revoke()
  }

  func testMetadataIsSavedBeforeSecretsAndARefusedSecretKeepsTheFormOpen() async throws {
    let store = DetailStore()
    let model = CredentialEditorModel(
      detail: store.detail, secrets: ["password": "old", "note": ""], store: store, generation: 7
    ) {}
    model.change(.title, to: "Changed")
    model.change(.password, to: "new")
    model.save()
    await settle { store.update != nil }
    XCTAssertTrue(store.secretWrites.isEmpty)
    store.update?.resume(returning: PassmanagerEntrySaveResponse(entryID: "entry"))
    store.update = nil
    await settle { store.secretSave != nil }
    XCTAssertEqual(store.secretWrites, ["password:new"])
    store.secretSave?.resume(throwing: failure("EMPTY_PAYLOAD"))
    store.secretSave = nil
    await settle { model.state == .editing }
    // The name landed and is no longer a change; the refused password still is.
    XCTAssertTrue(model.savedPartially)
    XCTAssertEqual(model.issue, "Check this field and try again.")
    XCTAssertTrue(model.isDirty)
    model.save()
    await settle { store.secretSave != nil }
    XCTAssertEqual(store.updates.count, 1)
    XCTAssertEqual(store.secretWrites, ["password:new", "password:new"])
    model.revoke()
  }

  func testCardExpiryOpensAsPrintedAndSavesTheFullYear() async throws {
    let store = DetailStore()
    let card = CredentialDetail(
      entryType: "payment_card", groupPath: "/", id: "entry",
      paymentCard: PaymentCardMetadata(
        brand: "visa", cardholderName: "Alice", expMonth: 3, expYear: 2030, last4: "1111"),
      revision: "revision-one", tagKeys: [], tags: [], title: "Card", username: "",
      websites: [], websitesEditable: false)
    let model = CredentialEditorModel(
      detail: card, secrets: ["card_pan": "4111111111111111", "card_cvv": "123", "note": ""],
      store: store, generation: 7
    ) {}
    XCTAssertEqual(model.value(.month), "03")
    XCTAssertEqual(model.value(.year), "30")
    model.change(.month, to: "34")
    model.change(.year, to: "203")
    model.save()
    XCTAssertEqual(model.focus, .month)
    XCTAssertNotNil(model.errors[.year])
    XCTAssertTrue(store.updates.isEmpty)
    model.change(.month, to: "6")
    model.change(.year, to: "35")
    model.save()
    await settle { store.update != nil }
    XCTAssertEqual(store.updates.first?.expMonth, 6)
    XCTAssertEqual(store.updates.first?.expYear, 2035)
    XCTAssertTrue(store.secretWrites.isEmpty)
    model.revoke()
  }

  private func failure(_ code: String) -> Error {
    do {
      _ = try JSONDecoder().decode(
        RPCResult<CredentialDetail>.self,
        from: Data("{\"ok\":false,\"error\":\"synthetic\",\"code\":\"\(code)\"}".utf8)
      ).value
    } catch { return error }
    return CredentialStoreError.invalidPage
  }
  private func settle(_ condition: () -> Bool) async {
    for _ in 0..<2000 {
      if condition() { return }
      await Task.yield()
    }
    XCTFail("Expected detail/editor transition")
  }
}

@MainActor
private final class DetailStore: CredentialStore {
  let tag = CredentialTagSummary(colorID: "blue", count: 1, key: "work", label: "Work")
  func tagPage(offset: UInt32, generation: UInt64) async throws -> PassmanagerTagPageResponse {
    return PassmanagerTagPageResponse(nextOffset: nil, tags: [tag])
  }
  func saveTag(sourceKey: String?, label: String, colorID: String, generation: UInt64) async throws
    -> CredentialTagSummary
  { throw CredentialStoreError.invalidPage }
  func deleteTag(key: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }

  let detail = CredentialDetail(
    entryType: "login", groupPath: "/Team", id: "entry", paymentCard: nil,
    revision: "revision-one", tagKeys: ["work"], tags: ["Work"], title: "Original",
    username: "alice",
    websites: ["https://example.org"], websitesEditable: false)
  var detailReads = 0
  var secretReads = 0
  var updates: [PassmanagerEntryUpdateRequest] = []
  var secretWrites: [String] = []
  /// Secrets answered at once; a type left out waits on `secretRead`.
  var stored: [String: String] = [:]
  var secretRead: CheckedContinuation<String, Error>?
  var secretSave: CheckedContinuation<Void, Error>?
  var update: CheckedContinuation<PassmanagerEntrySaveResponse, Error>?
  var page: CheckedContinuation<Data, Error>?
  func deleteCredential(id: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }

  func credentialDetail(id: String, generation: UInt64) async throws -> CredentialDetail {
    detailReads += 1
    return detail
  }
  func updateCredential(_ request: PassmanagerEntryUpdateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  {
    updates.append(request)
    return try await withCheckedThrowingContinuation { update = $0 }
  }
  func readCredentialSecret(id: String, type: String, generation: UInt64) async throws -> String {
    secretReads += 1
    if let value = stored[type] { return value }
    return try await withCheckedThrowingContinuation { secretRead = $0 }
  }
  func saveCredentialSecret(id: String, type: String, value: String, generation: UInt64)
    async throws
  {
    secretWrites.append(type + ":" + value)
    try await withCheckedThrowingContinuation { secretSave = $0 }
  }
  func createCredential(_ request: PassmanagerEntryCreateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  { throw CredentialStoreError.invalidPage }
  func credentialPage(
    _ request: PassmanagerEntryPageRequest, generation: UInt64
  )
    async throws
    -> PassmanagerEntryPageResponse
  {
    let bytes: Data = try await withCheckedThrowingContinuation { page = $0 }
    return try JSONDecoder().decode(PassmanagerEntryPageResponse.self, from: bytes)
  }
}
