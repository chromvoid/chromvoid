import CryptoKit
import Foundation
import XCTest

@testable import ChromVoidBridge

final class NativeDocumentImportTests: XCTestCase {
  @MainActor
  func testSelectedDocumentsImportBytesAndRejectConflictsWithoutLosingTheNextFile() async throws {
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
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("picked.bin")
    let bytes = Data((0..<(1_024 * 1_024 + 53)).map { UInt8(truncatingIfNeeded: $0 * 17) })
    try bytes.write(to: url)
    var received: [UInt64] = []
    let saved = try await client.importFile(url, parent: "/", generation: generation) {
      done, total in
      received.append(done)
      XCTAssertEqual(total, UInt64(bytes.count))
    }
    XCTAssertEqual(received.first, 0)
    XCTAssertEqual(received.last, UInt64(bytes.count))
    XCTAssertGreaterThan(received.count, 2)
    let reader = try client.beginFileRead(nodeID: UInt64(saved.nodeID), generation: generation)
    defer { try? reader.cancel() }
    var digest = SHA256()
    var offset: UInt64 = 0
    while offset < UInt64(bytes.count) {
      let chunk = try await reader.read(
        offset: offset, length: client.fileTransferLimits.readChunkBytes)
      digest.update(data: chunk.bytes)
      offset += UInt64(chunk.bytes.count)
    }
    XCTAssertEqual(digest.finalize(), SHA256.hash(data: bytes))
    do {
      _ = try await client.importFile(url, parent: "/", generation: generation) { _, _ in }
      XCTFail("Import must not silently replace a same-name file")
    } catch let failure as RPCFailure { XCTAssertEqual(failure.code, "NAME_EXIST") }
    let interruptedURL = directory.appendingPathComponent("interrupted.bin")
    try bytes.write(to: interruptedURL)
    var interrupted: Task<Void, Error>?
    interrupted = Task { @MainActor in
      _ = try await client.importFile(interruptedURL, parent: "/", generation: generation) {
        done, _ in
        if done > 0 { interrupted?.cancel() }
      }
    }
    do {
      _ = try await XCTUnwrap(interrupted).value
      XCTFail("Mid-stream cancellation must not finish the file")
    } catch is CancellationError {}
    let retried = try await client.importFile(interruptedURL, parent: "/", generation: generation) {
      _, _ in
    }
    XCTAssertTrue(retried.created)
    XCTAssertEqual(retried.size, bytes.count)
    let empty = directory.appendingPathComponent("empty.txt")
    try Data().write(to: empty)
    let next = try await client.importFile(empty, parent: "/", generation: generation) { _, _ in }
    XCTAssertTrue(next.completed)
    XCTAssertEqual(next.size, 0)
  }

  func testCoordinatedSourceHoldsAccessAcrossReadsAndReleasesAfterClose() async throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try Data([1, 2, 3, 4]).write(to: url)
    defer { try? FileManager.default.removeItem(at: url) }
    let source = CoordinatedDocumentSource(url: url)
    let metadata = try await source.open()
    XCTAssertEqual(metadata.size, 4)
    let first = try await source.read(upToCount: 2)
    XCTAssertEqual(first, Data([1, 2]))
    let attempted = expectation(description: "Writer started coordination")
    let earlyWrite = expectation(description: "Writer must wait for the source lease")
    earlyWrite.isInverted = true
    let finished = expectation(description: "Writer completed after source close")
    let writing = Task.detached {
      attempted.fulfill()
      var error: NSError?
      NSFileCoordinator().coordinate(writingItemAt: url, options: [], error: &error) { target in
        earlyWrite.fulfill()
        do { try Data([9, 9, 9, 9]).write(to: target) } catch {
          XCTFail("Synthetic writer failed: \(error)")
        }
      }
      XCTAssertNil(error)
      finished.fulfill()
    }
    await fulfillment(of: [attempted], timeout: 2)
    await fulfillment(of: [earlyWrite], timeout: 0.15)
    let second = try await source.read(upToCount: 2)
    XCTAssertEqual(second, Data([3, 4]))
    await source.close()
    await fulfillment(of: [finished], timeout: 3)
    await writing.value
    XCTAssertEqual(try Data(contentsOf: url), Data([9, 9, 9, 9]))
  }

  func testDirectorySelectionIsRejectedAndItsAccessIsClosed() async throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: url) }
    let source = CoordinatedDocumentSource(url: url)
    do {
      _ = try await source.open()
      XCTFail("A directory must not be admitted as an ordinary file")
    } catch let error as CocoaError {
      XCTAssertEqual(error.code, .fileReadUnsupportedScheme)
    }
    await source.close()
  }

  func testCanceledSourceCannotDeliverMoreBytesAndCleanupAllowsAnotherReader() async throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try Data([1, 2]).write(to: url)
    defer { try? FileManager.default.removeItem(at: url) }
    let source = CoordinatedDocumentSource(url: url)
    _ = try await source.open()
    source.cancel()
    do {
      _ = try await source.read(upToCount: 1)
      XCTFail("A canceled source must not return bytes")
    } catch is CancellationError {}
    await source.close()
    let next = CoordinatedDocumentSource(url: url)
    _ = try await next.open()
    let bytes = try await next.read(upToCount: 2)
    XCTAssertEqual(bytes, Data([1, 2]))
    await next.close()
  }
}
