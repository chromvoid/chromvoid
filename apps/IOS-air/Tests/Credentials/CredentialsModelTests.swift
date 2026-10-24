import AirPresentation
import ChromVoidBridge
import Foundation
import XCTest

@MainActor
final class CredentialsModelTests: XCTestCase {
  func testExportOwnsItsSheetAndParentRevokesIt() throws {
    let model = CredentialsModel(store: PendingCredentialStore(), generation: 7)
    model.beginExport()
    let export = try XCTUnwrap(model.exporting)
    model.beginImport()
    model.beginClear()
    model.beginCreation()
    model.select("existing")
    XCTAssertNil(model.importing)
    XCTAssertNil(model.clearing)
    XCTAssertNil(model.creation)
    XCTAssertNil(model.selected)
    model.revoke()
    XCTAssertEqual(export.state, .revoked)
    XCTAssertNil(model.exporting)
  }

  func testImportOwnsItsSheetRefreshesCatalogAndIsRevokedByParent() async throws {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 7)
    defer { model.revoke() }
    model.search("old filter")
    await pending(store, count: 1)
    store.finish(0, page: page(["old"]))
    await settle { model.state == .ready }
    model.beginImport()
    let importer = try XCTUnwrap(model.importing)
    model.beginClear()
    model.beginCreation()
    model.select("old")
    XCTAssertNil(model.clearing)
    XCTAssertNil(model.creation)
    XCTAssertNil(model.selected)
    importer.chooseFile()
    await importer.receiveFile(.success(URL(fileURLWithPath: "/synthetic.json")))?.value
    XCTAssertEqual(importer.state, .review)
    await importer.requestImport()?.value
    XCTAssertEqual(importer.state, .finished)
    await pending(store, count: 2)
    XCTAssertEqual(store.requests[1].query, "")
    store.finish(1, page: page(["imported"]))
    await settle { model.state == .ready }
    model.endImport()
    XCTAssertNil(model.importing)
    model.beginImport()
    let next = try XCTUnwrap(model.importing)
    model.revoke()
    XCTAssertEqual(next.state, .revoked)
    XCTAssertNil(model.importing)
  }

  func testClearRefreshesWholeCatalogAndParentRevokesItsChild() async throws {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 7)
    defer { model.revoke() }
    model.search("old filter")
    await pending(store, count: 1)
    store.finish(0, page: page(["old"]))
    await settle { model.state == .ready }
    model.beginClear()
    let clear = try XCTUnwrap(model.clearing)
    model.beginCreation()
    model.select("old")
    model.search("blocked change")
    XCTAssertNil(model.creation)
    XCTAssertNil(model.selected)
    XCTAssertEqual(model.query, "old filter")
    clear.requestClear()
    await clear.confirmClear()?.value
    XCTAssertEqual(clear.state, .finished)
    XCTAssertEqual(store.clearGenerations, [7])
    await pending(store, count: 2)
    XCTAssertEqual(store.requests[1].query, "")
    XCTAssertNil(store.requests[1].groupPath)
    store.finish(1, page: page([]))
    await settle { model.state == .ready }
    XCTAssertTrue(model.entries.isEmpty)
    model.endClear()
    XCTAssertNil(model.clearing)
    model.beginClear()
    let revoked = try XCTUnwrap(model.clearing)
    model.revoke()
    XCTAssertEqual(revoked.state, .revoked)
    XCTAssertNil(model.clearing)
  }

  func testAuditPagesFiltersFailuresAndRevocationKeepOneCurrentSnapshot() async throws {
    let store = PendingCredentialStore()
    let model = CredentialAuditModel(store: store, generation: 7)
    defer { model.revoke() }
    let first = try XCTUnwrap(model.reload())
    await settle { store.auditRequests.count == 1 }
    XCTAssertEqual(store.auditRequests[0].0.offset, 0)
    XCTAssertNil(store.auditRequests[0].0.revision)
    store.finishAudit(0, page: auditPage(["one"], next: 1))
    await first.value
    XCTAssertEqual(model.counts?.reused, 2)
    let more = try XCTUnwrap(model.loadMore())
    await settle { store.auditRequests.count == 2 }
    XCTAssertEqual(store.auditRequests[1].0.revision, String(repeating: "a", count: 64))
    store.finishAudit(1, page: auditPage(["two"]))
    await more.value
    XCTAssertEqual(model.rows.map { $0.credential.id }, ["one", "two"])
    XCTAssertFalse(model.canLoadMore)

    let old = try XCTUnwrap(model.reload())
    await settle { store.auditRequests.count == 3 }
    model.setFilter(.reused)
    await settle { store.auditRequests.count == 4 }
    XCTAssertEqual(store.auditRequests[3].0.issue, "reused")
    XCTAssertNil(store.auditRequests[3].0.revision)
    store.finishAudit(2, page: auditPage(["stale"]))
    await old.value
    XCTAssertTrue(model.rows.isEmpty)
    store.finishAudit(3, page: auditPage(["current"], next: 1))
    await settle { model.state == .ready }
    let conflict = try XCTUnwrap(model.loadMore())
    await settle { store.auditRequests.count == 5 }
    store.auditRequests[4].1.resume(throwing: CredentialStoreError.catalogChanged)
    await conflict.value
    XCTAssertEqual(model.state, .stale)
    XCTAssertTrue(model.rows.isEmpty)
    XCTAssertNil(model.counts)

    let retry = try XCTUnwrap(model.reload())
    await settle { store.auditRequests.count == 6 }
    store.finishAudit(5, page: auditPage(["valid"], next: 1))
    await retry.value
    let duplicate = try XCTUnwrap(model.loadMore())
    await settle { store.auditRequests.count == 7 }
    store.finishAudit(6, page: auditPage(["valid"]))
    await duplicate.value
    XCTAssertEqual(model.state, .failed)
    XCTAssertTrue(model.rows.isEmpty)

    let revoked = try XCTUnwrap(model.reload())
    await settle { store.auditRequests.count == 8 }
    model.revoke()
    store.finishAudit(7, page: auditPage(["late"]))
    await revoked.value
    XCTAssertEqual(model.state, .revoked)
    XCTAssertTrue(model.rows.isEmpty)
    XCTAssertNil(model.counts)
    XCTAssertNil(model.reload())
  }

  private func auditPage(_ ids: [String], next: Int? = nil) -> PassmanagerSecurityAuditPageResponse
  {
    PassmanagerSecurityAuditPageResponse(
      algorithmVersion: 1,
      entries: page(ids).entries.map {
        CredentialSecurityAuditRow(
          audit: CredentialAuditEntrySummary(
            entryID: $0.id, hasTwoFactor: false, reusedPassword: true, strengthScore: 1,
            weakPassword: true), credential: $0)
      }, failedCount: 0, nextOffset: next, reusedPasswordCount: 2,
      revision: String(repeating: "a", count: 64), totalCount: 2, twoFactorCount: 0,
      weakPasswordCount: 2)
  }

  func testSelectionSurvivesPagingAndInvalidationButEndsWhenSearchScopeChanges() async throws {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 7)
    defer { model.revoke() }
    let first = try XCTUnwrap(model.reload())
    await pending(store, count: 1)
    store.finish(0, page: page(["one"], next: 50))
    await first.value
    model.beginSelection()
    let selection = try XCTUnwrap(model.selection)
    selection.toggle(try XCTUnwrap(model.entries.first))
    model.loadMore()
    await pending(store, count: 2)
    store.finish(1, page: page(["two"]))
    await settle { !model.loadingMore }
    selection.toggle(try XCTUnwrap(model.entries.last))
    XCTAssertEqual(selection.chosen.map(\.id), ["one", "two"])
    let refresh = try XCTUnwrap(model.reload())
    await pending(store, count: 3)
    store.finish(2, page: page(["two"]))
    await refresh.value
    XCTAssertEqual(selection.chosen.map(\.id), ["one", "two"])
    XCTAssertTrue(model.selection === selection)
    model.search("new scope")
    XCTAssertNil(model.selection)
    XCTAssertEqual(selection.state, .revoked)
    XCTAssertTrue(selection.chosen.isEmpty)
    await pending(store, count: 4)
    store.finish(3, page: page(["new"]))
    await settle { model.state == .ready }
    model.beginSelection()
    let revoked = try XCTUnwrap(model.selection)
    model.revoke()
    XCTAssertNil(model.selection)
    XCTAssertEqual(revoked.state, .revoked)
  }

  func testPagingAndSearchDiscardSupersededResults() async throws {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 7)
    defer { model.revoke() }
    model.synchronize(sequence: 1)
    await pending(store, count: 1)
    XCTAssertEqual(store.requests[0].generation, 7)
    store.finish(0, page: page(["first"], next: 50))
    await settle { model.state == .ready }
    XCTAssertTrue(model.canLoadMore)
    model.loadMore()
    await pending(store, count: 2)
    XCTAssertEqual(store.requests[1].offset, 50)
    model.search("новое")
    await pending(store, count: 3)
    XCTAssertTrue(model.entries.isEmpty)
    XCTAssertEqual(store.requests[2].offset, 0)
    XCTAssertEqual(store.requests[2].query, "новое")
    store.finish(2, page: page(["current"]))
    await settle { model.state == .ready }
    store.finish(1, page: page(["obsolete"]))
    await Task.yield()
    XCTAssertEqual(model.entries.map(\.id), ["current"])
    XCTAssertFalse(model.canLoadMore)
  }

  func testRevocationPurgesMetadataAndRejectsLateRead() async {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 4)
    model.synchronize(sequence: 1)
    await pending(store, count: 1)
    model.revoke()
    store.finish(0, page: page(["private-title"]))
    await Task.yield()
    XCTAssertEqual(model.state, .revoked)
    XCTAssertTrue(model.entries.isEmpty)
    XCTAssertEqual(model.query, "")
    model.reload()
    model.search("forbidden")
    XCTAssertEqual(store.requests.count, 1)
  }

  func testInvalidationRestartsPagingAndFailureIsNotEmptySuccess() async {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 4)
    defer { model.revoke() }
    model.synchronize(sequence: 1)
    await pending(store, count: 1)
    store.finish(0, page: page(["old"], next: 50))
    await settle { model.state == .ready }
    model.synchronize(sequence: 2)
    XCTAssertTrue(model.entries.isEmpty)
    await pending(store, count: 2)
    store.fail(1)
    await settle { model.state == .failed }
    XCTAssertNotEqual(model.state, .ready)
    model.reload()
    await pending(store, count: 3)
    store.finish(2, page: page([]))
    await settle { model.state == .ready }
    XCTAssertTrue(model.entries.isEmpty)
    model.synchronize(sequence: 2)
    XCTAssertEqual(store.requests.count, 3)
  }

  func testPageAppendAndNonAdvancingCursorFailWithoutDuplicateRows() async {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 1)
    defer { model.revoke() }
    model.synchronize(sequence: 1)
    await pending(store, count: 1)
    store.finish(0, page: page(["one"], next: 50))
    await settle { model.state == .ready }
    model.loadMore()
    await pending(store, count: 2)
    store.finish(1, page: page(["two"], next: 100))
    await settle { !model.loadingMore }
    XCTAssertEqual(model.entries.map(\.id), ["one", "two"])
    model.loadMore()
    await pending(store, count: 3)
    store.finish(2, page: page(["three"], next: 100))
    await settle { model.state == .failed }
    XCTAssertEqual(model.entries.map(\.id), ["one", "two"])
  }

  func testUncertainCreationClosesIntoUnfilteredAuthoritativeCatalog() async {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 3)
    defer { model.revoke() }
    model.search("unrelated query")
    await pending(store, count: 1)
    store.finish(0, page: page([]))
    await settle { model.state == .ready }
    model.beginCreation()
    let draft = model.creation
    draft?.change(.title, to: "Synthetic creation")
    draft?.save()
    await settle { draft?.state == .uncertain }
    model.endCreation()
    XCTAssertEqual(model.query, "")
    XCTAssertEqual(draft?.state, .revoked)
    XCTAssertNil(model.creation)
    await pending(store, count: 2)
    XCTAssertEqual(store.requests[1].query, "")
    store.finish(1, page: page(["committed-before-uncertainty"]))
    await settle { model.state == .ready }
    XCTAssertEqual(model.entries.map(\.id), ["committed-before-uncertainty"])
  }

  func testOrderingAndTypeFilterRestartPagesAndIgnoreSupersededReplies() async throws {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 7)
    defer { model.revoke() }
    let first = try XCTUnwrap(model.reload())
    await pending(store, count: 1)
    store.finish(0, page: page(["old"], next: 50))
    await first.value
    let sorting = try XCTUnwrap(model.setSort(.modified))
    await pending(store, count: 2)
    XCTAssertEqual(store.requests[1].sort, "modified")
    XCTAssertEqual(store.requests[1].offset, 0)
    let filtering = try XCTUnwrap(model.filterKind(.paymentCard))
    await pending(store, count: 3)
    XCTAssertEqual(store.requests[2].entryType, "payment_card")
    store.finish(2, page: page(["current"]))
    await filtering.value
    store.finish(1, page: page(["obsolete"]))
    await sorting.value
    XCTAssertEqual(model.entries.map(\.id), ["current"])
    let descending = try XCTUnwrap(model.setDescending(true))
    await pending(store, count: 4)
    XCTAssertTrue(store.requests[3].descending)
    XCTAssertEqual(store.requests[3].sort, "modified")
    XCTAssertEqual(store.requests[3].entryType, "payment_card")
    model.revoke()
    store.finish(3, page: page(["late"]))
    await descending.value
    XCTAssertTrue(model.entries.isEmpty)
    XCTAssertEqual(model.sort, .name)
    XCTAssertEqual(model.kind, .all)
    XCTAssertFalse(model.descending)
    XCTAssertNil(model.setSort(.created))
  }

  func testTagBrowserPausesCatalogReadsUntilReturning() async throws {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 7)
    defer { model.revoke() }
    let old = try XCTUnwrap(model.reload())
    await pending(store, count: 1)
    model.beginTags()
    model.synchronize(sequence: 42)
    store.finish(0, page: page(["obsolete"]))
    await old.value
    XCTAssertTrue(model.entries.isEmpty)
    XCTAssertEqual(store.requests.count, 1)
    model.endTags()
    await pending(store, count: 2)
    store.finish(1, page: page(["current"]))
    await settle { model.state == .ready }
    XCTAssertEqual(model.entries.map(\.id), ["current"])
  }

  func testQuickFiltersComposeAcrossPagesClearOnlyFiltersAndRejectLateReplies() async throws {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 12)
    defer { model.revoke() }
    model.search("работа")
    await pending(store, count: 1)
    store.finish(0, page: page(["one"]))
    await settle { model.state == .ready }
    model.filterGroup("/Team")
    await pending(store, count: 2)
    store.finish(1, page: page(["one"]))
    await settle { model.state == .ready }
    let sort = try XCTUnwrap(model.setSort(.modified))
    await pending(store, count: 3)
    store.finish(2, page: page(["one"]))
    await sort.value
    model.beginSelection()
    let selection = try XCTUnwrap(model.selection)
    selection.toggle(try XCTUnwrap(model.entries.first))
    let recent = try XCTUnwrap(model.setQuickFilter(.recent, enabled: true))
    XCTAssertEqual(selection.state, .revoked)
    XCTAssertNil(model.selection)
    await pending(store, count: 4)
    let otp = try XCTUnwrap(model.setQuickFilter(.otp, enabled: true))
    await pending(store, count: 5)
    XCTAssertNil(model.setQuickFilter(.otp, enabled: true))
    XCTAssertEqual(store.requests[4].quickFilters, ["recent", "otp"])
    XCTAssertEqual(store.requests[4].offset, 0)
    XCTAssertEqual(store.requests[4].query, "работа")
    XCTAssertEqual(store.requests[4].groupPath, "/Team")
    XCTAssertEqual(store.requests[4].sort, "modified")
    store.finish(4, page: page(["current"], next: 50))
    await otp.value
    store.finish(3, page: page(["obsolete"]))
    await recent.value
    XCTAssertEqual(model.entries.map(\.id), ["current"])
    model.loadMore()
    await pending(store, count: 6)
    XCTAssertEqual(store.requests[5].quickFilters, ["recent", "otp"])
    XCTAssertEqual(store.requests[5].offset, 50)
    let clear = try XCTUnwrap(model.clearFilters())
    await pending(store, count: 7)
    XCTAssertEqual(store.requests[6].quickFilters, [])
    XCTAssertEqual(store.requests[6].groupPath, "/Team")
    XCTAssertEqual(store.requests[6].query, "работа")
    XCTAssertEqual(store.requests[6].sort, "modified")
    XCTAssertFalse(model.hasFilters)
    store.finish(5, page: page(["obsolete-next-page"]))
    store.finish(6, page: page(["unfiltered"]))
    await clear.value
    XCTAssertEqual(model.entries.map(\.id), ["unfiltered"])
    let revoked = try XCTUnwrap(model.setQuickFilter(.ssh, enabled: true))
    await pending(store, count: 8)
    model.revoke()
    store.finish(7, page: page(["late"]))
    await revoked.value
    XCTAssertTrue(model.quickFilters.isEmpty)
    XCTAssertTrue(model.entries.isEmpty)
    XCTAssertNil(model.setQuickFilter(.recent, enabled: true))
    XCTAssertNil(model.clearFilters())
  }

  func testGroupingMergesPagesAndKeepsItsTimeAnchorUntilReload() async throws {
    let store = PendingCredentialStore()
    let model = CredentialsModel(store: store, generation: 8)
    defer { model.revoke() }
    let first = try XCTUnwrap(model.reload())
    await pending(store, count: 1)
    store.finish(0, page: page(["one"]))
    await first.value
    model.beginSelection()
    let selection = try XCTUnwrap(model.selection)
    let website = try XCTUnwrap(model.setGrouping(.website))
    XCTAssertEqual(selection.state, .revoked)
    XCTAssertNil(model.selection)
    await pending(store, count: 2)
    XCTAssertEqual(store.requests[1].groupBy, "website")
    XCTAssertNil(store.requests[1].groupingTime)
    store.finish(1, page: page(["one"], next: 50, groupKey: "example.com"))
    await website.value
    model.loadMore()
    await pending(store, count: 3)
    store.finish(2, page: page(["two"], groupKey: "example.com"))
    await settle { !model.loadingMore }
    XCTAssertEqual(model.sections.map(\.id), ["example.com"])
    XCTAssertEqual(model.sections.first?.entries.map(\.id), ["one", "two"])
    XCTAssertEqual(model.sections.first?.title, .verbatim("example.com"))
    let modified = try XCTUnwrap(model.setGrouping(.modified))
    await pending(store, count: 4)
    let anchor = try XCTUnwrap(store.requests[3].groupingTime)
    XCTAssertGreaterThan(anchor, 0)
    store.finish(3, page: page(["today"], next: 50, groupKey: "today"))
    await modified.value
    model.loadMore()
    await pending(store, count: 5)
    XCTAssertEqual(store.requests[4].groupingTime, anchor)
    XCTAssertEqual(store.requests[4].groupBy, "modified")
    store.finish(4, page: page(["older"], groupKey: "older"))
    await settle { !model.loadingMore }
    XCTAssertEqual(model.sections.map(\.id), ["today", "older"])
    let filtering = try XCTUnwrap(model.setQuickFilter(.otp, enabled: true))
    await pending(store, count: 6)
    store.finish(5, page: page(["otp"], groupKey: "today"))
    await filtering.value
    let clearing = try XCTUnwrap(model.clearFilters())
    await pending(store, count: 7)
    XCTAssertEqual(store.requests[6].groupBy, "modified")
    XCTAssertEqual(model.grouping, .modified)
    store.finish(6, page: page(["today"], groupKey: "today"))
    await clearing.value
    let stale = try XCTUnwrap(model.setGrouping(.security))
    await pending(store, count: 8)
    let current = try XCTUnwrap(model.setGrouping(.none))
    await pending(store, count: 9)
    store.finish(7, page: page(["obsolete"], groupKey: "otp"))
    await stale.value
    store.finish(8, page: page(["current"]))
    await current.value
    XCTAssertEqual(model.entries.map(\.id), ["current"])
    XCTAssertNil(model.sections.first?.title)
    let invalid = try XCTUnwrap(model.setGrouping(.security))
    await pending(store, count: 10)
    store.finish(9, page: page(["invalid-missing-group-key"]))
    await invalid.value
    XCTAssertEqual(model.state, .failed)
    XCTAssertTrue(model.sections.isEmpty)
    let revoked = try XCTUnwrap(model.reload())
    await pending(store, count: 11)
    model.revoke()
    store.finish(10, page: page(["late"], groupKey: "otp"))
    await revoked.value
    XCTAssertEqual(model.grouping, .none)
    XCTAssertTrue(model.sections.isEmpty)
    XCTAssertNil(model.setGrouping(.website))
  }

  private func page(_ ids: [String], next: Int? = nil, groupKey: String? = nil)
    -> PassmanagerEntryPageResponse
  {
    PassmanagerEntryPageResponse(
      entries: ids.map {
        CredentialSummary(
          entryType: "login", groupKey: groupKey, groupPath: "/", hasCodes: false, iconRef: nil,
          id: $0, title: $0,
          username: "synthetic", website: nil)
      }, nextOffset: next, totalCount: nil)
  }

  private func pending(_ store: PendingCredentialStore, count: Int) async {
    await settle { store.requests.count == count }
  }

  private func settle(_ condition: () -> Bool) async {
    for _ in 0..<2000 {
      if condition() { return }
      await Task.yield()
    }
    XCTFail("Expected model transition did not arrive")
  }
}

@MainActor
private final class PendingCredentialStore: CredentialStore {
  func reviewCredentialFile(
    _ url: URL, mode: AirImportMode, generation: UInt64, sourcePassword: String?
  ) async throws
    -> any CredentialImportReview
  {
    ModelImportReview()
  }

  var clearGenerations: [UInt64] = []
  func clearCredentials(generation: UInt64) async throws { clearGenerations.append(generation) }

  var auditRequests: [(PassmanagerSecurityAuditPageRequest, CheckedContinuation<Data, Error>)] = []
  func securityAuditPage(_ request: PassmanagerSecurityAuditPageRequest, generation: UInt64)
    async throws -> PassmanagerSecurityAuditPageResponse
  {
    let data: Data = try await withCheckedThrowingContinuation {
      auditRequests.append((request, $0))
    }
    return try JSONDecoder().decode(PassmanagerSecurityAuditPageResponse.self, from: data)
  }
  func finishAudit(_ index: Int, page: PassmanagerSecurityAuditPageResponse) {
    do { auditRequests[index].1.resume(returning: try JSONEncoder().encode(page)) } catch {
      auditRequests[index].1.resume(throwing: error)
    }
  }

  func tagPage(offset: UInt32, generation: UInt64) async throws -> PassmanagerTagPageResponse {
    throw CredentialStoreError.invalidPage
  }
  func saveTag(sourceKey: String?, label: String, colorID: String, generation: UInt64) async throws
    -> CredentialTagSummary
  { throw CredentialStoreError.invalidPage }
  func deleteTag(key: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }

  func deleteCredential(id: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }

  func credentialDetail(id: String, generation: UInt64) async throws -> CredentialDetail {
    throw CredentialStoreError.invalidPage
  }
  func updateCredential(_ request: PassmanagerEntryUpdateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  { throw CredentialStoreError.invalidPage }
  func readCredentialSecret(id: String, type: String, generation: UInt64) async throws -> String {
    throw CredentialStoreError.invalidPage
  }
  func saveCredentialSecret(id: String, type: String, value: String, generation: UInt64)
    async throws
  { throw CredentialStoreError.invalidPage }

  struct Request {
    let offset: UInt32
    let query: String
    let sort: String?
    let descending: Bool
    let entryType: String?
    let groupPath: String?
    let quickFilters: [String]
    let groupBy: String?
    let groupingTime: Int?
    let generation: UInt64
    let continuation: CheckedContinuation<Data, Error>
  }
  var requests: [Request] = []

  func createCredential(_ request: PassmanagerEntryCreateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  {
    throw CredentialStoreError.invalidPage
  }

  func credentialPage(
    _ request: PassmanagerEntryPageRequest, generation: UInt64
  )
    async throws
    -> PassmanagerEntryPageResponse
  {
    let bytes: Data = try await withCheckedThrowingContinuation { continuation in
      requests.append(
        Request(
          offset: UInt32(request.offset), query: request.query, sort: request.sort,
          descending: request.descending ?? false, entryType: request.entryType,
          groupPath: request.groupPath, quickFilters: request.quickFilters ?? [],
          groupBy: request.groupBy, groupingTime: request.groupingTime, generation: generation,
          continuation: continuation))
    }
    return try JSONDecoder().decode(PassmanagerEntryPageResponse.self, from: bytes)
  }

  func finish(_ index: Int, page: PassmanagerEntryPageResponse) {
    do {
      requests[index].continuation.resume(returning: try JSONEncoder().encode(page))
    } catch {
      requests[index].continuation.resume(throwing: error)
    }
  }
  func fail(_ index: Int) {
    requests[index].continuation.resume(throwing: CredentialStoreError.invalidPage)
  }
}

@MainActor
private final class ModelImportReview: CredentialImportReview {
  let preview = PassmanagerRootImportPreview(
    createdEntryCount: nil, entryCount: 1, folderCount: 0, mode: "merge", revision: "opaque",
    source: nil, sshKeyCount: 0,
    updatedEntryCount: nil, warnings: nil)
  func commit() async throws {}
  func cancel() {}
}
