import ChromVoidBridge
import Foundation
import XCTest

final class NativeDocumentSaveTests: XCTestCase {
  @MainActor
  func testDocumentSavePreservesIdentityAndRejectsStaleEditorsWithoutOverwriting() async throws {
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
    try await client.unlock(password: "air-document-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let created = try await client.createNote(
      name: "Document.md", text: "Original", parent: "/", generation: generation)
    let nodeID = UInt64(created.nodeID)
    let opened = try client.beginFileRead(nodeID: nodeID, generation: generation)
    let original = try await opened.read(offset: 0, length: 64)
    let revision = UInt64(original.metadata.sourceRevision)
    let text = String(repeating: "# Заметка 📝\n- [x] Сохранено\n", count: 3000)
    let saved = try await client.saveDocument(
      nodeID: nodeID, sourceRevision: revision, text: text, generation: generation)
    XCTAssertEqual(UInt64(saved.nodeID), nodeID)
    XCTAssertGreaterThan(UInt64(saved.sourceRevision), revision)
    XCTAssertEqual(saved.mimeType, "text/markdown")
    XCTAssertEqual(saved.size, text.utf8.count)
    do {
      _ = try await client.saveDocument(
        nodeID: nodeID, sourceRevision: revision, text: "Stale draft", generation: generation)
      XCTFail("A stale editor cannot replace the newer document")
    } catch let failure as RPCFailure { XCTAssertEqual(failure.code, "ERR_STALE_SOURCE") }
    do {
      _ = try await opened.read(offset: 0, length: 64)
      XCTFail("The old reader cannot silently mix document revisions")
    } catch let failure as RPCFailure { XCTAssertEqual(failure.code, "ERR_MEDIA_STREAM_STALE") }
    let loaded = try await client.readDocument(nodeID: nodeID, generation: generation)
    XCTAssertEqual(loaded.text, text)
    XCTAssertEqual(loaded.sourceRevision, UInt64(saved.sourceRevision))
    XCTAssertEqual(loaded.name, "Document.md")
    do {
      _ = try await client.saveDocument(
        nodeID: nodeID, sourceRevision: UInt64(saved.sourceRevision),
        text: String(repeating: "я", count: Int(client.fileTransferLimits.documentBytes) / 2 + 1),
        generation: generation)
      XCTFail("The document limit counts UTF-8 bytes")
    } catch BridgeError.InvalidFileLength {}
    let emptied = try await client.saveDocument(
      nodeID: nodeID, sourceRevision: UInt64(saved.sourceRevision), text: "",
      generation: generation)
    XCTAssertEqual(UInt64(emptied.nodeID), nodeID)
    XCTAssertEqual(emptied.size, 0)
    let empty = try await client.readDocument(nodeID: nodeID, generation: generation)
    XCTAssertTrue(empty.text.isEmpty)
    let invalid = try client.beginFileWrite(
      AirFileWriteTarget(
        parentPath: "/", name: "Invalid.txt", mimeType: "text/plain", byteCount: 2),
      generation: generation)
    _ = try await invalid.append(Data([0xFF, 0x00]))
    let invalidFile = try await invalid.finish()
    do {
      _ = try await client.readDocument(nodeID: UInt64(invalidFile.nodeID), generation: generation)
      XCTFail("Invalid UTF-8 must not become lossy editable text")
    } catch DocumentReadError.unsupportedText {}
    let large = try await client.createNote(
      name: "Large.md", text: String(repeating: "x", count: Int(client.documentByteLimit) + 1),
      parent: "/", generation: generation)
    do {
      _ = try await client.readDocument(nodeID: UInt64(large.nodeID), generation: generation)
      XCTFail("A large document must not enter the editor")
    } catch DocumentReadError.tooLarge {}
    _ = try client.lock()
    do {
      _ = try await client.saveDocument(
        nodeID: nodeID, sourceRevision: UInt64(emptied.sourceRevision), text: "Late draft",
        generation: generation)
      XCTFail("A locked editor cannot save")
    } catch BridgeError.SessionRevoked {}
  }
}
