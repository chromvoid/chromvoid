import ChromVoidBridge
import Foundation
import Observation

/// One folder route. Core owns paths, filtering, ordering, versions and writes.
@MainActor
@Observable
public final class FilesModel: Identifiable {
  public enum State: Equatable { case loading, ready, failed, revoked }
  public enum Sort: String, CaseIterable {
    case name = "Name"
    case date = "Date modified"
    case size = "Size"
    case type = "Type"
    var key: String { String(describing: self) }
  }
  public enum Edit {
    case create
    case rename(CatalogListItem)
  }
  /// The one sheet this folder can show at a time. The pushed child folder, the delete alert
  /// and the attachment-folder picker (hosted by Settings on the shared root) are separate state.
  public enum Presentation: Identifiable {
    case importing(FileImportModel)
    case operation(FileOperationModel)
    case creatingNote(NoteCreationModel)
    case exporting(FileExportModel)
    case document(DocumentNavigator)
    case imagePreview(ImageGalleryModel)
    case mediaPreview(MediaPreviewModel)
    case pdfPreview(PDFPreviewModel)
    case edit(Edit)
    case info(SourceMetadataResponse)
    public var id: String {
      switch self {
      case .importing: "importing"
      case .operation: "operation"
      case .creatingNote: "creatingNote"
      case .exporting: "exporting"
      case .document: "document"
      case .imagePreview: "imagePreview"
      case .mediaPreview: "mediaPreview"
      case .pdfPreview: "pdfPreview"
      case .edit(.create): "edit:create"
      case .edit(.rename(let item)): "edit:rename:" + String(item.nodeID)
      case .info: "info"
      }
    }
  }
  public let id = UUID()
  public private(set) var path: String
  public let generation: UInt64
  public private(set) var items: [CatalogListItem] = []
  public private(set) var state: State = .loading
  public private(set) var child: FilesModel?
  public private(set) var query = ""
  public private(set) var sort: Sort = .name
  public private(set) var descending = false
  public private(set) var includeHidden = false
  public private(set) var notesOnly = false
  public private(set) var total = 0
  public private(set) var loadingMore = false
  public private(set) var issue: String?
  public private(set) var presentation: Presentation?
  public private(set) var name = ""
  public private(set) var validationRevision = 0
  public private(set) var saving = false
  public private(set) var deleting: CatalogListItem?
  public private(set) var selecting = false
  public private(set) var selected: [Int: CatalogListItem] = [:]
  /// Chosen from Settings on the shared root, so it is not part of `presentation`.
  public private(set) var attachmentFolderPicker: AttachmentFolderModel?
  private let imports: any FileImportStore
  private let store: any FileCatalogStore
  /// Session-wide decoded posters, shared with folders below and emptied by the root on revoke.
  public let posters: ImagePosterCache
  private let ownsPosters: Bool
  private let preferences: FilePreferences
  @ObservationIgnored private var hiddenPreference: FilePreferenceObservation?
  @ObservationIgnored private var hiddenDefault: Bool
  private var nextOffset: Int?
  @ObservationIgnored private var version: Int?
  @ObservationIgnored private var sequence: UInt64?
  private let work = ModelWork()
  private let mutation = ModelWork()
  private let infoWork = ModelWork()
  public var canLoadMore: Bool { nextOffset != nil }
  public var editTitle: String {
    if case .create = edit { return "New folder" }
    return "Rename"
  }
  public var title: String { path == "/" ? "Files" : String(path.split(separator: "/").last ?? "") }

  // MARK: Presentation accessors

  public var importing: FileImportModel? {
    if case .importing(let model) = presentation { return model }
    return nil
  }
  public var operation: FileOperationModel? {
    if case .operation(let model) = presentation { return model }
    return nil
  }
  public var creatingNote: NoteCreationModel? {
    if case .creatingNote(let model) = presentation { return model }
    return nil
  }
  public var exporting: FileExportModel? {
    if case .exporting(let model) = presentation { return model }
    return nil
  }
  public var document: DocumentNavigator? {
    if case .document(let model) = presentation { return model }
    return nil
  }
  public var imagePreview: ImageGalleryModel? {
    if case .imagePreview(let model) = presentation { return model }
    return nil
  }
  public var mediaPreview: MediaPreviewModel? {
    if case .mediaPreview(let model) = presentation { return model }
    return nil
  }
  public var pdfPreview: PDFPreviewModel? {
    if case .pdfPreview(let model) = presentation { return model }
    return nil
  }
  public var edit: Edit? {
    if case .edit(let edit) = presentation { return edit }
    return nil
  }
  public var info: SourceMetadataResponse? {
    if case .info(let value) = presentation { return value }
    return nil
  }

  public init(
    store: any FileCatalogStore, imports: any FileImportStore, generation: UInt64,
    path: String = "/", preferences: FilePreferences = FilePreferences(),
    posters: ImagePosterCache? = nil
  ) {
    self.store = store
    self.imports = imports
    self.generation = generation
    self.path = path
    self.preferences = preferences
    self.posters = posters ?? ImagePosterCache()
    ownsPosters = posters == nil
    hiddenDefault = preferences.showHidden
    includeHidden = preferences.showHidden
    hiddenPreference = preferences.observeShowHidden { [weak self] next in
      guard let self, self.state != .revoked else { return }
      let previous = self.hiddenDefault
      self.hiddenDefault = next
      guard self.includeHidden == previous, self.includeHidden != next else { return }
      self.includeHidden = next
      self.reload()
    }
    reload()
  }

  public func setQuery(_ value: String) {
    guard state != .revoked else { return }
    query = value
    reload()
  }
  public func setSort(_ value: Sort) {
    guard state != .revoked else { return }
    sort = value
    reload()
  }
  public func setDescending(_ value: Bool) {
    guard state != .revoked else { return }
    descending = value
    reload()
  }
  public func setIncludeHidden(_ value: Bool) {
    guard state != .revoked else { return }
    includeHidden = value
    reload()
  }
  public func setNotesOnly(_ value: Bool) {
    guard state != .revoked else { return }
    notesOnly = value
    reload()
  }

  public func synchronize(sequence: UInt64) {
    guard state != .revoked else { return }
    child?.synchronize(sequence: sequence)
    attachmentFolderPicker?.browser.synchronize(sequence: sequence)
    guard self.sequence != sequence else { return }
    let initial = self.sequence == nil
    self.sequence = sequence
    if !initial && !saving { reload() }
  }

  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked, !saving else { return nil }
    work.cancel()
    items = []
    total = 0
    version = nil
    nextOffset = nil
    state = .loading
    issue = nil
    return fetch(offset: 0)
  }

  public func loadMore() {
    guard state == .ready, !saving, !loadingMore, let nextOffset else { return }
    fetch(offset: nextOffset)
  }

  @discardableResult
  private func fetch(offset: Int) -> Task<Void, Never> {
    let request = pageRequest(offset: offset)
    loadingMore = offset > 0
    return work.start { [weak self, store, generation] run in
      do {
        try Task.checkCancellation()
        let page = try await store.filePage(request, generation: generation)
        guard let self, run.isCurrent else { return }
        if page.reloadRequired {
          self.items = []
          self.nextOffset = nil
          self.state = .failed
          self.issue = "This folder changed. Refresh to see the latest files."
          self.loadingMore = false
          return
        }
        guard page.currentPath == self.path, page.offset == offset,
          page.nextOffset == nil || page.nextOffset.map({ $0 > offset }) == true,
          Set((self.items + page.items).map(\.nodeID)).count == self.items.count + page.items.count
        else { throw FileCatalogError.invalidPage }
        self.items.append(contentsOf: page.items)
        for item in page.items where self.selected[item.nodeID] != nil {
          self.selected[item.nodeID] = item
        }
        self.version = page.version
        self.total = page.totalCount
        self.nextOffset = page.nextOffset
        self.state = .ready
        self.loadingMore = false
      } catch {
        guard let self, run.isCurrent else { return }
        self.loadingMore = false
        self.state = .failed
        self.issue = Self.message(error)
      }
    }
  }

  private func pageRequest(offset: Int?) -> CatalogFolderPageRequest {
    return CatalogFolderPageRequest(
      expectedVersion: version,
      filter: CatalogFolderFilter(
        fileTypes: notesOnly ? ["markdown"] : [], includeHidden: includeHidden,
        // Notes search reads the notes themselves, as its prompt says; Core caps the bytes
        // it will read per note. The folder list stays a name search.
        includeTextContent: notesOnly,
        query: query, recursive: notesOnly),
      limit: 50, offset: offset, path: path,
      sort: CatalogFolderSort(by: sort.key, direction: descending ? "desc" : "asc"))
  }

  /// A new sheet may open over the list or over the info sheet, which the openers dismiss
  /// first; never over another sheet, whose model would otherwise be replaced unrevoked.
  private var canPresentSheet: Bool { presentation == nil || info != nil }
  public func open(_ item: CatalogListItem) {
    guard state != .revoked, !saving, canPresentSheet else { return }
    if selecting {
      toggleSelection(item)
      return
    }
    if item.isDir {
      dismissInfo()
      guard let path = item.path else {
        issue = "This folder could not be opened."
        return
      }
      child = FilesModel(
        store: store, imports: imports, generation: generation, path: path,
        preferences: preferences, posters: posters)
    } else if ImagePreviewDecoder.supports(name: item.name, mimeType: item.mimeType) {
      dismissInfo()
      presentation = .imagePreview(
        ImageGalleryModel(
          store: store, generation: generation, items: items, selectedID: UInt64(item.nodeID),
          continuation: pageRequest(offset: nextOffset), posters: posters))
    } else if MediaPreviewModel.supports(name: item.name, mimeType: item.mimeType) {
      dismissInfo()
      presentation = .mediaPreview(
        MediaPreviewModel(
          store: store, nodeID: UInt64(item.nodeID), generation: generation, name: item.name))
    } else if PDFPreviewModel.supports(name: item.name, mimeType: item.mimeType) {
      dismissInfo()
      presentation = .pdfPreview(
        PDFPreviewModel(
          store: store, nodeID: UInt64(item.nodeID), generation: generation, name: item.name))
    } else if DocumentModel.supports(item) {
      dismissInfo()
      presentation = .document(
        DocumentNavigator(
          store: store, nodeID: UInt64(item.nodeID), generation: generation,
          imports: imports, filePreferences: preferences
        ) {
          [weak self] in self?.reload()
        })
    } else {
      showInfo(item)
    }
  }
  public func importFiles() {
    guard state != .revoked, !saving, canPresentSheet else { return }
    dismissInfo()
    presentation = .importing(
      FileImportModel(store: imports, parent: path, generation: generation) {
        [weak self] in
        self?.reload()
      })
  }
  public func dismissImport() {
    guard let importing, !importing.busy else { return }
    importing.revoke()
    presentation = nil
  }
  public func exportFiles(_ item: CatalogListItem? = nil) {
    guard state != .revoked, !saving, canPresentSheet else { return }
    let entries = item.map { [$0] } ?? selected.values.sorted { $0.nodeID < $1.nodeID }
    guard !entries.isEmpty else { return }
    dismissInfo()
    presentation = .exporting(FileExportModel(items: entries, store: store, generation: generation))
  }
  public func dismissExport() {
    guard let exporting else { return }
    exporting.revoke()
    presentation = nil
  }
  public func closeChild() {
    child?.revoke()
    child = nil
  }
  public func beginSelection() {
    guard state != .revoked, !saving, operation == nil else { return }
    selecting = true
  }
  public func endSelection() {
    guard operation == nil else { return }
    selecting = false
    selected = [:]
  }
  public func toggleSelection(_ item: CatalogListItem) {
    guard selecting, state != .revoked, operation == nil else { return }
    if selected.removeValue(forKey: item.nodeID) == nil { selected[item.nodeID] = item }
  }
  public func operate(_ kind: FileOperationModel.Kind, item: CatalogListItem? = nil) {
    guard state != .revoked, !saving, canPresentSheet else { return }
    let entries = item.map { [$0] } ?? selected.values.sorted { $0.nodeID < $1.nodeID }
    guard !entries.isEmpty else { return }
    dismissInfo()
    let operation = FileOperationModel(
      kind: kind, items: entries, store: store, imports: imports, generation: generation,
      preferences: preferences
    ) { [weak self] completed in
      guard let self, self.state != .revoked else { return }
      for id in completed { self.selected.removeValue(forKey: id) }
      self.reload()
    }
    presentation = .operation(operation)
    if kind == .delete && !preferences.confirmDeletion { operation.start() }
  }
  public func dismissOperation() {
    guard let operation, !operation.busy else { return }
    operation.revoke()
    presentation = nil
  }
  public func createFolder() {
    guard state != .revoked, !saving, canPresentSheet else { return }
    dismissInfo()
    presentation = .edit(.create)
    name = ""
    issue = nil
  }
  public func createNote() {
    guard state != .revoked, !saving, canPresentSheet else { return }
    dismissInfo()
    presentation = .creatingNote(
      NoteCreationModel(store: store, parent: path, generation: generation) {
        [weak self] in
        guard let self, self.state != .revoked else { return }
        if case .creatingNote = self.presentation { self.presentation = nil }
        self.reload()
      })
  }
  public func dismissNote() {
    guard let creatingNote, !creatingNote.busy else { return }
    creatingNote.revoke()
    presentation = nil
  }
  public func rename(_ item: CatalogListItem) {
    guard state != .revoked, !saving, canPresentSheet else { return }
    dismissInfo()
    presentation = .edit(.rename(item))
    name = item.name
    issue = nil
  }
  public func setName(_ value: String) {
    guard state != .revoked, name != value else { return }
    name = value
    issue = nil
  }
  public func dismissEdit() {
    guard state != .revoked, !saving else { return }
    if case .edit = presentation { presentation = nil }
    name = ""
    issue = nil
  }

  public func saveName() {
    guard !saving, state != .revoked, let edit else { return }
    guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      issue = "Enter a name."
      validationRevision += 1
      return
    }
    let name = name
    runMutation { [store, generation, path] in
      switch edit {
      case .create: try await store.createFolder(name: name, parent: path, generation: generation)
      case .rename(let item):
        try await store.renameFile(
          id: UInt64(item.nodeID), name: Self.keepingMarkdownSuffix(name, of: item),
          generation: generation)
      }
    }
  }
  /// A renamed note keeps its `.md`: the file stays markdown either way, and a name without
  /// it stops looking like the note it is.
  static func keepingMarkdownSuffix(_ name: String, of item: CatalogListItem) -> String {
    let suffixes = [".md", ".markdown"]
    let lower = name.lowercased()
    guard !item.isDir, suffixes.contains(where: { item.name.lowercased().hasSuffix($0) }),
      !suffixes.contains(where: { lower.hasSuffix($0) })
    else { return name }
    return name + ".md"
  }
  public func requestDelete(_ item: CatalogListItem) {
    if state != .revoked, !saving {
      dismissInfo()
      if preferences.confirmDeletion {
        deleting = item
      } else {
        deleteFile(item)
      }
    }
  }
  public func dismissDelete() { deleting = nil }
  public func deleteConfirmed() {
    guard let deleting, !saving, state != .revoked else { return }
    self.deleting = nil
    deleteFile(deleting)
  }

  private func deleteFile(_ item: CatalogListItem) {
    runMutation { [weak self, store, generation] in
      try await store.deleteFile(id: UInt64(item.nodeID), generation: generation)
      self?.selected.removeValue(forKey: item.nodeID)
    }
  }

  private func runMutation(_ action: @escaping @MainActor () async throws -> Void) {
    saving = true
    issue = nil
    mutation.start { [weak self] run in
      do {
        try Task.checkCancellation()
        try await action()
        guard let self, run.isCurrent else { return }
        self.saving = false
        if case .edit = self.presentation { self.presentation = nil }
        self.name = ""
        self.reload()
      } catch {
        guard let self, run.isCurrent else { return }
        self.saving = false
        self.issue = Self.message(error)
        self.validationRevision += 1
      }
    }
  }

  public func showInfo(_ item: CatalogListItem) {
    guard state != .revoked, canPresentSheet else { return }
    infoWork.start { [weak self, store, generation] run in
      do {
        let value = try await store.fileInfo(id: UInt64(item.nodeID), generation: generation)
        // Another sheet may have opened while the metadata was loading; it keeps priority.
        guard let self, run.isCurrent, self.canPresentSheet else { return }
        self.presentation = .info(value)
      } catch {
        guard let self, run.isCurrent else { return }
        self.issue = Self.message(error)
      }
    }
  }
  public func dismissInfo() {
    infoWork.cancel()
    if case .info = presentation { presentation = nil }
  }
  public func dismissDocument() {
    guard let document else { return }
    document.revoke()
    presentation = nil
  }
  public func dismissImagePreview() {
    guard let imagePreview else { return }
    imagePreview.revoke()
    presentation = nil
  }
  public func dismissPDFPreview() {
    guard let pdfPreview else { return }
    pdfPreview.revoke()
    presentation = nil
  }

  public func dismissMediaPreview() {
    guard let mediaPreview else { return }
    mediaPreview.revoke()
    presentation = nil
  }
  public func chooseAttachmentFolder() {
    guard state != .revoked, attachmentFolderPicker == nil else { return }
    let browser = FilesModel(
      store: store, imports: imports, generation: generation, preferences: preferences)
    attachmentFolderPicker = AttachmentFolderModel(browser: browser, preferences: preferences) {
      [weak self] in self?.dismissAttachmentFolder()
    }
  }

  public func dismissAttachmentFolder() {
    attachmentFolderPicker?.revoke()
    attachmentFolderPicker = nil
  }

  public func revoke() {
    if ownsPosters { posters.removeAll() }
    dismissAttachmentFolder()
    hiddenPreference = nil
    work.cancel()
    mutation.cancel()
    infoWork.cancel()
    closeChild()
    switch presentation {
    case .importing(let model): model.revoke()
    case .operation(let model): model.revoke()
    case .creatingNote(let model): model.revoke()
    case .exporting(let model): model.revoke()
    case .document(let model): model.revoke()
    case .imagePreview(let model): model.revoke()
    case .mediaPreview(let model): model.revoke()
    case .pdfPreview(let model): model.revoke()
    case .edit, .info, nil: break
    }
    presentation = nil
    selecting = false
    selected = [:]
    notesOnly = false
    items = []
    path = "/"
    total = 0
    query = ""
    name = ""
    deleting = nil
    issue = nil
    nextOffset = nil
    version = nil
    saving = false
    loadingMore = false
    state = .revoked
  }

  static func message(_ error: Error) -> String {
    if let failure = error as? RPCFailure {
      switch failure.code {
      case "ACCESS_DENIED": return "Access to this item is denied."
      case "NAME_EXIST": return "An item with that name already exists."
      case "NODE_NOT_FOUND", "PATH_NOT_FOUND":
        return "This item is no longer available. Refresh the folder."
      case "SYSTEM_SHARD_DENIED": return "This location is managed by the vault."
      case "EMPTY_PAYLOAD", "INVALID_NAME": return "Choose a valid file or folder name."
      default: break
      }
    }
    return "The operation could not finish. Refresh the folder before trying again."
  }
}
