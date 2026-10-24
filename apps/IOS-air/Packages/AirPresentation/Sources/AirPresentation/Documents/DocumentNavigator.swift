import ChromVoidBridge
import Foundation
import Observation

/// One document sheet owns its navigation and each retained, unsaved draft.
@MainActor
@Observable
public final class DocumentNavigator: Identifiable {
  public let id = UUID()
  public let root: DocumentModel
  public private(set) var path: [UUID] = []
  public private(set) var fileInformation: CatalogFileLinkItem?
  public private(set) var imagePreview: ImagePreviewModel?
  public private(set) var mediaPreview: MediaPreviewModel?
  public private(set) var pdfPreview: PDFPreviewModel?
  private var documents: [UUID: DocumentModel]
  private let store: any DocumentStore & FileReadStore
  private let imports: (any FileImportStore)?
  private let filePreferences: FilePreferences
  private let generation: UInt64
  private let onSaved: () -> Void

  public init(
    store: any DocumentStore & FileReadStore, nodeID: UInt64, generation: UInt64,
    imports: (any FileImportStore)? = nil, filePreferences: FilePreferences = FilePreferences(),
    onSaved: @escaping () -> Void
  ) {
    self.store = store
    self.imports = imports
    self.filePreferences = filePreferences
    self.generation = generation
    self.onSaved = onSaved
    root = DocumentModel(
      store: store, nodeID: nodeID, generation: generation, imports: imports,
      filePreferences: filePreferences, onSaved: onSaved)
    documents = [root.id: root]
    connect(root)
  }

  public var hasUnsavedChanges: Bool { documents.values.contains { $0.dirty } }
  public func document(id: UUID) -> DocumentModel? { documents[id] }

  public func setPath(_ value: [UUID]) {
    guard value.count < path.count, value == Array(path.prefix(value.count)) else { return }
    let removed = path.dropFirst(value.count)
    guard removed.allSatisfy({ documents[$0].map { !$0.dirty && !$0.busy } ?? false }) else {
      return
    }
    while path.count > value.count { pop() }
  }

  /// Called after the visible document's ordinary discard confirmation, when needed.
  public func pop() {
    guard let id = path.last else { return }
    documents.removeValue(forKey: id)?.revoke()
    path.removeLast()
  }

  private func connect(_ document: DocumentModel) {
    document.onNavigate = { [weak self, weak document] item, anchor in
      guard let self, let document, (self.path.last ?? self.root.id) == document.id else { return }
      if ImagePreviewDecoder.supports(name: item.name, mimeType: item.mimeType) {
        guard let nodeID = UInt64(exactly: item.nodeID) else { return }
        self.imagePreview = ImagePreviewModel(
          store: self.store, nodeID: nodeID, generation: self.generation, name: item.name)
        return
      }
      if MediaPreviewModel.supports(name: item.name, mimeType: item.mimeType) {
        guard let nodeID = UInt64(exactly: item.nodeID) else { return }
        self.mediaPreview = MediaPreviewModel(
          store: self.store, nodeID: nodeID, generation: self.generation, name: item.name)
        return
      }
      if PDFPreviewModel.supports(name: item.name, mimeType: item.mimeType) {
        guard let nodeID = UInt64(exactly: item.nodeID) else { return }
        self.pdfPreview = PDFPreviewModel(
          store: self.store, nodeID: nodeID, generation: self.generation, name: item.name)
        return
      }
      guard DocumentModel.supports(name: item.name, mimeType: item.mimeType) else {
        self.fileInformation = item
        return
      }
      guard let nodeID = UInt64(exactly: item.nodeID) else { return }
      let next = DocumentModel(
        store: self.store, nodeID: nodeID, generation: self.generation,
        initialAnchor: anchor, imports: self.imports, filePreferences: self.filePreferences,
        onSaved: self.onSaved)
      self.connect(next)
      self.documents[next.id] = next
      self.path.append(next.id)
    }
  }

  public func dismissFileInformation() { fileInformation = nil }
  public func dismissImagePreview() {
    imagePreview?.revoke()
    imagePreview = nil
  }

  public func dismissPDFPreview() {
    pdfPreview?.revoke()
    pdfPreview = nil
  }

  public func dismissMediaPreview() {
    mediaPreview?.revoke()
    mediaPreview = nil
  }

  public func revoke() {
    for document in documents.values { document.revoke() }
    documents.removeAll()
    path.removeAll()
    fileInformation = nil
    dismissImagePreview()
    dismissMediaPreview()
    dismissPDFPreview()
  }
}
