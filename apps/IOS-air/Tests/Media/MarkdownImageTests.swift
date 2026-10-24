import ChromVoidBridge
import Foundation
import Testing

@testable import AirPresentation

@Suite @MainActor
struct MarkdownImageTests {
  @Test func realCoreAttachmentLoadsInlineAndReleasesWithDocumentPresentation() async throws {
    try await withMediaRuntime { client in
      if !(try client.snapshot().masterConfigured) {
        try await client.setupAdministrator(password: "air-synthetic-administrator")
      }
      try await client.unlock(password: "air-inline-" + UUID().uuidString)
      let generation = try client.snapshot().generation
      // A synthetic one-pixel PNG. No filesystem or network preview source.
      let bytes = try #require(
        Data(
          base64Encoded:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
        ))
      let writer = try client.beginFileWrite(
        AirFileWriteTarget(
          parentPath: "/", name: "Inline.png", mimeType: "image/png",
          byteCount: UInt64(bytes.count)), generation: generation)
      _ = try await writer.append(bytes)
      _ = try await writer.finish()
      let source = "- [ ] Draft\n\nBefore **![Sample](/Inline.png)** after."
      let noteBytes = Data(source.utf8)
      let noteWriter = try client.beginFileWrite(
        AirFileWriteTarget(
          parentPath: "/", name: "Inline.md", mimeType: "text/markdown",
          byteCount: UInt64(noteBytes.count)), generation: generation)
      _ = try await noteWriter.append(noteBytes)
      let note = try await noteWriter.finish()
      let model = DocumentModel(store: client, nodeID: UInt64(note.nodeID), generation: generation)
      {}
      await model.load()?.value
      let parsed = try #require(model.preview)
      let imageID = try #require(parsed.nodes.firstIndex { $0.content.kind == .image })
      await model.loadInlineImage(nodeID: imageID, sourceDigest: parsed.sourceDigest)?.value
      let attachment = try #require(model.inlineImages[imageID])
      let preview = try #require(attachment.preview)
      #expect(preview.state == .ready && preview.image?.width == 1)
      #expect(model.text == source && !model.dirty)
      #expect(model.loadInlineImage(nodeID: imageID, sourceDigest: parsed.sourceDigest) == nil)
      model.releaseInlineImage(nodeID: imageID, sourceDigest: parsed.sourceDigest)
      #expect(model.inlineImages.isEmpty && preview.state == .revoked && preview.image == nil)
      await model.loadInlineImage(nodeID: imageID, sourceDigest: parsed.sourceDigest)?.value
      let taskID = try #require(parsed.nodes.firstIndex { $0.content.kind == .task })
      await model.toggleTask(nodeID: taskID)?.value
      #expect(model.inlineImages.isEmpty && model.dirty)
      let updated = try #require(model.preview)
      let updatedID = try #require(updated.nodes.firstIndex { $0.content.kind == .image })
      await model.loadInlineImage(nodeID: updatedID, sourceDigest: updated.sourceDigest)?.value
      model.releaseInlineImage(nodeID: updatedID, sourceDigest: parsed.sourceDigest)
      #expect(model.inlineImages[updatedID]?.preview?.state == .ready)
      await model.setMode(.source)?.value
      #expect(model.inlineImages.isEmpty && model.dirty)
      model.revoke()
      #expect(model.inlineImages.isEmpty && model.text.isEmpty)
      #expect(model.loadInlineImage(nodeID: updatedID, sourceDigest: updated.sourceDigest) == nil)
    }
  }

  @Test func revokedResolutionCannotAdmitReaderAndMissingImageCanRetry() async throws {
    let store = InlineImageStore()
    let parsed = try await MarkdownProcessor.parse(source: "![Sample](/Image.png)")
    let target = try #require(parsed.nodes.first { $0.content.kind == .image }?.content.target)
    let model = MarkdownImageModel(store: store, sourceNodeID: 12, generation: 4, target: target)
    let work = model.load()
    await store.started()
    model.revoke()
    store.release()
    await work?.value
    #expect(model.preview == nil && model.issue == nil && store.reads == 0)
    #expect(model.load() == nil)

    store.result = .missing
    let retry = MarkdownImageModel(store: store, sourceNodeID: 12, generation: 4, target: target)
    await retry.load()?.value
    #expect(retry.issue == "Image unavailable" && retry.preview == nil && store.reads == 0)
    store.result = .found
    await retry.load()?.value
    #expect(retry.issue == nil && retry.preview?.state == .failed && store.reads == 1)
    retry.revoke()
    #expect(retry.preview == nil)
  }

  @Test func renderingPreservesTextOrderAndLinkedImageDestinationWithoutRemoteReads() async throws {
    let parsed = try await MarkdownProcessor.parse(
      source:
        "Before **![Sample](/Image.png)** after [![Linked](/Next.png)](https://example.com) ![Remote](https://example.com/image.png)"
    )
    let paragraph = try #require(parsed.roots.first)
    let segments = MarkdownText.segments(parsed, parsed.nodes[paragraph].children)
    #expect(
      segments.compactMap { $0.text.map { String($0.characters) } } == [
        "Before ", " after ", " Image: Remote — Image unavailable",
      ])
    let images = segments.filter { $0.imageID != nil }
    #expect(images.count == 2)
    let linked = try #require(images.last?.activationID)
    #expect(parsed.nodes[linked].content.target?.url == "https://example.com")
    let blocked = try #require(
      parsed.nodes.first {
        $0.content.kind == .image && $0.content.target?.kind == .blocked
      }?.content.target)
    let store = InlineImageStore()
    let model = MarkdownImageModel(store: store, sourceNodeID: 12, generation: 4, target: blocked)
    #expect(model.load() == nil && store.resolutions == 0 && store.reads == 0)
  }
}

@MainActor
private final class InlineImageStore: DocumentStore, FileReadStore {
  let documentByteLimit: UInt64 = 1024 * 1024
  var reads = 0
  var resolutions = 0
  var result: CatalogDocumentLinkResponseKind = .found
  private var waiting: CheckedContinuation<Void, Never>?
  private var observer: CheckedContinuation<Void, Never>?
  private var released = false
  func resolveDocumentLink(
    nodeID: UInt64, path: String, kind: CatalogDocumentLinkKind, generation: UInt64
  ) async throws -> CatalogDocumentLinkResponse {
    #expect(nodeID == 12 && path == "/Image.png" && kind == .file && generation == 4)
    resolutions += 1
    if !released {
      await withCheckedContinuation {
        waiting = $0
        observer?.resume()
        observer = nil
      }
    }
    return CatalogDocumentLinkResponse(
      item: result == .found
        ? CatalogFileLinkItem(
          createdAt: 1, mimeType: "image/png", name: "Image.png", nodeID: 20,
          parentPath: "/", path: "/Image.png", size: 10, sourceRevision: 1, updatedAt: 1) : nil,
      kind: result)
  }
  func started() async {
    if waiting != nil { return }
    await withCheckedContinuation { observer = $0 }
  }
  func release() {
    released = true
    waiting?.resume()
    waiting = nil
  }
  func openFileReader(nodeID: UInt64, generation: UInt64) throws -> any FileReading {
    #expect(nodeID == 20 && generation == 4)
    reads += 1
    throw BridgeError.RuntimeUnavailable
  }
  func readDocument(nodeID: UInt64, generation: UInt64) async throws -> OpenedDocument {
    throw BridgeError.RuntimeUnavailable
  }
  func saveDocument(nodeID: UInt64, sourceRevision: UInt64, text: String, generation: UInt64)
    async throws -> CatalogFileReplaceResponse
  {
    throw BridgeError.RuntimeUnavailable
  }
}
