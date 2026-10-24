import AirPresentation
import ChromVoidBridge
import Foundation
import XCTest

@MainActor
final class WebsiteEditorModelTests: XCTestCase {
  func testDraftErrorsFocusOriginalRowAndApplyNormalizedRulesWithoutUpdatingEntry() async throws {
    let store = WebsiteTestStore()
    var applied: [CredentialWebsiteRule] = []
    let model = WebsiteEditorModel(store: store, generation: 7) { applied = $0 }
    model.add()
    model.add()
    let row = try XCTUnwrap(model.rows.last)
    model.change(row.id, value: "[", mode: "regex")
    store.result = PassmanagerWebsiteResult(
      errors: [WebsiteRuleError(code: "invalid_regex", index: 1)], revision: nil, rules: [])
    await model.save()?.value
    XCTAssertEqual(model.state, .editing)
    XCTAssertEqual(model.focus, row.id)
    XCTAssertNotNil(model.errors[row.id])
    model.change(row.id, value: "[")  // Focus may re-emit unchanged native input.
    model.change(row.id, mode: "regex")
    XCTAssertNotNil(model.errors[row.id])
    XCTAssertEqual(model.rows.last?.value, "[")
    XCTAssertTrue(applied.isEmpty)
    model.change(row.id, value: "^https://example")
    store.result = PassmanagerWebsiteResult(
      errors: [], revision: nil,
      rules: [
        CredentialWebsiteRule(matchMode: "regex", sourceIndex: nil, value: "^https://example")
      ])
    await model.save()?.value
    XCTAssertEqual(applied.first?.matchMode, "regex")
    XCTAssertEqual(model.state, .saved)
    XCTAssertTrue(model.rows.isEmpty)
    XCTAssertTrue(store.updates.isEmpty)
    XCTAssertEqual(store.generations, [7, 7])
  }

  func testExistingRulesKeepIdentityDuringReorderAndConflictsRequireReload() async throws {
    let store = WebsiteTestStore()
    store.result = PassmanagerWebsiteResult(
      errors: [], revision: "revision-1",
      rules: [
        CredentialWebsiteRule(matchMode: "regex", sourceIndex: 0, value: "(?=legacy)legacy"),
        CredentialWebsiteRule(matchMode: "host", sourceIndex: 1, value: "example.org"),
      ])
    let model = WebsiteEditorModel(store: store, generation: 3, entryID: "login") { _ in
      XCTFail("Conflict must not apply")
    }
    await model.load()?.value
    XCTAssertFalse(model.isDirty)
    model.move(from: IndexSet(integer: 1), to: 0)
    XCTAssertTrue(model.isDirty)
    store.failure = try failure("SYNC_CONFLICT")
    await model.save()?.value
    let request = try XCTUnwrap(store.updates.first)
    XCTAssertEqual(request.entryID, "login")
    XCTAssertEqual(request.revision, "revision-1")
    XCTAssertEqual(request.rules.map(\.sourceIndex), [1, 0])
    XCTAssertEqual(request.rules.last?.value, "(?=legacy)legacy")
    XCTAssertEqual(model.state, .needsReload)
    XCTAssertNil(model.save())
    XCTAssertEqual(store.updates.count, 1)
    model.revoke()
    XCTAssertTrue(model.rows.isEmpty)
    XCTAssertFalse(model.isDirty)
  }

  func testDeniedSaveAllowsCorrectionButTransportUncertaintyCannotResubmit() async throws {
    let store = WebsiteTestStore()
    let model = WebsiteEditorModel(store: store, generation: 4, entryID: "login") { _ in }
    await model.load()?.value
    model.add()
    let row = try XCTUnwrap(model.rows.first)
    model.change(row.id, value: "example.com")
    store.failure = try failure("ACCESS_DENIED")
    await model.save()?.value
    XCTAssertEqual(model.state, .editing)
    XCTAssertEqual(model.rows.first?.value, "example.com")
    XCTAssertNotNil(model.issue)
    store.failure = CredentialStoreError.invalidPage
    await model.save()?.value
    XCTAssertEqual(model.state, .needsReload)
    XCTAssertNil(model.save())
    XCTAssertEqual(store.updates.count, 2)
    model.revoke()
  }

  func testRevocationPurgesDraftAndSuppressesLateResultAndDuplicateSubmission() async throws {
    let store = WebsiteTestStore()
    let started = expectation(description: "Validation entered")
    store.started = { started.fulfill() }
    var applied = false
    let model = WebsiteEditorModel(store: store, generation: 5) { _ in applied = true }
    model.add()
    let row = try XCTUnwrap(model.rows.first)
    model.change(row.id, value: "synthetic.example")
    model.requestDismiss()
    XCTAssertTrue(model.confirmingDiscard)
    model.cancelDiscard()
    XCTAssertFalse(model.confirmingDiscard)
    let task = try XCTUnwrap(model.save())
    await fulfillment(of: [started], timeout: 3)
    XCTAssertNil(model.save())
    model.revoke()
    store.pending?.resume(returning: ())
    store.pending = nil
    await task.value
    XCTAssertFalse(applied)
    XCTAssertEqual(model.state, .revoked)
    XCTAssertTrue(model.rows.isEmpty)
    XCTAssertNil(model.issue)
    XCTAssertEqual(store.generations, [5])
  }

  private func failure(_ code: String) throws -> Error {
    do {
      _ = try JSONDecoder().decode(
        RPCResult<PassmanagerWebsiteResult>.self,
        from: JSONSerialization.data(withJSONObject: ["ok": false, "code": code]))
      XCTFail("Expected failure")
      return CredentialStoreError.invalidPage
    } catch { return error }
  }
}

@MainActor
private final class WebsiteTestStore: WebsiteStore {
  var result = PassmanagerWebsiteResult(errors: [], revision: "revision-1", rules: [])
  var failure: Error?
  var updates: [PassmanagerWebsiteUpdateRequest] = []
  var generations: [UInt64] = []
  var started: (() -> Void)?
  var pending: CheckedContinuation<Void, Never>?
  func websiteRules(id: String, generation: UInt64) async throws -> PassmanagerWebsiteResult {
    result
  }
  func validateWebsites(_ rules: [CredentialWebsiteRule], generation: UInt64) async throws
    -> PassmanagerWebsiteResult
  {
    generations.append(generation)
    if let started {
      await withCheckedContinuation {
        pending = $0
        started()
      }
    }
    if let failure { throw failure }
    return result
  }
  func updateWebsites(_ request: PassmanagerWebsiteUpdateRequest, generation: UInt64) async throws
    -> PassmanagerWebsiteResult
  {
    updates.append(request)
    generations.append(generation)
    if let failure { throw failure }
    return result
  }
}
