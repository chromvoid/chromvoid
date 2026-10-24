import CryptoKit
import Foundation
import XCTest

@testable import ChromVoidBridge

final class NativeFileExportTests: XCTestCase {
  @MainActor
  func testExportCopiesExactBytesAndLockRevokesOnlyOurCopy() async throws {
    let client = try await openedClient()
    let generation = try client.snapshot().generation
    let text = String(repeating: "# Экспорт\n", count: 40_000)
    let saved = try await client.createNote(
      name: "Shared.md", text: text, parent: "/", generation: generation)
    var progress: [(UInt64, UInt64)] = []
    let copy = try await client.prepareFileExport(
      id: UInt64(saved.nodeID), generation: generation
    ) { progress.append(($0, $1)) }
    let url = try XCTUnwrap(copy.url)
    XCTAssertEqual(url.lastPathComponent, "Shared.md")
    XCTAssertEqual(copy.metadata?.nodeID, saved.nodeID)
    let bytes = try Data(contentsOf: url)
    XCTAssertEqual(SHA256.hash(data: bytes), SHA256.hash(data: Data(text.utf8)))
    XCTAssertEqual(bytes.count, text.utf8.count)
    XCTAssertGreaterThan(progress.count, 2)
    XCTAssertEqual(progress.first?.0, 0)
    XCTAssertEqual(progress.last?.0, UInt64(bytes.count))
    XCTAssertTrue(progress.allSatisfy { $0.1 == UInt64(bytes.count) })
    for pair in zip(progress, progress.dropFirst()) {
      XCTAssertGreaterThan(pair.1.0, pair.0.0)
      XCTAssertLessThanOrEqual(pair.1.0 - pair.0.0, client.fileTransferLimits.readChunkBytes)
    }
    // A second explicit export has independent ownership even for an identical filename.
    let another = try await client.prepareFileExport(
      id: UInt64(saved.nodeID), generation: generation, progress: { _, _ in })
    let secondURL = try XCTUnwrap(another.url)
    XCTAssertNotEqual(url, secondURL)
    try await copy.close()
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: secondURL.path))
    XCTAssertNil(copy.url)
    _ = try client.lock()
    XCTAssertNil(another.url)
    XCTAssertNil(another.metadata)
    try await another.close()
    XCTAssertFalse(FileManager.default.fileExists(atPath: secondURL.path))
  }

  @MainActor
  func testEmptyExportAndInterruptedPreparationLeaveNoPartialCopy() async throws {
    let client = try await openedClient()
    let generation = try client.snapshot().generation
    let empty = try await client.createNote(
      name: "Empty.md", text: "", parent: "/", generation: generation)
    let copy = try await client.prepareFileExport(
      id: UInt64(empty.nodeID), generation: generation, progress: { _, _ in })
    XCTAssertEqual(try Data(contentsOf: XCTUnwrap(copy.url)).count, 0)
    try await copy.close()
    let saved = try await client.createNote(
      name: "Long.md", text: String(repeating: "line\n", count: 40_000), parent: "/",
      generation: generation)
    let operation = Task {
      try await client.prepareFileExport(id: UInt64(saved.nodeID), generation: generation) {
        received, _ in
        if received > 0 { withUnsafeCurrentTask { $0?.cancel() } }
      }
    }
    do {
      _ = try await operation.value
      XCTFail("Canceled export cannot publish a URL")
    } catch is CancellationError {}
    XCTAssertEqual(try exportDirectories(), [])
    var observedChunk = false
    do {
      _ = try await client.prepareFileExport(id: UInt64(saved.nodeID), generation: generation) {
        received, _ in
        if received > 0 {
          observedChunk = true
          _ = try? client.lock()
        }
      }
      XCTFail("Locked export cannot publish a URL")
    } catch {}
    XCTAssertTrue(observedChunk)
    XCTAssertEqual(try exportDirectories(), [])
  }

  @MainActor
  private func openedClient() async throws -> RuntimeClient {
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
    try await client.unlock(password: "air-export-" + UUID().uuidString)
    return client
  }

  private func exportDirectories() throws -> [String] {
    try FileManager.default.contentsOfDirectory(atPath: ExportScratchFile.root.path)
  }
}
