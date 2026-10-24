import AirPresentation
import ChromVoidBridge
import Foundation
import XCTest

final class NativeFileCatalogTests: XCTestCase {
  @MainActor
  func testReviewedBatchMovePreservesConflictsAndDeleteUsesTheRemainingSelection() async throws {
    let client = try await RuntimeClient.open()
    addTeardownBlock { @MainActor in
      var snapshot = try client.close()
      while snapshot.cleanupPending {
        snapshot = try await client.events(after: snapshot.sequence).snapshot
      }
    }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-batch-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    for name in ["Alpha", "Beta", "Target"] {
      try await client.createFolder(name: name, parent: "/", generation: generation)
    }
    try await client.createFolder(name: "Alpha", parent: "/Target", generation: generation)
    let model = FilesModel(store: client, imports: client, generation: generation)
    defer { model.revoke() }
    await model.reload()?.value
    let sources = model.items.filter { $0.name != "Target" }
    XCTAssertEqual(sources.count, 2)
    model.beginSelection()
    for item in sources { model.toggleSelection(item) }
    model.operate(.move)
    let move = try XCTUnwrap(model.operation)
    let browser = try XCTUnwrap(move.browser)
    await browser.reload()?.value
    XCTAssertEqual(move.folders(in: browser).map(\.name), ["Target"])
    move.openFolder(try XCTUnwrap(move.folders(in: browser).first), in: browser)
    let target = try XCTUnwrap(browser.child)
    await target.reload()?.value
    await move.start(in: target)?.value
    XCTAssertEqual(move.completedCount, 1)
    XCTAssertEqual(
      move.items.first(where: { $0.source.name == "Alpha" })?.outcome,
      .failed("An item with that name already exists."))
    XCTAssertEqual(model.selected.values.map(\.name), ["Alpha"])
    let destination = try await client.filePage(
      request(path: "/Target", query: ""), generation: generation)
    XCTAssertEqual(destination.items.map(\.name), ["Alpha", "Beta"])
    XCTAssertEqual(
      destination.items.first(where: { $0.name == "Beta" })?.nodeID,
      sources.first(where: { $0.name == "Beta" })?.nodeID)
    model.dismissOperation()
    model.operate(.delete)
    let canceled = try XCTUnwrap(model.operation)
    model.dismissOperation()
    XCTAssertEqual(canceled.state, .revoked)
    XCTAssertEqual(model.selected.count, 1)
    model.operate(.delete)
    let deletion = try XCTUnwrap(model.operation)
    await deletion.start()?.value
    XCTAssertEqual(deletion.completedCount, 1)
    XCTAssertTrue(model.selected.isEmpty)
    let root = try await client.filePage(request(query: ""), generation: generation)
    XCTAssertEqual(root.items.map(\.name), ["Target"])
    let preserved = try await client.filePage(
      request(path: "/Target", query: ""), generation: generation)
    XCTAssertEqual(preserved.items.map(\.nodeID), destination.items.map(\.nodeID))
  }

  @MainActor
  func testFolderPaginationSearchRenameMoveAndDeleteThroughCore() async throws {
    let client = try await RuntimeClient.open()
    addTeardownBlock { @MainActor in
      var snapshot = try client.close()
      while snapshot.cleanupPending {
        snapshot = try await client.events(after: snapshot.sequence).snapshot
      }
    }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-catalog-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    for index in 0..<53 {
      try await client.createFolder(
        name: String(format: "Air%02d", index), parent: "/", generation: generation)
    }
    let first = try await client.filePage(request(), generation: generation)
    XCTAssertEqual(first.items.count, 25)
    XCTAssertEqual(first.totalCount, 53)
    XCTAssertEqual(first.items.first?.name, "Air00")
    XCTAssertEqual(first.nextOffset, 25)
    let second = try await client.filePage(
      request(offset: 25, version: first.version), generation: generation)
    XCTAssertEqual(second.items.first?.name, "Air25")
    XCTAssertFalse(second.reloadRequired)
    let selected = try XCTUnwrap(first.items.first)
    XCTAssertEqual(selected.path, "/Air00")
    try await client.renameFile(
      id: UInt64(selected.nodeID), name: "Renamed", generation: generation)
    let stale = try await client.filePage(
      request(offset: 50, version: first.version), generation: generation)
    XCTAssertTrue(stale.reloadRequired)
    XCTAssertTrue(stale.items.isEmpty)
    try await client.moveFile(id: UInt64(selected.nodeID), parent: "/Air01", generation: generation)
    let nested = try await client.filePage(
      request(path: "/Air01", query: ""), generation: generation)
    XCTAssertEqual(nested.items.map(\.name), ["Renamed"])
    XCTAssertEqual(nested.items.first?.nodeID, selected.nodeID)
    try await client.deleteFile(id: UInt64(selected.nodeID), generation: generation)
    let empty = try await client.filePage(
      request(path: "/Air01", query: ""), generation: generation)
    XCTAssertTrue(empty.items.isEmpty)
    _ = try client.lock()
    do {
      _ = try await client.filePage(request(), generation: generation)
      XCTFail("The file catalog must not remain accessible after lock")
    } catch BridgeError.SessionRevoked {}
  }

  private func request(
    path: String = "/", query: String = "Air", offset: Int = 0, version: Int? = nil
  )
    -> CatalogFolderPageRequest
  {
    CatalogFolderPageRequest(
      expectedVersion: version,
      filter: CatalogFolderFilter(
        fileTypes: [], includeHidden: false, includeTextContent: false, query: query,
        recursive: false),
      limit: 25, offset: offset, path: path, sort: CatalogFolderSort(by: "name", direction: "asc"))
  }
}
