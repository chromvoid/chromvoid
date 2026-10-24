import ChromVoidBridge
import Foundation
import XCTest

final class NativeDocumentLinkTests: XCTestCase {
  @MainActor
  func testNativeDocumentLinksUseTheRealCatalogAndRejectLockedAccess() async throws {
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
    try await client.unlock(password: "air-links-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let source = try await client.createNote(
      name: "Origin.md", text: "# Origin", parent: "/", generation: generation)
    let sibling = try await client.createNote(
      name: "Sibling.md", text: "# Sibling", parent: "/", generation: generation)
    let result = try await client.resolveDocumentLink(
      nodeID: UInt64(source.nodeID), path: "Sibling", kind: .note, generation: generation)
    XCTAssertEqual(result.kind, .found)
    XCTAssertEqual(result.item?.nodeID, sibling.nodeID)
    XCTAssertEqual(result.item?.path, "/Sibling.md")
    let missing = try await client.resolveDocumentLink(
      nodeID: UInt64(source.nodeID), path: "Absent", kind: .note, generation: generation)
    XCTAssertEqual(missing.kind, .missing)
    _ = try client.lock()
    do {
      _ = try await client.resolveDocumentLink(
        nodeID: UInt64(source.nodeID), path: "Sibling", kind: .note, generation: generation)
      XCTFail("Locked access cannot resolve document metadata")
    } catch BridgeError.SessionRevoked {}
  }
}
