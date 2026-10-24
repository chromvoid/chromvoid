import AirPresentation
import XCTest

@testable import ChromVoidBridge

final class FileOperationModelTests: XCTestCase {
  @MainActor
  func testSingleItemDeletionAlsoUpdatesSelectionAfterItsConfirmedWrite() async throws {
    let store = TestFileCatalogStore()
    let model = FilesModel(store: store, imports: store, generation: 4)
    let selected = item(11, "selected.txt")
    model.beginSelection()
    model.toggleSelection(selected)
    let entered = expectation(description: "Delete in flight")
    var pending: CheckedContinuation<Void, Never>?
    store.mutate = { _ in
      await withCheckedContinuation {
        pending = $0
        entered.fulfill()
      }
    }
    defer { model.revoke() }
    model.requestDelete(selected)
    model.deleteConfirmed()
    await fulfillment(of: [entered], timeout: 2)
    XCTAssertEqual(model.selected.count, 1)
    try XCTUnwrap(pending).resume()
    // The selection clears only once the write is confirmed, never while it is in flight.
    await settled { model.selected.isEmpty }
    XCTAssertTrue(model.selected.isEmpty)
  }

  @MainActor
  func testSelectionSurvivesRenamedPagesAndPartialMoveRemovesOnlyConfirmedIDs() async throws {
    let store = TestFileCatalogStore()
    let model = FilesModel(store: store, imports: store, generation: 4)
    model.beginSelection()
    model.toggleSelection(item(11, "old.txt"))
    model.toggleSelection(item(12, "other.txt"))
    store.page = { request in self.page(request, items: [self.item(11, "renamed.txt")]) }
    await model.reload()?.value
    XCTAssertEqual(model.selected[11]?.name, "renamed.txt")
    XCTAssertEqual(Set(model.selected.keys), [11, 12])
    store.mutate = { id in if id == 11 { throw RPCFailure(code: "NAME_EXIST") } }
    model.operate(.move)
    let operation = try XCTUnwrap(model.operation)
    let browser = try XCTUnwrap(operation.browser)
    store.page = { request in self.page(request, items: [self.item(20, "Target", directory: true)])
    }
    await browser.reload()?.value
    operation.openFolder(try XCTUnwrap(browser.items.first), in: browser)
    let target = try XCTUnwrap(browser.child)
    await target.reload()?.value
    await operation.start(in: target)?.value
    XCTAssertEqual(
      operation.items.map(\.outcome),
      [.failed("An item with that name already exists."), .completed])
    XCTAssertEqual(store.mutations, ["move:11:/Target", "move:12:/Target"])
    XCTAssertEqual(Set(model.selected.keys), [11])
    XCTAssertEqual(operation.completedCount, 1)
    XCTAssertEqual(model.path, "/")
    model.dismissOperation()
    model.revoke()
    XCTAssertTrue(model.selected.isEmpty)
    XCTAssertFalse(model.selecting)
  }

  @MainActor
  func testDestinationExcludesSelectedFolderIDsAndCancelDoesNotWrite() async throws {
    let store = TestFileCatalogStore()
    let selected = item(11, "Archive", directory: true)
    store.page = { request in
      self.page(
        request,
        items: [
          selected, self.item(12, "Archives", directory: true), self.item(13, "document.txt"),
        ])
    }
    let operation = FileOperationModel(
      kind: .move, items: [selected], store: store, imports: store, generation: 4
    ) { _ in }
    let browser = try XCTUnwrap(operation.browser)
    await browser.reload()?.value
    XCTAssertEqual(operation.folders(in: browser).map(\.nodeID), [12])
    operation.openFolder(selected, in: browser)
    XCTAssertNil(browser.child)
    XCTAssertNil(operation.start(in: browser))
    XCTAssertNotNil(operation.issue)
    operation.openFolder(item(12, "Archives", directory: true), in: browser)
    let child = try XCTUnwrap(browser.child)
    XCTAssertEqual(child.path, "/Archives")
    browser.closeChild()
    XCTAssertEqual(child.state, .revoked)
    operation.revoke()
    XCTAssertEqual(browser.state, .revoked)
    XCTAssertTrue(operation.items.isEmpty)
    XCTAssertTrue(store.mutations.isEmpty)
  }

  @MainActor
  func testStopWaitsForInFlightWriteRetainsConfirmedSuccessAndDoesNotStartNextItem() async throws {
    let store = TestFileCatalogStore()
    let entered = expectation(description: "Write in flight")
    var pending: CheckedContinuation<Void, Never>?
    store.mutate = { _ in
      await withCheckedContinuation {
        pending = $0
        entered.fulfill()
      }
    }
    var completed: Set<Int>?
    let operation = FileOperationModel(
      kind: .delete, items: [item(11, "first"), item(12, "second")], store: store, imports: store,
      generation: 4
    ) { completed = $0 }
    let task = operation.start()
    await fulfillment(of: [entered], timeout: 2)
    operation.stop()
    XCTAssertEqual(operation.state, .stopping)
    XCTAssertNil(completed)
    try XCTUnwrap(pending).resume()
    await task?.value
    XCTAssertEqual(operation.items.map(\.outcome), [.completed, .pending])
    XCTAssertEqual(completed, [11])
    XCTAssertEqual(store.mutations, ["delete:11"])
    operation.revoke()
  }

  @MainActor
  func testUncertainWriteStopsBatchAndLateReplyCannotRepopulateRevokedState() async throws {
    let store = TestFileCatalogStore()
    store.mutate = { _ in throw BridgeError.RuntimeUnavailable }
    let first = FileOperationModel(
      kind: .delete, items: [item(11, "first"), item(12, "second")], store: store, imports: store,
      generation: 4
    ) { _ in }
    await first.start()?.value
    XCTAssertEqual(first.items.map(\.outcome), [.uncertain, .pending])
    XCTAssertEqual(store.mutations, ["delete:11"])
    XCTAssertNil(first.start())
    first.revoke()

    let entered = expectation(description: "Write in flight")
    var pending: CheckedContinuation<Void, Never>?
    store.mutate = { _ in
      await withCheckedContinuation {
        pending = $0
        entered.fulfill()
      }
    }
    var refreshed = false
    let operation = FileOperationModel(
      kind: .delete, items: [item(21, "private")], store: store, imports: store, generation: 4
    ) { _ in refreshed = true }
    let task = operation.start()
    await fulfillment(of: [entered], timeout: 2)
    operation.revoke()
    try XCTUnwrap(pending).resume()
    await task?.value
    XCTAssertEqual(operation.state, .revoked)
    XCTAssertTrue(operation.items.isEmpty)
    XCTAssertFalse(refreshed)
  }

  private func item(_ id: Int, _ name: String, directory: Bool = false) -> CatalogListItem {
    CatalogListItem(
      createdAt: 1, isDir: directory, mediaInfo: nil, mediaInspectedRevision: 0,
      mimeType: nil, name: name, nodeID: id, parentPath: "/", path: "/" + name,
      size: directory ? nil : 1, sourceRevision: 1, updatedAt: 1)
  }
  private func page(_ request: CatalogFolderPageRequest, items: [CatalogListItem])
    -> CatalogFolderPageResponse
  {
    CatalogFolderPageResponse(
      currentPath: request.path ?? "/",
      filterCounts: CatalogFolderFilterCounts(all: items.count, images: 0, markdown: 0),
      items: items, limit: 50, nextOffset: nil, offset: request.offset ?? 0,
      reloadRequired: false, totalCount: items.count, version: 1)
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
