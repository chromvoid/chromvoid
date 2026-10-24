import Foundation
import Testing

@testable import ChromVoidBridge

@Suite(.serialized)
struct FileExportCopyTests {
  @Test @MainActor
  func explicitCopyRejectsPathsAndCannotReopenAfterRevocation() async throws {
    let copy = FileExportCopy(generation: 4)
    do {
      try await copy.open(name: "../outside.txt")
      Issue.record("Catalog metadata cannot supply a filesystem path")
    } catch let error as CocoaError {
      #expect(error.code == .fileWriteInvalidFileName)
    }
    try await copy.close()
    await #expect(throws: BridgeError.self) { try await copy.open(name: "Valid.txt") }
    #expect(copy.url == nil)
    #expect(copy.metadata == nil)
  }

  @Test @MainActor
  func abortedDraftDeletesPartialBytesAndDoesNotPublishAnIncompleteURL() async throws {
    let copy = FileExportCopy(generation: 4)
    try await copy.open(name: "Partial.txt")
    try await copy.append(Data("Unfinished export".utf8))
    #expect(copy.url == nil)
    #expect(copy.metadata == nil)
    copy.revoke()
    await #expect(throws: BridgeError.self) { try await copy.append(Data("late".utf8)) }
    try await copy.close()
  }

  @Test
  func nextBootstrapRemovesAbandonedExports() async throws {
    let scratch = ExportScratchFile()
    try await scratch.open(name: "Abandoned.txt")
    try await scratch.append(Data("Explicit export from a terminated process".utf8))
    let url = try await scratch.finish()
    #expect(FileManager.default.fileExists(atPath: url.path))
    try ExportScratchFile.removeAbandoned()
    #expect(!FileManager.default.fileExists(atPath: url.path))
    try await scratch.remove()
  }
}
