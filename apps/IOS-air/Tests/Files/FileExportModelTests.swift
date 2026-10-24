import AirPresentation
import Foundation
import Testing

@testable import ChromVoidBridge

@Suite(.serialized)
struct FileExportModelTests {
  @Test @MainActor
  func partialPreparationAndSystemCancelPreserveSelectionAndRejectStaleCompletion() async throws {
    let store = TestFileCatalogStore()
    let copy = try await preparedCopy()
    let url = try #require(copy.url)
    var reads: [UInt64] = []
    store.export = { id in
      reads.append(id)
      if id == 2 { throw RPCFailure(code: "NODE_NOT_FOUND") }
      return copy
    }
    let files = FilesModel(store: store, imports: store, generation: 7, path: "/Reports")
    files.setQuery("report")
    files.beginSelection()
    for item in [entry(1), entry(2), entry(3, directory: true)] { files.toggleSelection(item) }
    files.exportFiles()
    let model = try #require(files.exporting)
    #expect(reads.isEmpty)
    let task = model.prepare()
    #expect(model.prepare() == nil)
    await task?.value
    #expect(reads == [1, 2])
    #expect(model.items.map(\.outcome) == [.ready, .failed, .skipped])
    #expect(model.items[0].name == "report.txt")
    #expect(model.items[1].issue == "This item is no longer available. Refresh the folder.")
    #expect(model.state == .ready)
    model.share()
    let canceled = try #require(model.shareRequest)
    #expect(canceled.urls == [url])
    model.finishSharing(attempt: canceled.id, completed: false, failed: false)
    #expect(model.state == .ready)
    #expect(copy.url == url)
    model.share()
    let current = try #require(model.shareRequest)
    #expect(model.finishSharing(attempt: canceled.id, completed: true, failed: false) == nil)
    #expect(model.state == .sharing)
    await model.finishSharing(attempt: current.id, completed: true, failed: false)?.value
    #expect(model.state == .finished)
    #expect(model.items.map(\.outcome) == [.shared, .failed, .skipped])
    #expect(copy.url == nil)
    #expect(!FileManager.default.fileExists(atPath: url.path))
    files.dismissExport()
    #expect(files.path == "/Reports")
    #expect(files.query == "report")
    #expect(Set(files.selected.keys) == [1, 2, 3])
    files.revoke()
  }

  @Test @MainActor
  func latePreparedCopyIsRemovedAfterTheExportSheetCloses() async throws {
    let store = TestFileCatalogStore()
    let copy = try await preparedCopy()
    let url = try #require(copy.url)
    let (started, start) = AsyncStream<Void>.makeStream()
    let (resume, continuation) = AsyncStream<Void>.makeStream()
    store.export = { _ in
      start.yield(())
      for await _ in resume { break }
      return copy
    }
    let model = FileExportModel(items: [entry(1)], store: store, generation: 7)
    let task = model.prepare()
    for await _ in started { break }
    model.revoke()
    continuation.yield(())
    continuation.finish()
    start.finish()
    await task?.value
    #expect(model.state == .revoked)
    #expect(model.items.isEmpty)
    #expect(model.shareRequest == nil)
    #expect(copy.url == nil)
    #expect(!FileManager.default.fileExists(atPath: url.path))
  }

  @Test @MainActor
  func failedHandoffIsNotRetriedOrReportedAsAConfirmedCopy() async throws {
    let store = TestFileCatalogStore()
    let copy = try await preparedCopy()
    store.export = { _ in copy }
    let model = FileExportModel(items: [entry(1)], store: store, generation: 7)
    await model.prepare()?.value
    let request = try #require(model.shareRequest)
    await model.finishSharing(attempt: request.id, completed: false, failed: true)?.value
    #expect(model.items.first?.outcome == .uncertain)
    #expect(model.issue != nil)
    #expect(model.state == .finished)
    #expect(copy.url == nil)
    #expect(model.prepare() == nil)
    model.share()
    #expect(model.shareRequest == nil)
    model.revoke()
  }

  @Test @MainActor
  func lockingTheOriginRevokesPreparedCopiesAndRejectsTheSystemCallback() async throws {
    let store = TestFileCatalogStore()
    let copy = try await preparedCopy()
    let url = try #require(copy.url)
    store.export = { _ in copy }
    let files = FilesModel(store: store, imports: store, generation: 7, path: "/Reports")
    files.exportFiles(entry(1))
    let model = try #require(files.exporting)
    await model.prepare()?.value
    let request = try #require(model.shareRequest)
    files.revoke()
    #expect(files.exporting == nil)
    #expect(model.items.isEmpty)
    #expect(model.shareRequest == nil)
    #expect(model.state == .revoked)
    #expect(copy.url == nil)
    #expect(model.finishSharing(attempt: request.id, completed: true, failed: false) == nil)
    try await copy.close()
    #expect(!FileManager.default.fileExists(atPath: url.path))
  }

  @MainActor
  private func preparedCopy() async throws -> FileExportCopy {
    let copy = FileExportCopy(generation: 7)
    try await copy.open(name: "report.txt")
    try await copy.append(Data("Report".utf8))
    try await copy.finish(
      metadata: SourceMetadataResponse(
        mediaInfo: nil, mediaInspectedRevision: 0, mimeType: "text/plain", name: "report.txt",
        nodeID: 1, nodeType: 0, size: 6, sourceRevision: 1, sourceRevisionInitialized: true))
    return copy
  }

  private func entry(_ id: Int, directory: Bool = false) -> CatalogListItem {
    CatalogListItem(
      createdAt: 1, isDir: directory, mediaInfo: nil, mediaInspectedRevision: 0,
      mimeType: nil, name: "report-\(id)", nodeID: id, parentPath: "/Reports",
      path: "/Reports/report-\(id)", size: directory ? nil : 6, sourceRevision: 1, updatedAt: 1)
  }
}
