import ChromVoidBridge
import Foundation
import PDFKit
import Testing
import UIKit

@testable import AirPresentation

@Suite @MainActor
struct PDFPreviewTests {
  @Test func realPDFPagesNavigationAndNativeViewAreReleasedOnRevoke() async throws {
    let store = PDFReadProbe(bytes: fixture())
    let model = PDFPreviewModel(store: store, nodeID: 4, generation: 3, name: "Guide.pdf")
    await model.load()?.value
    #expect(model.state == .ready && model.pageCount == 3 && store.cancelled)
    #expect(model.document?.page(at: 1)?.string?.contains("Chapter 2") == true)
    model.goToPage(2)
    #expect(model.pageIndex == 2)
    model.goToPage(3)
    #expect(model.pageIndex == 2)
    let view = PDFView()
    view.isFindInteractionEnabled = true
    view.document = model.document
    let coordinator = NativePDFView.Coordinator(model: model, openURL: { _ in })
    coordinator.observe(view)
    let page = try #require(model.document?.page(at: 1))
    view.go(to: page)
    #expect(model.pageIndex == 1)
    model.revoke()
    #expect(model.document == nil && model.name.isEmpty && model.pageCount == 0)
    #expect(view.document == nil && view.currentSelection == nil)
    #expect(model.state == .revoked && model.load() == nil)
    NativePDFView.dismantleUIView(view, coordinator: coordinator)
  }

  @Test func encryptedPDFAllowsPasswordRetryWithoutReadingAgain() async throws {
    let document = try #require(PDFDocument(data: fixture()))
    let data = try #require(
      document.dataRepresentation(options: [
        PDFDocumentWriteOption.ownerPasswordOption: "synthetic-owner",
        PDFDocumentWriteOption.userPasswordOption: "synthetic-reader",
      ]))
    #expect(PDFDocument(data: data)?.isLocked == true)
    let store = PDFReadProbe(bytes: data)
    let model = PDFPreviewModel(store: store, nodeID: 4, generation: 3, name: "Locked.pdf")
    await model.load()?.value
    #expect(model.state == .passwordRequired && model.document == nil)
    model.password = "wrong"
    await model.load()?.value
    #expect(model.state == .passwordRequired && model.issue != nil && model.password.isEmpty)
    model.password = "synthetic-reader"
    await model.load()?.value
    #expect(model.state == .ready && model.pageCount == 3 && model.password.isEmpty)
    #expect(store.opens == 1)
    model.revoke()
    #expect(model.document == nil && model.password.isEmpty)
  }

  @Test func malformedAndOversizedFilesFailAndRetryCanRecover() async throws {
    let store = PDFReadProbe(bytes: Data("not a PDF".utf8))
    let model = PDFPreviewModel(store: store, nodeID: 4, generation: 3, name: "Guide.pdf")
    await model.load()?.value
    #expect(model.state == .failed && model.document == nil && store.cancelled)
    store.declaredSize = PDFPreviewModel.maximumSourceBytes + 1
    await model.load()?.value
    #expect(model.state == .failed && model.issue == "This PDF is too large to preview in memory.")
    store.bytes = fixture()
    store.declaredSize = nil
    await model.load()?.value
    #expect(model.state == .ready && model.pageCount == 3)
    #expect(model.externalLink(try #require(URL(string: "https://example.com/guide"))) != nil)
    #expect(model.externalLink(try #require(URL(string: "file:///tmp/private.pdf"))) == nil)
    #expect(model.issue == "This PDF link cannot be opened from the vault preview.")
    model.revoke()
    #expect(model.externalLink(try #require(URL(string: "https://example.com"))) == nil)
  }

  @Test func lockDuringReadDiscardsLateBytesAndNeverPublishesDocument() async throws {
    let store = PDFReadProbe(bytes: fixture())
    let entered = AsyncStream<Void>.makeStream()
    var pending: CheckedContinuation<Void, Never>?
    store.beforeRead = {
      await withCheckedContinuation {
        pending = $0
        entered.continuation.yield(())
        entered.continuation.finish()
      }
    }
    let model = PDFPreviewModel(store: store, nodeID: 4, generation: 3, name: "Guide.pdf")
    let loading = model.load()
    for await _ in entered.stream { break }
    model.revoke()
    #expect(store.cancelled)
    pending?.resume()
    await loading?.value
    #expect(model.state == .revoked && model.document == nil && model.issue == nil)
  }

  @Test func sharedReadRejectsMixedSourceRevisions() async throws {
    let store = PDFReadProbe(bytes: fixture())
    store.changeRevision = true
    let model = PDFPreviewModel(store: store, nodeID: 4, generation: 3, name: "Guide.pdf")
    await model.load()?.value
    #expect(model.state == .failed && model.document == nil && store.cancelled)
  }

  @Test func realRustFilesAndMarkdownRoutesKeepDraftAndRevokePDF() async throws {
    try await withMediaRuntime { client in
      if !(try client.snapshot().masterConfigured) {
        try await client.setupAdministrator(password: "air-synthetic-administrator")
      }
      try await client.unlock(password: "air-pdf-" + UUID().uuidString)
      let generation = try client.snapshot().generation
      let pdfID = try await write(
        fixture(), name: "Guide.pdf", mime: "application/pdf", client: client,
        generation: generation)
      let noteID = try await write(
        Data("[Guide](/Guide.pdf)".utf8), name: "Note.md", mime: "text/markdown", client: client,
        generation: generation)
      let files = FilesModel(store: client, imports: client, generation: generation)
      await files.reload()?.value
      files.open(try #require(files.items.first { $0.nodeID == Int(pdfID) }))
      let filePreview = try #require(files.pdfPreview)
      await filePreview.load()?.value
      #expect(filePreview.pageCount == 3 && filePreview.state == .ready)
      files.dismissPDFPreview()
      #expect(filePreview.document == nil && files.pdfPreview == nil)
      let navigation = DocumentNavigator(store: client, nodeID: noteID, generation: generation) {}
      await navigation.root.load()?.value
      await navigation.root.setMode(.source)?.value
      navigation.root.setText("[Guide](/Guide.pdf)\nUnsaved draft")
      await navigation.root.setMode(.preview)?.value
      let target = try #require(
        navigation.root.preview?.nodes.first { $0.content.kind == .link }?.content.target)
      #expect(target.kind == .catalog)
      await navigation.root.openInternalLink(target)?.value
      let attachment = try #require(navigation.pdfPreview)
      await attachment.load()?.value
      #expect(attachment.pageCount == 3 && navigation.path.isEmpty)
      navigation.dismissPDFPreview()
      #expect(navigation.root.dirty && navigation.root.text.hasSuffix("Unsaved draft"))
      await navigation.root.openInternalLink(target)?.value
      let reopening = try #require(navigation.pdfPreview)
      await reopening.load()?.value
      _ = try client.lock()
      files.revoke()
      navigation.revoke()
      #expect(reopening.document == nil && navigation.root.text.isEmpty)
      #expect(throws: BridgeError.self) {
        try client.openFileReader(nodeID: pdfID, generation: generation)
      }
    }
  }

  private func write(
    _ bytes: Data, name: String, mime: String, client: RuntimeClient, generation: UInt64
  ) async throws -> UInt64 {
    let writer = try client.beginFileWrite(
      AirFileWriteTarget(
        parentPath: "/", name: name, mimeType: mime, byteCount: UInt64(bytes.count)),
      generation: generation)
    _ = try await writer.append(bytes)
    return UInt64(try await writer.finish().nodeID)
  }

  private func fixture() -> Data {
    let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 320, height: 480))
    return renderer.pdfData { context in
      for page in 1...3 {
        context.beginPage()
        ("Chapter \(page)" as NSString).draw(
          at: CGPoint(x: 30, y: 30), withAttributes: [.font: UIFont.systemFont(ofSize: 20)])
      }
    }
  }
}

@MainActor
private final class PDFReadProbe: FileReadStore, FileReading {
  var bytes: Data
  var declaredSize: Int?
  var changeRevision = false
  var beforeRead: (() async -> Void)?
  let maximumChunkBytes: UInt64 = 512
  private(set) var cancelled = false
  private(set) var opens = 0

  init(bytes: Data) { self.bytes = bytes }
  func openFileReader(nodeID: UInt64, generation: UInt64) throws -> any FileReading {
    #expect(nodeID == 4 && generation == 3)
    opens += 1
    cancelled = false
    return self
  }
  func cancel() throws { cancelled = true }
  func read(offset: UInt64, length: UInt64) async throws -> FileReadChunk {
    #expect(!cancelled && length <= maximumChunkBytes)
    await beforeRead?()
    let start = Int(offset)
    return FileReadChunk(
      metadata: SourceMetadataResponse(
        mediaInfo: nil, mediaInspectedRevision: 0, mimeType: "application/pdf", name: "Guide.pdf",
        nodeID: 4, nodeType: 0, size: declaredSize ?? bytes.count,
        sourceRevision: changeRevision && offset > 0 ? 2 : 1, sourceRevisionInitialized: true),
      bytes: bytes.subdata(in: start..<min(start + Int(length), bytes.count)))
  }
}
