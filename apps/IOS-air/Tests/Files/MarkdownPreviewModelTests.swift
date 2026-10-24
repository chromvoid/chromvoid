import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite @MainActor
struct MarkdownPreviewModelTests {
  @Test func previewTaskSourceAndExplicitSaveShareOneDraft() async throws {
    let store = PreviewDocumentStore()
    let model = DocumentModel(store: store, nodeID: 1, generation: 9) {}
    await model.load()?.value
    #expect(model.mode == .preview && model.preview != nil && !model.dirty)
    let taskID = try #require(model.preview?.nodes.firstIndex { $0.content.kind == .task })
    await model.toggleTask(nodeID: taskID)?.value
    #expect(model.text == store.original.replacingOccurrences(of: "[ ]", with: "[x]"))
    #expect(model.dirty && store.saves.isEmpty)
    await model.setMode(.source)?.value
    #expect(model.preview == nil)
    model.setText(model.text + "\nManual change")
    await model.setMode(.preview)?.value
    #expect(model.preview != nil && model.text.hasSuffix("Manual change"))
    await model.save()?.value
    #expect(store.saves == [model.text] && model.saved && !model.dirty)
    model.revoke()
    #expect(model.text.isEmpty && model.preview == nil && model.previewIssue == nil)
  }

  @Test func oldParseCannotReplaceNewSource() async throws {
    let gate = PreviewGate()
    let model = DocumentModel(
      store: PreviewDocumentStore(), nodeID: 1, generation: 9,
      parseMarkdown: { source in
        await gate.wait()
        // Deliberately finish even after cancellation to exercise publication guards.
        return try JSONDecoder().decode(
          MarkdownDocument.self, from: parseAirMarkdown(source: source))
      }, onSaved: {}
    )
    let loading = model.load()
    await gate.started()
    await model.setMode(.source)?.value
    model.setText("# New source")
    gate.release()
    await loading?.value
    #expect(model.text == "# New source" && model.preview == nil)
    await model.setMode(.preview)?.value
    #expect(model.preview?.nodes.contains { $0.content.anchor == "new-source" } == true)
    model.revoke()
    #expect(model.preview == nil && !model.previewLoading && model.text.isEmpty)
    #expect(model.refreshPreview() == nil)
  }

  @Test func revocationRejectsLatePreviewAndLinkResolution() async throws {
    let parseGate = PreviewGate()
    let store = PreviewDocumentStore()
    let model = DocumentModel(
      store: store, nodeID: 1, generation: 9,
      parseMarkdown: { source in
        await parseGate.wait()
        return try JSONDecoder().decode(
          MarkdownDocument.self, from: parseAirMarkdown(source: source))
      }, onSaved: {}
    )
    let loading = model.load()
    await parseGate.started()
    model.revoke()
    parseGate.release()
    await loading?.value
    #expect(model.state == .revoked && model.text.isEmpty && model.preview == nil)

    let linkGate = PreviewGate()
    store.linkGate = linkGate
    let navigation = DocumentNavigator(store: store, nodeID: 1, generation: 9) {}
    await navigation.root.load()?.value
    let target = try #require(
      navigation.root.preview?.nodes.first { $0.content.kind == .link }?.content.target)
    let resolving = navigation.root.openInternalLink(target)
    await linkGate.started()
    navigation.revoke()
    linkGate.release()
    await resolving?.value
    #expect(navigation.path.isEmpty && navigation.fileInformation == nil)
    #expect(navigation.root.state == .revoked && !navigation.root.resolvingLink)
    #expect(navigation.root.preview == nil && navigation.root.text.isEmpty)
  }

  @Test func linkNavigationRetainsAncestorDraftAndRefusesImplicitDirtyPop() async throws {
    let store = PreviewDocumentStore()
    let navigation = DocumentNavigator(store: store, nodeID: 1, generation: 9) {}
    await navigation.root.load()?.value
    await navigation.root.setMode(.source)?.value
    navigation.root.setText(store.original + "\nParent draft")
    await navigation.root.setMode(.preview)?.value
    let target = try #require(
      navigation.root.preview?.nodes.first { $0.content.kind == .link }?.content.target)
    await navigation.root.openInternalLink(target)?.value
    let id = try #require(navigation.path.last)
    let child = try #require(navigation.document(id: id))
    await child.load()?.value
    #expect(child.name == "Sibling.md" && navigation.root.text.hasSuffix("Parent draft"))
    await child.setMode(.source)?.value
    child.setText("Child draft")
    navigation.setPath([])
    #expect(navigation.path == [id] && navigation.hasUnsavedChanges)
    #expect(!child.requestClose() && child.confirmingClose)
    navigation.pop()
    #expect(navigation.path.isEmpty && child.state == .revoked && child.text.isEmpty)
    #expect(navigation.root.text.hasSuffix("Parent draft") && navigation.root.dirty)
    #expect(store.saves.isEmpty)
    navigation.revoke()
    #expect(navigation.root.text.isEmpty && navigation.root.preview == nil)
  }

  @Test func anchorsAndMissingLinksDoNotLoseTheCurrentDocument() async throws {
    let store = PreviewDocumentStore()
    let model = DocumentModel(store: store, nodeID: 1, generation: 9) {}
    await model.load()?.value
    model.jumpToAnchor("details")
    #expect(model.anchorJump != nil)
    model.jumpToAnchor("missing")
    #expect(model.previewIssue == "This heading could not be found in the document.")
    store.resolution = .ambiguous
    let target = try #require(
      model.preview?.nodes.first { $0.content.kind == .link }?.content.target)
    await model.openInternalLink(target)?.value
    #expect(model.previewIssue == "More than one note matches this link. Use its full path.")
    #expect(model.text == store.original && !model.dirty)
  }
}

@MainActor
private final class PreviewDocumentStore: DocumentStore, FileReadStore {
  func openFileReader(nodeID: UInt64, generation: UInt64) throws -> any FileReading {
    throw BridgeError.RuntimeUnavailable
  }

  let documentByteLimit: UInt64 = 1024 * 1024
  let original = "# Origin\n\n- [ ] Task\n\n[Sibling](Sibling.md)\n\n## Details\nText"
  var saves: [String] = []
  var resolution: CatalogDocumentLinkResponseKind = .found
  var saved: String?
  var linkGate: PreviewGate?
  func readDocument(nodeID: UInt64, generation: UInt64) async throws -> OpenedDocument {
    #expect(generation == 9)
    return OpenedDocument(
      nodeID: nodeID, sourceRevision: 1,
      name: nodeID == 1 ? "Origin.md" : "Sibling.md",
      text: nodeID == 1 ? (saved ?? original) : "# Linked note")
  }
  func saveDocument(nodeID: UInt64, sourceRevision: UInt64, text: String, generation: UInt64)
    async throws -> CatalogFileReplaceResponse
  {
    saves.append(text)
    saved = text
    return CatalogFileReplaceResponse(
      mediaInfo: nil, mediaInspectedRevision: 0,
      mimeType: "text/markdown", modtime: 1, nodeID: Int(nodeID), size: text.utf8.count,
      sourceRevision: Int(sourceRevision + 1))
  }
  func resolveDocumentLink(
    nodeID: UInt64, path: String, kind: CatalogDocumentLinkKind, generation: UInt64
  )
    async throws -> CatalogDocumentLinkResponse
  {
    #expect(nodeID == 1 && path == "Sibling.md" && kind == .note && generation == 9)
    await linkGate?.wait()
    let item = CatalogFileLinkItem(
      createdAt: 1, mimeType: "text/markdown", name: "Sibling.md",
      nodeID: 2, parentPath: "/", path: "/Sibling.md", size: 13, sourceRevision: 1, updatedAt: 1)
    return CatalogDocumentLinkResponse(item: resolution == .found ? item : nil, kind: resolution)
  }
}

@MainActor
private final class PreviewGate {
  private var open = false
  private var began = false
  private var waiting: CheckedContinuation<Void, Never>?
  private var observer: CheckedContinuation<Void, Never>?
  func wait() async {
    if open { return }
    await withCheckedContinuation { continuation in
      waiting = continuation
      began = true
      observer?.resume()
      observer = nil
    }
  }
  func started() async {
    if began { return }
    await withCheckedContinuation { observer = $0 }
  }
  func release() {
    open = true
    waiting?.resume()
    waiting = nil
  }
}
