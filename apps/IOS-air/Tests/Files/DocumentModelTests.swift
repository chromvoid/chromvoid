import Foundation
import Testing
import UIKit

@testable import AirPresentation
@testable import ChromVoidBridge

@Suite @MainActor
struct DocumentModelTests {
  @Test func imageInsertionCanBeUndoneAndRedoneWithoutLosingEarlierTyping() async throws {
    let store = DocumentProbe()
    let images = DocumentImageImports()
    let model = DocumentModel(store: store, nodeID: 12, generation: 4, imports: images) {}
    await model.load()?.value
    model.setMode(.source)
    let view = UITextView()
    let history = try #require(view.undoManager)
    history.groupsByEvent = false
    let coordinator = DocumentSourceEditor.Coordinator(model: model)
    view.delegate = coordinator
    coordinator.applyModel(to: view)
    #expect(!history.canUndo)
    view.selectedRange = NSRange(location: view.text.utf16.count, length: 0)
    history.beginUndoGrouping()
    view.insertText(" typed")
    history.endUndoGrouping()
    #expect(model.text == "Original typed")
    history.undo()
    #expect(view.text == "Original")
    history.redo()
    #expect(view.text == "Original typed")
    images.beforeReturn = {
      coordinator.applyModel(to: view)
      #expect(!view.isEditable)
    }
    await model.receivePaste([.image(.provider(NSItemProvider()))], at: model.selection)?.value
    images.beforeReturn = nil
    coordinator.applyModel(to: view)
    #expect(view.text == "Original typed" + images.markdown)
    #expect(history.canUndo)
    history.undo()
    #expect(view.text == "Original typed")
    #expect(model.text == view.text)
    #expect(history.canRedo)
    history.redo()
    #expect(view.text == "Original typed" + images.markdown)
    #expect(model.text == view.text)
    history.undo()
    history.undo()
    #expect(view.text == "Original")
    #expect(model.text == view.text && !model.dirty)
    #expect(store.saves.isEmpty && images.providers.count == 1)
    model.revoke()
    coordinator.applyModel(to: view)
    #expect(view.text.isEmpty && !history.canUndo && !history.canRedo)
  }

  @Test func savesAreExplicitAndUseTheReadRevisionIncludingEmptyDocuments() async throws {
    let store = DocumentProbe()
    var notifications = 0
    let model = DocumentModel(store: store, nodeID: 12, generation: 4) { notifications += 1 }
    await model.load()?.value
    #expect(model.text == "Original")
    #expect(!model.dirty)
    model.setText("# Draft\n- [x] Ready")
    #expect(store.saves.isEmpty)
    #expect(!model.requestClose() && model.confirmingClose)
    model.cancelClose()
    let saved = model.save()
    #expect(model.save() == nil)
    await saved?.value
    #expect(store.saves.map(\.revision) == [1])
    #expect(store.current.text == "# Draft\n- [x] Ready")
    #expect(model.saved && !model.dirty && notifications == 1)
    #expect(model.requestClose())
    model.setText("")
    await model.save()?.value
    #expect(store.saves.map(\.revision) == [1, 2])
    #expect(store.current.text.isEmpty)
    #expect(notifications == 2)
  }

  @Test func conflictReviewRetainsDraftAndChecksTheReviewedRevisionAgain() async throws {
    let store = DocumentProbe()
    let model = DocumentModel(store: store, nodeID: 12, generation: 4) {}
    await model.load()?.value
    model.setText("My draft")
    store.current = OpenedDocument(
      nodeID: 12, sourceRevision: 2, name: "Renamed.md", text: "Remote edit")
    await model.save()?.value
    #expect(model.state == .conflict && model.text == "My draft")
    #expect(model.conflict?.text == "Remote edit")
    #expect(model.name == "Renamed.md")
    #expect(store.saves.count == 1 && store.current.text == "Remote edit")
    store.current = store.document("Another remote edit", revision: 3)
    await model.useMyDraft()?.value
    #expect(model.state == .conflict && model.text == "My draft")
    #expect(model.conflict?.sourceRevision == 3)
    #expect(store.current.text == "Another remote edit")
    await model.useMyDraft()?.value
    #expect(store.saves.map(\.revision) == [1, 2, 3])
    #expect(store.current.text == "My draft")
    #expect(model.state == .editing && !model.dirty)
    model.setText("Second draft")
    store.current = store.document("Saved elsewhere", revision: 5)
    await model.save()?.value
    let writes = store.saves.count
    model.useSavedVersion()
    #expect(model.text == "Saved elsewhere" && !model.dirty)
    #expect(store.saves.count == writes)
  }

  @Test func uncertainCommitDoesNotRetryAndComparisonKeepsTheDraft() async throws {
    let store = DocumentProbe()
    let model = DocumentModel(store: store, nodeID: 12, generation: 4) {}
    await model.load()?.value
    model.setText(String(repeating: "я", count: 11))
    store.documentByteLimit = 20
    #expect(model.save() == nil && store.saves.isEmpty)
    #expect(model.issue == "This document is too large to edit.")
    model.setText("My draft")
    store.saveError = BridgeError.RuntimeUnavailable
    await model.save()?.value
    #expect(model.state == .uncertain && model.text == "My draft")
    #expect(model.save() == nil)
    #expect(store.saves.count == 1)
    await model.compareSavedVersion()?.value
    #expect(model.state == .conflict && model.text == "My draft")
    #expect(store.saves.count == 1)
    model.keepEditing()
    #expect(model.state == .editing && model.dirty)
  }

  @Test func revocationPurgesDraftAndRejectsLateSaveCompletion() async throws {
    let store = DocumentProbe()
    var release: CheckedContinuation<Void, Never>?
    let entered = AsyncStream<Void>.makeStream()
    store.beforeSave = {
      await withCheckedContinuation { continuation in
        release = continuation
        entered.continuation.yield(())
        entered.continuation.finish()
      }
    }
    var notifications = 0
    let model = DocumentModel(store: store, nodeID: 12, generation: 4) { notifications += 1 }
    await model.load()?.value
    model.setText("Sensitive draft")
    let saving = model.save()
    for await _ in entered.stream { break }
    model.revoke()
    #expect(model.text.isEmpty && model.name.isEmpty && model.conflict == nil)
    release?.resume()
    await saving?.value
    #expect(model.state == .revoked && model.text.isEmpty && notifications == 0)
    #expect(model.save() == nil && model.load() == nil)
  }
  @Test func imageInsertionUsesTheSelectedRangeAndRemainsAnUnsavedDraft() async throws {
    let store = DocumentProbe()
    let images = DocumentImageImports()
    let suite = "air-attachments-" + UUID().uuidString
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let preferences = FilePreferences(defaults: defaults)
    preferences.setAttachmentFolder("/Notes/Images")
    let model = DocumentModel(
      store: store, nodeID: 12, generation: 4, imports: images, filePreferences: preferences
    ) {}
    await model.load()?.value
    model.setMode(.source)
    model.setText("До 🏞️ PLACE после")
    let range = (model.text as NSString).range(of: "PLACE")
    model.setSelection(range)
    model.chooseImage()
    #expect(model.imagePickerPresented)
    await model.receiveImage(.success([URL(fileURLWithPath: "/synthetic/image.png")]))?.value
    #expect(images.folders == ["/Notes/Images"] && images.generations == [4])
    #expect(model.text == "До 🏞️ ![Image](/Notes/Images/image.png) после")
    #expect(model.dirty && store.saves.isEmpty && !model.importingImage)
    #expect(
      model.selection == NSRange(location: range.location + images.markdown.utf16.count, length: 0))
    await model.save()?.value
    #expect(store.current.text == model.text && !model.dirty)
  }

  @Test func batchImageInsertionKeepsOrderAndConfirmedLinksWhenALaterUploadFails() async throws {
    let store = DocumentProbe()
    let images = DocumentImageImports()
    images.result = { url in
      if url.lastPathComponent == "failed.png" { throw CocoaError(.fileReadUnknown) }
      return "![Image](</attachments/\(url.lastPathComponent)>)"
    }
    let model = DocumentModel(store: store, nodeID: 12, generation: 4, imports: images) {}
    await model.load()?.value
    model.setMode(.source)
    model.setText("Before PLACE after")
    model.setSelection((model.text as NSString).range(of: "PLACE"))
    model.chooseImage()
    let urls = ["first.png", "second.png", "failed.png", "unattempted.png"].map {
      URL(fileURLWithPath: "/synthetic/" + $0)
    }
    await model.receiveImage(.success(urls))?.value
    #expect(images.urls.map(\.lastPathComponent) == ["first.png", "second.png", "failed.png"])
    #expect(
      model.text
        == "Before ![Image](</attachments/first.png>)\n![Image](</attachments/second.png>) after")
    #expect(model.issue != nil && model.dirty && model.canImportImage)
    #expect(store.saves.isEmpty)
    await model.save()?.value
    #expect(store.current.text == model.text)
  }

  @Test func cancellationAfterAConfirmedImageKeepsItsLinkAndStopsTheRemainingBatch() async throws {
    let store = DocumentProbe()
    let images = DocumentImageImports()
    let model = DocumentModel(store: store, nodeID: 12, generation: 4, imports: images) {}
    images.beforeReturn = { model.cancelImageImport() }
    await model.load()?.value
    model.setMode(.source)
    model.setText("")
    model.chooseImage()
    let urls = ["first.png", "second.png"].map { URL(fileURLWithPath: "/synthetic/" + $0) }
    await model.receiveImage(.success(urls))?.value
    #expect(images.urls == [urls[0]])
    #expect(model.text == images.markdown && model.dirty && !model.importingImage)
    #expect(
      model.issue == "Image insertion canceled. Completed uploads remain in the attachment folder.")
    #expect(store.saves.isEmpty)
  }

  @Test func mixedPastePreservesTextAndConfirmedImagesAtTheUIKitRange() async throws {
    let store = DocumentProbe()
    let images = DocumentImageImports()
    let finished = AsyncStream<Void>.makeStream()
    let model = DocumentModel(store: store, nodeID: 12, generation: 4, imports: images) {
      finished.continuation.yield(())
      finished.continuation.finish()
    }
    await model.load()?.value
    model.setMode(.source)
    model.setText("До 🏞️ PLACE после")
    let view = UITextView()
    view.text = model.text
    let coordinator = DocumentSourceEditor.Coordinator(model: model)
    let provider = NSItemProvider()
    provider.registerDataRepresentation(forTypeIdentifier: "public.png", visibility: .all) {
      completion in
      completion(Data([1]), nil)
      return nil
    }
    let item = PasteItemProbe(provider: provider)
    coordinator.textPasteConfigurationSupporting(view, transform: item)
    let attachment = try #require(item.attachment)
    let incoming = NSMutableAttributedString(string: "before ")
    incoming.append(NSAttributedString(attachment: attachment))
    incoming.append(NSAttributedString(string: " after"))
    let range = (view.text as NSString).range(of: "PLACE")
    let start = try #require(view.position(from: view.beginningOfDocument, offset: range.location))
    let end = try #require(view.position(from: start, offset: range.length))
    let target = try #require(view.textRange(from: start, to: end))
    _ = coordinator.textPasteConfigurationSupporting(view, performPasteOf: incoming, to: target)
    for await _ in finished.stream { break }
    #expect(images.providers.count == 1 && images.providers.first === provider)
    #expect(model.text == "До 🏞️ before \(images.markdown) after после")
    #expect(model.dirty && store.saves.isEmpty)
    #expect(!model.text.contains("\u{FFFC}"))
    model.revoke()
    let stale = PasteItemProbe(provider: provider)
    coordinator.textPasteConfigurationSupporting(view, transform: stale)
    #expect(stale.discarded)
    _ = coordinator.textPasteConfigurationSupporting(view, performPasteOf: incoming, to: target)
    #expect(model.text.isEmpty && images.providers.count == 1)
  }

  @Test func ordinaryTextPasteUsesUIKitReplacementWithoutStartingAnImageImport() async throws {
    let store = DocumentProbe()
    let images = DocumentImageImports()
    let model = DocumentModel(store: store, nodeID: 12, generation: 4, imports: images) {}
    await model.load()?.value
    model.setMode(.source)
    let view = UITextView()
    view.text = model.text
    let coordinator = DocumentSourceEditor.Coordinator(model: model)
    let item = PasteItemProbe(provider: NSItemProvider(object: "replacement" as NSString))
    coordinator.textPasteConfigurationSupporting(view, transform: item)
    #expect(item.usedDefault)
    let range = try #require(view.textRange(from: view.beginningOfDocument, to: view.endOfDocument))
    _ = coordinator.textPasteConfigurationSupporting(
      view, performPasteOf: NSAttributedString(string: "replacement"), to: range)
    #expect(model.text == "replacement" && view.text == model.text && model.dirty)
    #expect(images.urls.isEmpty && images.providers.isEmpty && store.saves.isEmpty)
  }

  @Test func mixedPasteRetainsSurroundingTextWhenAnImageFails() async throws {
    let store = DocumentProbe()
    let images = DocumentImageImports()
    images.failure = CocoaError(.fileReadUnknown)
    let model = DocumentModel(store: store, nodeID: 12, generation: 4, imports: images) {}
    await model.load()?.value
    model.setMode(.source)
    model.setText("")
    await model.receivePaste(
      [
        .text("before "), .image(.file(URL(fileURLWithPath: "/synthetic/failed.png"))),
        .text(" after"), .image(.file(URL(fileURLWithPath: "/synthetic/unattempted.png"))),
      ], at: NSRange(location: 0, length: 0))?.value
    #expect(model.text == "before  after" && model.issue != nil && model.dirty)
    #expect(images.urls.count == 1 && store.saves.isEmpty)
  }

  @Test func pendingImageImportProtectsInsertionAndRevocationDiscardsLateResults() async throws {
    let store = DocumentProbe()
    let images = DocumentImageImports()
    var release: CheckedContinuation<Void, Never>?
    let entered = AsyncStream<Void>.makeStream()
    images.beforeReturn = {
      await withCheckedContinuation { continuation in
        release = continuation
        entered.continuation.yield(())
        entered.continuation.finish()
      }
    }
    let model = DocumentModel(store: store, nodeID: 12, generation: 4, imports: images) {}
    await model.load()?.value
    model.setMode(.source)
    model.chooseImage()
    let importing = model.receiveImage(.success([URL(fileURLWithPath: "/synthetic/image.png")]))
    for await _ in entered.stream { break }
    #expect(model.busy && !model.canImportImage)
    model.setText("Must not replace the captured draft")
    model.setMode(.preview)
    #expect(model.text == "Original" && model.mode == .source)
    #expect(model.save() == nil && !model.requestClose())
    model.revoke()
    release?.resume()
    await importing?.value
    #expect(model.state == .revoked && model.text.isEmpty && !model.importingImage)
    #expect(store.saves.isEmpty && model.selection == NSRange(location: 0, length: 0))
  }

  @Test func canceledImageInsertionKeepsTheDraftAndReportsCancellation() async throws {
    let store = DocumentProbe()
    let images = DocumentImageImports()
    let model = DocumentModel(store: store, nodeID: 12, generation: 4, imports: images) {}
    await model.load()?.value
    model.setMode(.source)
    model.chooseImage()
    let task = model.receiveImage(.success([URL(fileURLWithPath: "/synthetic/image.png")]))
    model.cancelImageImport()
    await task?.value
    #expect(model.text == "Original" && !model.dirty && !model.importingImage)
    #expect(
      model.issue == "Image insertion canceled. Completed uploads remain in the attachment folder.")
    #expect(store.saves.isEmpty)
  }

  @Test func failedImageImportKeepsTheDraftAndDoesNotRetryTheWrite() async throws {
    let store = DocumentProbe()
    let images = DocumentImageImports()
    images.failure = BridgeError.RuntimeUnavailable
    let model = DocumentModel(store: store, nodeID: 12, generation: 4, imports: images) {}
    await model.load()?.value
    model.setMode(.source)
    model.setText("Keep my draft")
    model.chooseImage()
    await model.receiveImage(.success([URL(fileURLWithPath: "/synthetic/image.png")]))?.value
    #expect(model.text == "Keep my draft" && model.dirty && model.issue != nil)
    #expect(model.canImportImage && images.folders.count == 1 && store.saves.isEmpty)
  }

}

@MainActor
private final class DocumentProbe: DocumentStore, FileReadStore {
  func openFileReader(nodeID: UInt64, generation: UInt64) throws -> any FileReading {
    throw BridgeError.RuntimeUnavailable
  }

  func resolveDocumentLink(
    nodeID: UInt64, path: String, kind: CatalogDocumentLinkKind, generation: UInt64
  )
    async throws -> CatalogDocumentLinkResponse
  { throw FileCatalogError.invalidPage }

  struct Save {
    let revision: UInt64
    let text: String
  }
  var documentByteLimit: UInt64 = 1024 * 1024
  var current = OpenedDocument(nodeID: 12, sourceRevision: 1, name: "Note.md", text: "Original")
  var saves: [Save] = []
  var saveError: Error?
  var beforeSave: (() async -> Void)?
  func document(_ text: String, revision: UInt64) -> OpenedDocument {
    OpenedDocument(nodeID: 12, sourceRevision: revision, name: "Note.md", text: text)
  }
  func readDocument(nodeID: UInt64, generation: UInt64) async throws -> OpenedDocument {
    #expect(nodeID == 12 && generation == 4)
    return current
  }
  func saveDocument(nodeID: UInt64, sourceRevision: UInt64, text: String, generation: UInt64)
    async throws -> CatalogFileReplaceResponse
  {
    #expect(nodeID == 12 && generation == 4)
    saves.append(Save(revision: sourceRevision, text: text))
    await beforeSave?()
    if let saveError { throw saveError }
    guard sourceRevision == current.sourceRevision else {
      throw RPCFailure(code: "ERR_STALE_SOURCE")
    }
    current = document(text, revision: sourceRevision + 1)
    return CatalogFileReplaceResponse(
      mediaInfo: nil, mediaInspectedRevision: 0, mimeType: "text/markdown", modtime: 1,
      nodeID: 12, size: text.utf8.count, sourceRevision: Int(current.sourceRevision))
  }
}

@MainActor
private final class DocumentImageImports: FileImportStore {
  let markdown = "![Image](/Notes/Images/image.png)"
  var urls: [URL] = []
  var providers: [NSItemProvider] = []
  var result: ((URL) throws -> String)?
  var folders: [String] = []
  var generations: [UInt64] = []
  var beforeReturn: (() async -> Void)?
  var failure: Error?

  func importMarkdownImage(
    _ input: MarkdownImageInput, folder: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> String {
    let url: URL?
    switch input {
    case .file(let file):
      url = file
      urls.append(file)
    case .provider(let provider):
      url = nil
      providers.append(provider)
    }
    folders.append(folder)
    generations.append(generation)
    progress(1, 2)
    await beforeReturn?()
    if let failure { throw failure }
    progress(2, 2)
    if let url { return try result?(url) ?? markdown }
    return markdown
  }

  func importFile(
    _ url: URL, parent: String, generation: UInt64,
    progress: @escaping @MainActor (UInt64, UInt64) -> Void
  ) async throws -> UploadResponse { throw CocoaError(.fileReadUnknown) }
}

@MainActor
private final class PasteItemProbe: NSObject, UITextPasteItem {
  let itemProvider: NSItemProvider
  var localObject: Any? { nil }
  var defaultAttributes: [NSAttributedString.Key: Any] { [:] }
  var attachment: NSTextAttachment?
  var discarded = false
  var usedDefault = false
  init(provider: NSItemProvider) { itemProvider = provider }
  func setResult(string: String) {}
  func setResult(attributedString: NSAttributedString) {}
  func setResult(attachment: NSTextAttachment) { self.attachment = attachment }
  func setNoResult() { discarded = true }
  func setDefaultResult() { usedDefault = true }
}
