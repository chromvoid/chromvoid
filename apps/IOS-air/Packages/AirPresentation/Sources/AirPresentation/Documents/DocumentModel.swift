import ChromVoidBridge
import Foundation
import Observation

public enum DocumentPasteFragment {
  case text(String)
  case image(MarkdownImageInput)
}

/// Transient editor state. Core owns document identity, revisions and writes.
@MainActor
@Observable
public final class DocumentModel: Identifiable {
  public enum State: Equatable {
    case loading, editing, saving, conflict, failed, uncertain, revoked
  }
  public enum Mode: Equatable { case preview, source }
  public let id = UUID()
  public private(set) var mode: Mode = .source
  public private(set) var preview: MarkdownDocument?
  public private(set) var previewLoading = false
  public private(set) var previewIssue: String?
  public private(set) var anchorJump: AnchorJump?
  public struct AnchorJump: Equatable {
    public let id = UUID()
    public let nodeID: Int
  }
  public private(set) var resolvingLink = false
  @ObservationIgnored var onNavigate: ((CatalogFileLinkItem, String?) -> Void)?
  private let initialAnchor: String?
  private let linkWork = ModelWork()
  private let previewWork = ModelWork()
  /// Identity of the preview the link work resolves against; a refresh or invalidation
  /// replaces it so a late link result never acts on a newer preview.
  @ObservationIgnored private var previewRequest = UUID()
  public private(set) var inlineImages: [Int: MarkdownImageModel] = [:]
  private let parseMarkdown: @MainActor (String) async throws -> MarkdownDocument
  public var isMarkdown: Bool {
    ["md", "markdown"].contains((name as NSString).pathExtension.lowercased())
      || opened?.mimeType?.lowercased() == "text/markdown"
  }
  public private(set) var state: State = .loading
  public private(set) var name = ""
  public private(set) var text = ""
  public private(set) var issue: String?
  public private(set) var conflict: OpenedDocument?
  public private(set) var confirmingClose = false
  public private(set) var saved = false
  public private(set) var imagePickerPresented = false
  public private(set) var importingImage = false
  public private(set) var imageProgress: Double = 0
  public private(set) var selection = NSRange(location: 0, length: 0)
  private let imageWork = ModelWork()
  @ObservationIgnored private var imageInsertionRange: NSRange?
  private let imports: (any FileImportStore)?
  private let filePreferences: FilePreferences
  public var canImportImage: Bool {
    isMarkdown && imports != nil && state == .editing && !importingImage
  }
  private let nodeID: UInt64
  private let generation: UInt64
  private let store: any DocumentStore & FileReadStore
  private let onSaved: () -> Void
  private var opened: OpenedDocument?
  private let work = ModelWork()
  public var dirty: Bool { opened.map { text != $0.text } ?? false }
  public var busy: Bool { state == .loading || state == .saving || importingImage }

  public static func supports(_ item: CatalogListItem) -> Bool {
    !item.isDir && supports(name: item.name, mimeType: item.mimeType)
  }

  static func supports(name: String, mimeType: String?) -> Bool {
    let suffix = (name as NSString).pathExtension.lowercased()
    return ["md", "markdown", "txt"].contains(suffix) || mimeType?.hasPrefix("text/") == true
  }

  public init(
    store: any DocumentStore & FileReadStore, nodeID: UInt64, generation: UInt64,
    initialAnchor: String? = nil, imports: (any FileImportStore)? = nil,
    filePreferences: FilePreferences = FilePreferences(),
    parseMarkdown: @escaping @MainActor (String) async throws -> MarkdownDocument = {
      try await MarkdownProcessor.parse(source: $0)
    }, onSaved: @escaping () -> Void
  ) {
    self.store = store
    self.imports = imports
    self.filePreferences = filePreferences
    self.nodeID = nodeID
    self.generation = generation
    self.onSaved = onSaved
    self.parseMarkdown = parseMarkdown
    self.initialAnchor = initialAnchor
  }

  @discardableResult
  public func load() -> Task<Void, Never>? {
    guard opened == nil, state == .loading || state == .failed else { return nil }
    state = .loading
    issue = nil
    return work.start { [weak self, store, nodeID, generation] run in
      do {
        let document = try await store.readDocument(nodeID: nodeID, generation: generation)
        try Task.checkCancellation()
        guard let self, run.isCurrent else { return }
        self.opened = document
        self.name = document.name
        self.text = document.text
        self.state = .editing
        if self.isMarkdown {
          self.mode = .preview
          await self.refreshPreview()?.value
          if let initialAnchor = self.initialAnchor, self.preview != nil {
            self.jumpToAnchor(initialAnchor)
          }
        }
      } catch {
        guard let self, run.isCurrent else { return }
        self.state = .failed
        self.issue = Self.message(error)
      }
    }
  }

  public func setText(_ value: String) {
    guard state == .editing, !importingImage else { return }
    invalidatePreview()
    text = value
    saved = false
    issue = nil
  }

  public func setSelection(_ range: NSRange) {
    guard state == .editing, !importingImage,
      range.location >= 0, range.length >= 0,
      range.location <= text.utf16.count, range.length <= text.utf16.count - range.location
    else { return }
    selection = range
  }

  public func chooseImage() {
    guard canImportImage, mode == .source else { return }
    imageInsertionRange = selection
    imagePickerPresented = true
  }

  public func dismissImagePicker() { imagePickerPresented = false }

  @discardableResult
  public func receiveImage(_ result: Result<[URL], Error>) -> Task<Void, Never>? {
    imagePickerPresented = false
    guard canImportImage, mode == .source else { return nil }
    let urls: [URL]
    do {
      urls = try result.get()
      guard !urls.isEmpty else { return nil }
    } catch {
      if (error as NSError).code != NSUserCancelledError {
        issue = "The image could not be opened. Choose it again from Files."
      }
      return nil
    }
    return insertImages(
      urls.map { .image(.file($0)) }, at: imageInsertionRange ?? selection, separator: "\n")
  }

  /// UIKit supplies the actual paste/drop range after transforming the input items.
  @discardableResult
  public func receivePaste(_ fragments: [DocumentPasteFragment], at range: NSRange) -> Task<
    Void, Never
  >? {
    insertImages(fragments, at: range, separator: "")
  }

  private func insertImages(
    _ fragments: [DocumentPasteFragment], at range: NSRange, separator: String
  ) -> Task<Void, Never>? {
    guard canImportImage, mode == .source, let imports,
      let insertion = Range(range, in: text)
    else { return nil }
    let imageCount = fragments.reduce(0) { count, fragment in
      if case .image = fragment { return count + 1 }
      return count
    }
    guard imageCount > 0 else { return nil }
    let original = text
    let folder = filePreferences.attachmentFolder
    importingImage = true
    imageProgress = 0
    issue = nil
    // Cancel is a stop request, not a discard: the links gathered so far are still inserted,
    // so this body finishes on state alone and never consults `run`.
    return imageWork.start { [weak self, imports, generation] _ in
      var links: [String] = []
      var failure: String?
      do {
        try Task.checkCancellation()
        var imageIndex = 0
        for fragment in fragments {
          switch fragment {
          case .text(let text): links.append(text)
          case .image(let input):
            guard failure == nil else { continue }
            let index = imageIndex
            imageIndex += 1
            do {
              try Task.checkCancellation()
              let markdown = try await imports.importMarkdownImage(
                input, folder: folder, generation: generation
              ) { [weak self] received, total in
                guard let self, self.state == .editing, self.importingImage else { return }
                let fraction = total == 0 ? 0 : Double(received) / Double(total)
                self.imageProgress = (Double(index) + fraction) / Double(imageCount)
              }
              links.append(markdown)
              try Task.checkCancellation()
            } catch {
              failure = Self.imageImportMessage(error)
            }
          }
        }
      } catch { failure = Self.imageImportMessage(error) }
      guard let self, self.state == .editing, self.text == original else { return }
      self.importingImage = false
      if !links.isEmpty {
        let markdown = links.joined(separator: separator)
        var changed = original
        changed.replaceSubrange(insertion, with: markdown)
        self.setText(changed)
        self.selection = NSRange(location: range.location + markdown.utf16.count, length: 0)
      }
      self.issue = failure
      self.imageInsertionRange = nil
      self.onSaved()
    }
  }

  private static func imageImportMessage(_ error: Error) -> String {
    Task.isCancelled || error is CancellationError
      ? "Image insertion canceled. Completed uploads remain in the attachment folder."
      : "Image insertion did not finish. Check the attachment folder before trying again."
  }

  public func cancelImageImport() {
    guard importingImage else { return }
    imageWork.cancel()
  }

  @discardableResult
  public func save() -> Task<Void, Never>? {
    guard state == .editing, !importingImage, let opened else { return nil }
    if !dirty {
      saved = true
      return nil
    }
    return save(revision: opened.sourceRevision)
  }

  /// Explicitly chooses the local draft over the remote version shown in the conflict review.
  @discardableResult
  public func useMyDraft() -> Task<Void, Never>? {
    guard state == .conflict, let conflict else { return nil }
    return save(revision: conflict.sourceRevision)
  }

  public func useSavedVersion() {
    guard state == .conflict, let conflict else { return }
    opened = conflict
    name = conflict.name
    text = conflict.text
    self.conflict = nil
    issue = nil
    state = .editing
    saved = false
    onSaved()
    if mode == .preview { refreshPreview() }
  }

  public func keepEditing() {
    guard state == .conflict else { return }
    conflict = nil
    issue = nil
    state = .editing
    if mode == .preview { refreshPreview() }
  }

  private func save(revision: UInt64) -> Task<Void, Never>? {
    guard text.utf8.count <= store.documentByteLimit else {
      issue = "This document is too large to edit."
      return nil
    }
    // The preview matches the text being saved, so it stays up and keeps its position.
    state = .saving
    issue = nil
    saved = false
    return work.start { [weak self, store, nodeID, generation, text] run in
      do {
        let result = try await store.saveDocument(
          nodeID: nodeID, sourceRevision: revision, text: text, generation: generation)
        try Task.checkCancellation()
        guard let self, run.isCurrent else { return }
        self.opened = OpenedDocument(
          nodeID: nodeID, sourceRevision: UInt64(result.sourceRevision), name: self.name,
          text: text,
          mimeType: result.mimeType
        )
        self.conflict = nil
        self.state = .editing
        self.saved = true
        self.onSaved()
        if self.mode == .preview, self.preview == nil { await self.refreshPreview()?.value }
      } catch {
        guard let self, run.isCurrent else { return }
        if error.coreFailure?.code == "ERR_STALE_SOURCE" {
          await self.loadConflict(run: run)
        } else {
          self.state = .uncertain
          self.issue =
            "Saving could not be confirmed. Keep this draft and check the saved version before retrying."
        }
      }
    }
  }

  private func loadConflict(run: ModelRun) async {
    do {
      let latest = try await store.readDocument(nodeID: nodeID, generation: generation)
      try Task.checkCancellation()
      guard run.isCurrent else { return }
      conflict = latest
      name = latest.name
      state = .conflict
      issue = "Compare your draft with the saved version before choosing what to keep."
    } catch {
      guard run.isCurrent else { return }
      conflict = nil
      state = .uncertain
      issue = Self.message(error)
    }
  }

  @discardableResult
  public func compareSavedVersion() -> Task<Void, Never>? {
    guard state == .uncertain else { return nil }
    state = .loading
    return work.start { [weak self] run in
      guard let self else { return }
      await self.loadConflict(run: run)
    }
  }

  public func requestClose() -> Bool {
    guard !busy else { return false }
    if dirty {
      confirmingClose = true
      return false
    }
    return true
  }
  public func cancelClose() { confirmingClose = false }

  public func revoke() {
    imageWork.cancel()
    imagePickerPresented = false
    importingImage = false
    imageInsertionRange = nil
    imageProgress = 0
    selection = NSRange(location: 0, length: 0)
    work.cancel()
    invalidatePreview()
    state = .revoked
    opened = nil
    conflict = nil
    text = ""
    name = ""
    issue = nil
    confirmingClose = false
    saved = false
    onNavigate = nil
  }

  @discardableResult
  public func setMode(_ value: Mode) -> Task<Void, Never>? {
    guard state == .editing, !importingImage, isMarkdown else { return nil }
    mode = value
    invalidatePreview()
    return value == .preview ? refreshPreview() : nil
  }

  /// Views admit only visible image nodes from the current Core-parsed document.
  @discardableResult
  public func loadInlineImage(nodeID: Int, sourceDigest: String) -> Task<Void, Never>? {
    guard state == .editing, mode == .preview, !previewLoading, let preview,
      preview.sourceDigest == sourceDigest, preview.nodes.indices.contains(nodeID),
      preview.nodes[nodeID].content.kind == .image,
      let target = preview.nodes[nodeID].content.target,
      target.kind == .catalog || target.kind == .note
    else { return nil }
    if let image = inlineImages[nodeID] { return image.load() }
    let image = MarkdownImageModel(
      store: store, sourceNodeID: self.nodeID, generation: generation, target: target)
    inlineImages[nodeID] = image
    return image.load()
  }

  public func releaseInlineImage(nodeID: Int, sourceDigest: String) {
    guard preview?.sourceDigest == sourceDigest else { return }
    inlineImages.removeValue(forKey: nodeID)?.revoke()
  }

  private func clearInlineImages() {
    for image in inlineImages.values { image.revoke() }
    inlineImages.removeAll()
  }

  private func invalidatePreview() {
    clearInlineImages()
    linkWork.cancel()
    resolvingLink = false
    previewWork.cancel()
    previewRequest = UUID()
    preview = nil
    previewLoading = false
    previewIssue = nil
    anchorJump = nil
  }

  @discardableResult
  public func refreshPreview() -> Task<Void, Never>? {
    guard state == .editing, mode == .preview else { return nil }
    previewRequest = UUID()
    previewLoading = true
    previewIssue = nil
    return previewWork.start { [weak self, text, parseMarkdown] run in
      do {
        let result = try await parseMarkdown(text)
        try Task.checkCancellation()
        guard let self, run.isCurrent, self.state == .editing, self.mode == .preview,
          self.text == text
        else { return }
        if self.preview?.sourceDigest != result.sourceDigest { self.clearInlineImages() }
        self.preview = result
        self.previewLoading = false
      } catch {
        guard let self, run.isCurrent else { return }
        self.previewLoading = false
        self.previewIssue = "This document could not be previewed. You can still edit its source."
      }
    }
  }

  @discardableResult
  public func toggleTask(nodeID: Int) -> Task<Void, Never>? {
    guard state == .editing, mode == .preview, !previewLoading, let preview,
      preview.nodes.indices.contains(nodeID), let checked = preview.nodes[nodeID].content.checked,
      preview.nodes[nodeID].content.kind == .task
    else { return nil }
    previewRequest = UUID()
    previewLoading = true
    previewIssue = nil
    let markerStart = UInt32(preview.nodes[nodeID].start)
    let digest = preview.sourceDigest
    return previewWork.start { [weak self, text, parseMarkdown] run in
      do {
        let changed = try await MarkdownProcessor.toggleTask(
          source: text, sourceDigest: digest, markerStart: markerStart, checked: checked)
        let result = try await parseMarkdown(changed)
        try Task.checkCancellation()
        guard let self, run.isCurrent, self.state == .editing, self.mode == .preview,
          self.text == text
        else { return }
        self.text = changed
        if self.preview?.sourceDigest != result.sourceDigest { self.clearInlineImages() }
        self.preview = result
        self.previewLoading = false
        self.saved = false
      } catch {
        guard let self, run.isCurrent else { return }
        self.previewLoading = false
        self.previewIssue = "This task could not be changed. Try again or edit the source."
      }
    }
  }

  /// Returns only a Core-classified external URL for the system OpenURL action.
  public func activatePreviewLink(_ url: URL) -> URL? {
    guard state == .editing, mode == .preview, !previewLoading, !resolvingLink,
      url.scheme == "chromvoid-markdown", url.host == "link",
      let id = Int(url.lastPathComponent), let preview, preview.nodes.indices.contains(id),
      let target = preview.nodes[id].content.target
    else { return nil }
    switch target.kind {
    case .external:
      return target.url.flatMap(URL.init(string:))
    case .anchor:
      if let anchor = target.anchor { jumpToAnchor(anchor) }
    case .catalog, .note:
      openInternalLink(target)
    case .blocked: break
    }
    return nil
  }

  @discardableResult
  public func openInternalLink(_ target: MarkdownTarget) -> Task<Void, Never>? {
    guard state == .editing, mode == .preview, !previewLoading, !resolvingLink,
      target.kind == .catalog || target.kind == .note, let path = target.path
    else { return nil }
    resolvingLink = true
    previewIssue = nil
    let request = previewRequest
    return linkWork.start { [weak self, store, nodeID, generation] run in
      do {
        let result = try await store.resolveDocumentLink(
          nodeID: nodeID, path: path, kind: target.kind == .catalog ? .file : .note,
          generation: generation)
        try Task.checkCancellation()
        guard let self, run.isCurrent, self.state == .editing, self.mode == .preview,
          self.previewRequest == request
        else { return }
        self.resolvingLink = false
        switch result.kind {
        case .found:
          guard let item = result.item else { throw FileCatalogError.invalidPage }
          guard let resolvedID = UInt64(exactly: item.nodeID) else {
            throw FileCatalogError.invalidPage
          }
          if resolvedID == nodeID, let anchor = target.anchor {
            self.jumpToAnchor(anchor)
          } else {
            self.onNavigate?(item, target.anchor)
          }
        case .missing: self.previewIssue = "The linked file could not be found."
        case .ambiguous:
          self.previewIssue = "More than one note matches this link. Use its full path."
        }
      } catch {
        guard let self, run.isCurrent, self.previewRequest == request else { return }
        self.resolvingLink = false
        self.previewIssue = "The link could not be opened. Try again."
      }
    }
  }

  public func jumpToAnchor(_ anchor: String) {
    guard let preview,
      let nodeID = preview.nodes.firstIndex(where: {
        $0.content.kind == .heading && $0.content.anchor == anchor
      })
    else {
      previewIssue = "This heading could not be found in the document."
      return
    }
    anchorJump = AnchorJump(nodeID: nodeID)
  }

  private static func message(_ error: Error) -> String {
    if case DocumentReadError.tooLarge = error { return "This document is too large to edit." }
    if case DocumentReadError.unsupportedText = error {
      return "This file is not a supported UTF-8 text document."
    }
    return FilesModel.message(error)
  }
}
