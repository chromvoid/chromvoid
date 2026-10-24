import AirPresentation
import XCTest

@testable import ChromVoidBridge

final class NoteCreationTests: XCTestCase {
  @MainActor
  func testBlankSubmitConflictCorrectionAndConfirmedSavePreserveTheDraftContract() async throws {
    let store = TestFileCatalogStore()
    var calls: [String] = []
    store.note = { name, text, parent in
      calls.append(name)
      XCTAssertEqual(text, "# План\n- [ ] Проверить маршрут")
      XCTAssertEqual(parent, "/Notebook")
      if name == "Daily.md" { throw RPCFailure(code: "NAME_EXIST") }
      return self.saved()
    }
    var saved = 0
    let model = NoteCreationModel(store: store, parent: "/Notebook", generation: 4) { saved += 1 }
    XCTAssertNil(model.save())
    XCTAssertTrue(calls.isEmpty)
    XCTAssertEqual(model.validationRevision, 1)
    model.setName("")
    XCTAssertEqual(model.issue, "Enter a name.")
    model.setText("# План\n- [ ] Проверить маршрут")
    XCTAssertEqual(model.issue, "Enter a name.")
    model.setName("Daily")
    XCTAssertNil(model.issue)
    model.setText("# План\n- [ ] Проверить маршрут")
    await model.save()?.value
    XCTAssertEqual(model.state, .editing)
    XCTAssertEqual(model.name, "Daily")
    XCTAssertEqual(model.issue, "An item with that name already exists.")
    model.setName("Daily")
    XCTAssertEqual(model.issue, "An item with that name already exists.")
    model.setName("Next.markdown")
    let task = model.save()
    XCTAssertNil(model.save())
    await task?.value
    XCTAssertEqual(calls, ["Daily.md", "Next.markdown"])
    XCTAssertEqual(saved, 1)
    XCTAssertEqual(model.state, .revoked)
    XCTAssertEqual(model.text, "")
    XCTAssertEqual(model.parent, "")
  }

  @MainActor
  func testDraftAsksBeforeItIsDiscardedAndRefusesHiddenOrOversizedNotes() async throws {
    let store = TestFileCatalogStore()
    var calls: [String] = []
    store.note = { name, _, _ in
      calls.append(name)
      return self.saved()
    }
    let model = NoteCreationModel(store: store, parent: "/Notebook", generation: 4) {}
    XCTAssertFalse(model.isDirty)
    model.requestDismiss()
    XCTAssertFalse(model.confirmingDiscard)
    model.setText("Only the body so far")
    XCTAssertTrue(model.isDirty)
    model.requestDismiss()
    XCTAssertTrue(model.confirmingDiscard)
    model.cancelDiscard()
    XCTAssertFalse(model.confirmingDiscard)
    // A dot-name would be saved and then hidden by the catalog.
    model.setName(".plan")
    XCTAssertNil(model.save())
    XCTAssertEqual(model.issue, "A note name cannot start with a dot.")
    XCTAssertTrue(calls.isEmpty)
    model.setName("Plan")
    model.setText(String(repeating: "x", count: Int(store.documentByteLimit) + 1))
    XCTAssertNil(model.save())
    XCTAssertEqual(model.issue, "This note is too large to save. Shorten it and try again.")
    XCTAssertTrue(calls.isEmpty)
    model.setText("Small again")
    await model.save()?.value
    XCTAssertEqual(calls, ["Plan.md"])
    XCTAssertEqual(model.state, .revoked)
    XCTAssertFalse(model.confirmingDiscard)
  }

  @MainActor
  func testCancelAndLockedLateSaveCannotCreateAnotherDraftOrReloadTheCatalog() async throws {
    let store = TestFileCatalogStore()
    var writes = 0
    let entered = expectation(description: "Note write in flight")
    var pending: CheckedContinuation<Void, Never>?
    store.note = { _, _, _ in
      writes += 1
      await withCheckedContinuation {
        pending = $0
        entered.fulfill()
      }
      return self.saved()
    }
    let files = FilesModel(store: store, imports: store, generation: 4)
    await files.reload()?.value
    files.createNote()
    let canceled = try XCTUnwrap(files.creatingNote)
    canceled.setName("Canceled")
    canceled.setText("Transient text")
    files.dismissNote()
    XCTAssertEqual(writes, 0)
    XCTAssertEqual(canceled.text, "")
    files.createNote()
    let active = try XCTUnwrap(files.creatingNote)
    active.setName("Private")
    active.setText("Transient text")
    let task = active.save()
    await fulfillment(of: [entered], timeout: 2)
    files.revoke()
    let reads = store.requests.count
    try XCTUnwrap(pending).resume()
    await task?.value
    XCTAssertNil(files.creatingNote)
    XCTAssertEqual(active.state, .revoked)
    XCTAssertEqual(active.text, "")
    XCTAssertEqual(store.requests.count, reads)
    XCTAssertEqual(writes, 1)
  }

  @MainActor
  func testUncertainSaveIsNotRetriedAndNotesFilteringStaysInCore() async throws {
    let store = TestFileCatalogStore()
    var writes = 0
    store.note = { _, _, _ in
      writes += 1
      throw BridgeError.RuntimeUnavailable
    }
    let model = NoteCreationModel(store: store, parent: "/", generation: 4) {}
    model.setName("Draft")
    await model.save()?.value
    XCTAssertEqual(model.state, .uncertain)
    XCTAssertNotNil(model.issue)
    XCTAssertNil(model.save())
    XCTAssertEqual(writes, 1)
    model.revoke()
    let files = FilesModel(store: store, imports: store, generation: 4, path: "/Notebook")
    files.setQuery("plan")
    files.setNotesOnly(true)
    await files.reload()?.value
    let request = try XCTUnwrap(store.requests.last)
    XCTAssertEqual(request.path, "/Notebook")
    XCTAssertEqual(request.filter?.fileTypes, ["markdown"])
    XCTAssertEqual(request.filter?.recursive, true)
    XCTAssertEqual(request.filter?.query, "plan")
    files.setNotesOnly(false)
    await files.reload()?.value
    XCTAssertEqual(store.requests.last?.filter?.recursive, false)
    XCTAssertEqual(files.query, "plan")
    files.revoke()
  }

  private func saved() -> UploadResponse {
    UploadResponse(
      completed: true, created: true, mediaInfo: nil, mediaInspectedRevision: nil,
      mimeType: "text/markdown", modtime: nil, nodeID: 20, size: 3, sourceRevision: 1,
      uploadedBytes: 3)
  }
}
