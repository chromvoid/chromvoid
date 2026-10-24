import AirPresentation
import ChromVoidBridge
import Foundation
import XCTest

final class NativeNoteCreationTests: XCTestCase {
  @MainActor
  func testNotesUseTheCatalogAndCreateOnlyWriterWithoutChangingPreviousDocuments() async throws {
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
    try await client.unlock(password: "air-notes-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    try await client.createFolder(name: "Notebook", parent: "/", generation: generation)
    try await client.createFolder(name: "Nested", parent: "/Notebook", generation: generation)
    let line = "# План\n- [ ] Проверить маршрут\n"
    let content = String(
      repeating: line, count: Int(client.fileTransferLimits.writeChunkBytes) / line.utf8.count + 2)
    let saved = try await client.createNote(
      name: "Daily.md", text: content, parent: "/Notebook", generation: generation)
    let empty = try await client.createNote(
      name: "Empty.md", text: "", parent: "/Notebook/Nested", generation: generation)
    XCTAssertEqual(empty.size, 0)
    XCTAssertTrue(empty.completed)
    let ordinary = try client.beginFileWrite(
      AirFileWriteTarget(
        parentPath: "/Notebook", name: "plain.txt", mimeType: "text/plain", byteCount: 0),
      generation: generation)
    _ = try await ordinary.finish()
    do {
      _ = try await client.createNote(
        name: "Daily.md", text: "Replacement", parent: "/Notebook", generation: generation)
      XCTFail("A new note cannot replace an existing document")
    } catch let failure as RPCFailure { XCTAssertEqual(failure.code, "NAME_EXIST") }
    let reader = try client.beginFileRead(nodeID: UInt64(saved.nodeID), generation: generation)
    defer { try? reader.cancel() }
    var bytes = Data()
    while bytes.count < content.utf8.count {
      let chunk = try await reader.read(
        offset: UInt64(bytes.count), length: client.fileTransferLimits.readChunkBytes)
      XCTAssertFalse(chunk.bytes.isEmpty)
      if chunk.bytes.isEmpty { break }
      bytes.append(chunk.bytes)
    }
    XCTAssertEqual(bytes, Data(content.utf8))
    let files = FilesModel(
      store: client, imports: client, generation: generation, path: "/Notebook")
    defer { files.revoke() }
    files.setNotesOnly(true)
    await files.reload()?.value
    XCTAssertEqual(files.items.map(\.name), ["Daily.md", "Empty.md"])
    XCTAssertEqual(files.items.map(\.parentPath), ["/Notebook", "/Notebook/Nested"])
    files.createNote()
    let canceled = try XCTUnwrap(files.creatingNote)
    canceled.setName("Daily")
    canceled.setText("Must not replace the previous note")
    files.dismissNote()
    await files.reload()?.value
    XCTAssertEqual(files.items.map(\.nodeID), [saved.nodeID, empty.nodeID])
    XCTAssertEqual(canceled.text, "")
    let first = try await reader.read(offset: 0, length: UInt64(line.utf8.count))
    XCTAssertEqual(first.bytes, Data(line.utf8))
    files.setNotesOnly(false)
    await files.reload()?.value
    XCTAssertEqual(files.items.map(\.name), ["Nested", "Daily.md", "plain.txt"])
  }
}
