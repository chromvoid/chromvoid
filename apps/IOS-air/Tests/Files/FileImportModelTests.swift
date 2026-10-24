import AirPresentation
import XCTest

@testable import ChromVoidBridge

@MainActor
private final class TestFileImports: FileImportStore {
  var calls: [String] = []
  var operation: @MainActor (URL) async throws -> UploadResponse = { _ in
    UploadResponse(
      completed: true, created: true, mediaInfo: nil, mediaInspectedRevision: nil,
      mimeType: nil, modtime: nil, nodeID: 12, size: 3, sourceRevision: 1, uploadedBytes: 3)
  }
  func importMarkdownImage(
    _ input: MarkdownImageInput, folder: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> String {
    throw CocoaError(.fileReadUnknown)
  }

  func importFile(
    _ url: URL, parent: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> UploadResponse {
    calls.append(parent + ":" + url.lastPathComponent)
    progress(2, 3)
    return try await operation(url)
  }

  var providers: [NSItemProvider] = []
  func importProvider(
    _ provider: NSItemProvider, parent: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> UploadResponse {
    providers.append(provider)
    calls.append(parent + ":provider:" + (provider.suggestedName ?? "?"))
    progress(3, 3)
    return try await operation(URL(fileURLWithPath: "/synthetic/" + (provider.suggestedName ?? "")))
  }
}

extension FileImportModelTests {
  @MainActor
  func testPhotoAndCameraItemsStreamThroughTheProviderPath() async throws {
    let store = TestFileImports()
    var refreshes = 0
    let model = FileImportModel(store: store, parent: "/Camera", generation: 3) { refreshes += 1 }
    model.choosePhotos()
    XCTAssertEqual(model.picker, .photos)
    XCTAssertFalse(model.pickerPresented)
    let first = NSItemProvider()
    first.suggestedName = "IMG_0007"
    let second = NSItemProvider()
    await model.receiveProviders([first, second])?.value
    XCTAssertNil(model.picker)
    XCTAssertEqual(model.items.map(\.name), ["IMG_0007", "Photo"])
    XCTAssertEqual(model.items.map(\.outcome), [.imported, .imported])
    XCTAssertEqual(store.calls, ["/Camera:provider:IMG_0007", "/Camera:provider:?"])
    XCTAssertEqual(model.state, .finished)
    XCTAssertEqual(refreshes, 1)

    model.chooseCamera()
    XCTAssertEqual(model.picker, .camera)
    XCTAssertNil(model.receiveCapture(nil))
    XCTAssertNil(model.picker)
    model.chooseCamera()
    let taken = Date(timeIntervalSince1970: 1_757_600_000)
    await model.receiveCapture(Data([0xFF, 0xD8, 0xFF]), takenAt: taken)?.value
    let capture = try XCTUnwrap(store.providers.last)
    XCTAssertEqual(capture.suggestedName, "Photo " + FileImportModel.captureStamp(taken) + ".jpg")
    XCTAssertTrue(capture.hasItemConformingToTypeIdentifier("public.jpeg"))
    XCTAssertEqual(model.items.map(\.outcome), [.imported])
    XCTAssertEqual(refreshes, 2)
  }
}

final class FileImportModelTests: XCTestCase {
  @MainActor
  func testBatchRetainsIndividualOutcomesAfterConflictAndDeniedAccess() async {
    let store = TestFileImports()
    let success = store.operation
    store.operation = { url in
      if url.lastPathComponent == "duplicate.txt" {
        throw RPCFailure(code: "NAME_EXIST")
      }
      if url.lastPathComponent == "denied.txt" {
        throw RPCFailure(code: "ACCESS_DENIED")
      }
      return try await success(url)
    }
    var refreshes = 0
    let model = FileImportModel(store: store, parent: "/Projects", generation: 3) { refreshes += 1 }
    model.chooseFiles()
    await model.receiveFiles(
      .success(
        ["a.txt", "duplicate.txt", "denied.txt", "b.txt"].map {
          URL(fileURLWithPath: "/synthetic/" + $0)
        }))?.value
    XCTAssertEqual(
      store.calls,
      ["/Projects:a.txt", "/Projects:duplicate.txt", "/Projects:denied.txt", "/Projects:b.txt"])
    XCTAssertEqual(
      model.items.map(\.outcome),
      [
        .imported, .failed("An item with that name already exists."),
        .failed("Access to this item is denied."), .imported,
      ])
    XCTAssertEqual(model.importedCount, 2)
    XCTAssertEqual(refreshes, 1)
    XCTAssertEqual(model.state, .finished)
    model.revoke()
  }

  @MainActor
  func testStopWaitsForCurrentCleanupAndNeverStartsTheNextFile() async throws {
    let store = TestFileImports()
    let entered = expectation(description: "Import waiting")
    var resume: CheckedContinuation<Void, Never>?
    store.operation = { _ in
      await withCheckedContinuation { continuation in
        resume = continuation
        entered.fulfill()
      }
      throw CancellationError()
    }
    var refreshes = 0
    let model = FileImportModel(store: store, parent: "/", generation: 3) { refreshes += 1 }
    let task = model.receiveFiles(
      .success(["first", "second"].map { URL(fileURLWithPath: "/" + $0) }))
    await fulfillment(of: [entered], timeout: 2)
    model.stop()
    XCTAssertEqual(model.state, .stopping)
    XCTAssertEqual(refreshes, 0)
    try XCTUnwrap(resume).resume()
    await task?.value
    XCTAssertEqual(store.calls, ["/:first"])
    XCTAssertEqual(model.items.map(\.outcome), [.interrupted, .pending])
    XCTAssertEqual(model.state, .finished)
    XCTAssertEqual(refreshes, 1)
    model.revoke()
  }

  @MainActor
  func testPickerCancellationAndRevokedLateResultDoNotRestoreNames() async throws {
    let store = TestFileImports()
    let model = FileImportModel(store: store, parent: "/", generation: 3) {}
    model.chooseFiles()
    model.receiveFiles(.failure(CocoaError(.userCancelled)))
    XCTAssertNil(model.issue)
    XCTAssertTrue(store.calls.isEmpty)
    let entered = expectation(description: "Import waiting")
    var resume: CheckedContinuation<Void, Never>?
    let success = store.operation
    store.operation = { url in
      await withCheckedContinuation { continuation in
        resume = continuation
        entered.fulfill()
      }
      return try await success(url)
    }
    let task = model.receiveFiles(.success([URL(fileURLWithPath: "/private.txt")]))
    await fulfillment(of: [entered], timeout: 2)
    model.revoke()
    try XCTUnwrap(resume).resume()
    await task?.value
    XCTAssertEqual(model.state, .revoked)
    XCTAssertTrue(model.items.isEmpty)
    model.receiveFiles(.success([URL(fileURLWithPath: "/late.txt")]))
    XCTAssertTrue(model.items.isEmpty)
    XCTAssertEqual(store.calls.count, 1)
  }
}
