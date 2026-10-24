import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
@MainActor
struct CredentialExportTests {
  @Test func onlyTheSystemCompletionConfirmsSaving() async throws {
    let store = ExportStore()
    let model = CredentialExportModel(store: store, generation: 7)
    let work = try #require(model.chooseDestination())
    #expect(model.chooseDestination() == nil)
    await work.value
    let attempt = try #require(model.attemptID)
    #expect(store.generations == [7])
    #expect(model.state == .choosingDestination)
    #expect(model.document != nil)
    model.dismissExporter()
    #expect(model.state == .ready)
    #expect(model.document == nil)
    #expect(model.savedFilename.isEmpty)
    model.finishExport(.success(URL(fileURLWithPath: "/saved.json")), attempt: attempt)
    #expect(model.state == .finished)
    #expect(model.savedFilename == "saved.json")
    #expect(model.document == nil)
    model.finishExport(.success(URL(fileURLWithPath: "/duplicate.json")), attempt: attempt)
    #expect(model.savedFilename == "saved.json")
  }

  @Test func cancellationWithoutCallbackAllowsANewSnapshotAndRejectsOldCompletion() async throws {
    let store = ExportStore()
    let model = CredentialExportModel(store: store, generation: 8)
    await model.chooseDestination()?.value
    let previous = try #require(model.attemptID)
    model.dismissExporter()
    #expect(!model.exporterPresented)
    #expect(model.document == nil)
    await model.chooseDestination()?.value
    let current = try #require(model.attemptID)
    #expect(current != previous)
    #expect(store.generations == [8, 8])
    model.finishExport(.success(URL(fileURLWithPath: "/stale.json")), attempt: previous)
    #expect(model.state == .choosingDestination)
    model.dismissExporter()
    model.finishExport(.failure(CocoaError(.fileWriteNoPermission)), attempt: current)
    #expect(model.state == .failed)
    #expect(model.issue != nil)
    #expect(model.savedFilename.isEmpty)
  }

  @Test func revokePurgesTheDocumentAndRejectsLatePreparation() async throws {
    let store = ExportStore()
    store.suspend = true
    let model = CredentialExportModel(store: store, generation: 9)
    let work = try #require(model.chooseDestination())
    await store.started()
    let attempt = model.attemptID
    model.revoke()
    store.pending?.resume(returning: Data("synthetic export".utf8))
    store.pending = nil
    await work.value
    #expect(model.state == .revoked)
    #expect(model.document == nil)
    #expect(!model.exporterPresented)
    model.finishExport(.success(URL(fileURLWithPath: "/late.json")), attempt: attempt)
    #expect(model.savedFilename.isEmpty)
  }

  @Test func preparationFailureDoesNotOfferAPartialDocument() async throws {
    let store = ExportStore()
    store.error = CocoaError(.fileReadCorruptFile)
    let model = CredentialExportModel(store: store, generation: 10)
    await model.chooseDestination()?.value
    #expect(model.state == .failed)
    #expect(model.document == nil)
    #expect(!model.exporterPresented)
    #expect(model.issue != nil)
    store.error = nil
    await model.chooseDestination()?.value
    #expect(model.state == .choosingDestination)
    model.revoke()
    #expect(model.document == nil)
    #expect(model.attemptID == nil)
  }
}

@MainActor
private final class ExportStore: CredentialExportStore {
  var generations: [UInt64] = []
  var suspend = false
  var error: Error?
  var pending: CheckedContinuation<Data, Error>?
  private var startWaiter: CheckedContinuation<Void, Never>?
  func started() async {
    if pending != nil { return }
    await withCheckedContinuation { startWaiter = $0 }
  }
  func exportCredentialDocument(generation: UInt64) async throws -> Data {
    generations.append(generation)
    if let error { throw error }
    if !suspend { return Data("synthetic export".utf8) }
    return try await withCheckedThrowingContinuation {
      pending = $0
      startWaiter?.resume()
      startWaiter = nil
    }
  }
}
