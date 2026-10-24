import ChromVoidBridge
import Foundation
import Observation

/// A reviewed batch of independent Core mutations. Stop cannot roll back confirmed writes.
@MainActor
@Observable
public final class FileOperationModel: Identifiable {
  public enum Kind { case move, delete }
  public enum State: Equatable { case reviewing, running, stopping, finished, revoked }
  public enum Outcome: Equatable {
    case pending, running, completed, uncertain
    case failed(String)
  }
  public struct Item: Identifiable {
    public let source: CatalogListItem
    public var outcome: Outcome = .pending
    public var id: Int { source.nodeID }
  }
  public let id = UUID()
  public let kind: Kind
  public private(set) var state: State = .reviewing
  public private(set) var items: [Item]
  public private(set) var browser: FilesModel?
  public private(set) var destination = ""
  public private(set) var issue: String?
  private let store: any FileCatalogStore
  private let generation: UInt64
  private let onFinished: (Set<Int>) -> Void
  private let work = ModelWork()
  public var busy: Bool { state == .running || state == .stopping }
  public var completedCount: Int { items.filter { $0.outcome == .completed }.count }
  public var title: String { kind == .move ? "Move items" : "Delete items" }

  public init(
    kind: Kind, items: [CatalogListItem], store: any FileCatalogStore,
    imports: any FileImportStore, generation: UInt64,
    preferences: FilePreferences = FilePreferences(),
    onFinished: @escaping (Set<Int>) -> Void
  ) {
    self.kind = kind
    self.items = items.map { Item(source: $0) }
    self.store = store
    self.generation = generation
    self.onFinished = onFinished
    if kind == .move {
      browser = FilesModel(
        store: store, imports: imports, generation: generation, preferences: preferences)
    }
  }

  public func folders(in folder: FilesModel) -> [CatalogListItem] {
    // Starting at root and refusing selected directory IDs makes their subtrees unreachable.
    // This is navigation affordance only; Core validates the actual destination at commit.
    let excluded = Set(items.filter { $0.source.isDir }.map(\.id))
    return folder.items.filter { $0.isDir && !excluded.contains($0.nodeID) }
  }

  public func openFolder(_ item: CatalogListItem, in folder: FilesModel) {
    guard state == .reviewing, folders(in: folder).contains(where: { $0.nodeID == item.nodeID })
    else { return }
    issue = nil
    folder.open(item)
  }

  @discardableResult
  public func start(in folder: FilesModel? = nil) -> Task<Void, Never>? {
    guard state == .reviewing, !items.isEmpty else { return nil }
    if kind == .move {
      guard let folder, folder.state == .ready else {
        issue = "Wait for the destination folder to load."
        return nil
      }
      guard !items.allSatisfy({ $0.source.parentPath == folder.path }) else {
        issue = "These items are already in this folder. Choose another destination."
        return nil
      }
      destination = folder.path
    }
    browser?.revoke()
    browser = nil
    issue = nil
    state = .running
    return work.start { [weak self, store, generation, kind, destination] run in
      guard let self else { return }
      for index in self.items.indices {
        guard run.isCurrent else { break }
        let id = UInt64(self.items[index].id)
        self.items[index].outcome = .running
        do {
          switch kind {
          case .move: try await store.moveFile(id: id, parent: destination, generation: generation)
          case .delete: try await store.deleteFile(id: id, generation: generation)
          }
          guard self.state != .revoked else { return }
          self.items[index].outcome = .completed
        } catch {
          guard self.state != .revoked else { return }
          if !Task.isCancelled, let failure = error as? RPCFailure,
            [
              "NAME_EXIST", "NODE_NOT_FOUND", "PATH_NOT_FOUND", "SYSTEM_SHARD_DENIED",
              "EMPTY_PAYLOAD", "NOT_A_DIR",
            ].contains(failure.code ?? "")
          {
            self.items[index].outcome = .failed(FilesModel.message(error))
          } else {
            self.items[index].outcome = .uncertain
            break
          }
        }
      }
      guard self.state != .revoked else { return }
      self.state = .finished
      self.onFinished(Set(self.items.filter { $0.outcome == .completed }.map(\.id)))
    }
  }

  public func stop() {
    guard state == .running else { return }
    state = .stopping
    work.cancel()
  }

  public func revoke() {
    work.cancel()
    browser?.revoke()
    browser = nil
    state = .revoked
    items = []
    destination = ""
    issue = nil
  }
}
