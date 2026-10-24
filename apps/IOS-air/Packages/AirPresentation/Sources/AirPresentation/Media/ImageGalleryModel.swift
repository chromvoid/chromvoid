import ChromVoidBridge
import Foundation
import Observation

/// A gallery preserves the originating Core page order/version and retains three previews at most.
@MainActor
@Observable
public final class ImageGalleryModel: Identifiable {
  public struct Item: Identifiable {
    public let id: UInt64
    public let name: String
    public let sourceRevision: UInt64
    public let facts: ImageCatalogFacts
  }
  public let id = UUID()
  public private(set) var items: [Item]
  public private(set) var selectedID: UInt64
  public private(set) var previews: [UInt64: ImagePreviewModel] = [:]
  public private(set) var loadingMore = false
  public private(set) var issue: String?
  private let store: any FileCatalogStore
  private let generation: UInt64
  private let posters: ImagePosterCache?
  @ObservationIgnored private var context: CatalogFolderPageRequest?
  private var nextOffset: Int?
  private var revoked = false
  private let work = ModelWork()
  private let neighbourLoads = ModelWork()
  private var windowUpdate: Task<Void, Never>?

  public var hasMore: Bool { nextOffset != nil }
  /// Pending preview-window rebuild after a selection change, for callers that must observe it.
  public var windowSettling: Task<Void, Never>? { windowUpdate }
  public var currentIndex: Int? { items.firstIndex { $0.id == selectedID } }
  public var name: String { items.first { $0.id == selectedID }?.name ?? "" }
  public var canGoBack: Bool { currentIndex.map { $0 > 0 } == true && !revoked }
  public var canGoForward: Bool {
    !revoked
      && (currentIndex.map { $0 + 1 < items.count } == true || (!loadingMore && nextOffset != nil))
  }

  public init(
    store: any FileCatalogStore, generation: UInt64, items: [CatalogListItem],
    selectedID: UInt64, continuation: CatalogFolderPageRequest,
    posters: ImagePosterCache? = nil
  ) {
    self.store = store
    self.generation = generation
    self.posters = posters
    self.items = Self.images(items)
    self.selectedID = selectedID
    context = continuation
    nextOffset = continuation.offset
    updateWindow()
  }

  public func select(_ id: UInt64) {
    guard !revoked, items.contains(where: { $0.id == id }) else { return }
    if selectedID != id { previews[selectedID]?.pause() }
    selectedID = id
    // The UIKit pager keeps its page controllers; rebuilding the window here never touches
    // the page being shown, so it can happen at once.
    updateWindow()
  }

  public func previous() {
    guard canGoBack, let index = currentIndex else { return }
    select(items[index - 1].id)
  }

  @discardableResult
  public func next() -> Task<Void, Never>? {
    guard canGoForward, let index = currentIndex else { return nil }
    if index + 1 < items.count {
      select(items[index + 1].id)
      return nil
    }
    return loadNextPage(advance: true)
  }

  @discardableResult
  public func prefetchNext() -> Task<Void, Never>? {
    guard !revoked, !loadingMore, nextOffset != nil, let index = currentIndex,
      index + 2 >= items.count
    else { return nil }
    return loadNextPage(advance: false)
  }

  private func loadNextPage(advance: Bool) -> Task<Void, Never> {
    loadingMore = true
    issue = nil
    let origin = selectedID
    return work.start { [weak self] run in
      guard let self else { return }
      defer { self.loadingMore = false }
      do {
        while let offset = self.nextOffset, let context = self.context {
          let request = CatalogFolderPageRequest(
            expectedVersion: context.expectedVersion, filter: context.filter,
            limit: context.limit, offset: offset, path: context.path,
            sort: context.sort)
          let page = try await self.store.filePage(request, generation: self.generation)
          guard run.isCurrent else { return }
          if page.reloadRequired || page.version != context.expectedVersion {
            self.nextOffset = nil
            self.issue = "This folder changed. Close the gallery and refresh Files."
            return
          }
          let additions = Self.images(page.items)
          guard page.currentPath == context.path, page.offset == offset,
            page.nextOffset == nil || page.nextOffset.map({ $0 > offset }) == true,
            Set((self.items + additions).map(\.id)).count == self.items.count + additions.count
          else { throw FileCatalogError.invalidPage }
          self.nextOffset = page.nextOffset
          self.items.append(contentsOf: additions)
          if let first = additions.first {
            if advance && self.selectedID == origin {
              self.select(first.id)
            } else {
              self.updateWindow()
            }
            return
          }
        }
      } catch {
        guard run.isCurrent else { return }
        self.issue = FilesModel.message(error)
      }
    }
  }

  public func revoke() {
    revoked = true
    work.cancel()
    neighbourLoads.cancel()
    windowUpdate?.cancel()
    for preview in previews.values { preview.revoke() }
    previews = [:]
    items = []
    selectedID = 0
    nextOffset = nil
    context = nil
    issue = nil
    loadingMore = false
  }

  private func updateWindow() {
    guard let index = currentIndex else { return }
    let window = items[max(0, index - 1)...min(items.count - 1, index + 1)]
    let retained = Set(window.map(\.id))
    for (id, preview) in previews where !retained.contains(id) { preview.revoke() }
    previews = previews.filter { retained.contains($0.key) }
    for item in window where previews[item.id] == nil {
      previews[item.id] = ImagePreviewModel(
        store: store, nodeID: item.id, generation: generation, name: item.name,
        sourceRevision: item.sourceRevision, posters: posters, catalog: item.facts,
        derivatives: store as? any DerivativeStore)
    }
    loadWindow()
  }

  /// The visible image reads first. Neighbours are pre-built by the pager but start reading only
  /// once it is ready, so the single Core worker and the main actor are not shared three ways
  /// while the user waits.
  private func loadWindow() {
    neighbourLoads.cancel()
    guard let selected = previews[selectedID] else { return }
    let origin = selectedID
    let current = selected.load() ?? selected.currentLoad
    neighbourLoads.start { [weak self] run in
      await current?.value
      guard let self, run.isCurrent, self.selectedID == origin else { return }
      for (id, preview) in self.previews where id != origin && preview.state == .idle {
        preview.load()
      }
    }
  }

  private static func images(_ items: [CatalogListItem]) -> [Item] {
    items.compactMap { item in
      guard !item.isDir, let id = UInt64(exactly: item.nodeID),
        ImagePreviewDecoder.supports(name: item.name, mimeType: item.mimeType)
      else { return nil }
      return Item(
        id: id, name: item.name, sourceRevision: UInt64(exactly: item.sourceRevision) ?? 0,
        facts: ImageCatalogFacts(
          path: item.path, size: item.size ?? 0, mimeType: item.mimeType, createdAt: item.createdAt,
          updatedAt: item.updatedAt))
    }
  }
}
