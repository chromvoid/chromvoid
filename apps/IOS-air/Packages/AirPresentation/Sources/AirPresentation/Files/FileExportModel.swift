import ChromVoidBridge
import Foundation
import Observation

@MainActor
@Observable
public final class FileExportModel: Identifiable {
  public enum State { case review, preparing, ready, sharing, finishing, finished, revoked }
  public enum Outcome: String {
    case pending = "Not prepared"
    case preparing = "Preparing…"
    case ready = "Ready to share"
    case failed = "Could not prepare"
    case skipped = "Select files inside this folder to export them."
    case shared = "Shared"
    case uncertain = "Not confirmed"
  }
  public struct Item: Identifiable {
    public let id: Int
    public var name: String
    public var outcome: Outcome
    public var received: UInt64 = 0
    public var total: UInt64 = 0
    public var issue: String?
  }
  public struct ShareRequest: Identifiable {
    public let id = UUID()
    public let urls: [URL]
  }
  public let id = UUID()
  public private(set) var state: State = .review
  public private(set) var items: [Item]
  public private(set) var shareRequest: ShareRequest?
  public private(set) var issue: String?
  private let store: any FileCatalogStore
  private let generation: UInt64
  private var copies: [FileExportCopy] = []
  private let work = ModelWork()
  @ObservationIgnored private var attempt: UUID?
  public var canPrepare: Bool { items.contains { $0.outcome == .pending } }
  public var preparedCount: Int { copies.count }

  public init(items: [CatalogListItem], store: any FileCatalogStore, generation: UInt64) {
    self.items = items.map {
      Item(id: $0.nodeID, name: $0.name, outcome: $0.isDir ? .skipped : .pending)
    }
    self.store = store
    self.generation = generation
  }

  @discardableResult
  public func prepare() -> Task<Void, Never>? {
    guard state == .review, canPrepare else { return nil }
    state = .preparing
    let pending = items.enumerated().filter { $0.element.outcome == .pending }
    return work.start { [weak self, store, generation] run in
      for (index, item) in pending {
        guard let self, self.state == .preparing, run.isCurrent else { return }
        self.items[index].outcome = .preparing
        do {
          let copy = try await store.prepareFileExport(id: UInt64(item.id), generation: generation)
          {
            [weak self] received, total in
            guard let self, self.state == .preparing else { return }
            self.items[index].received = received
            self.items[index].total = total
          }
          guard self.state == .preparing, run.isCurrent else {
            try await copy.close()
            return
          }
          guard copy.url != nil, let metadata = copy.metadata else {
            try await copy.close()
            throw BridgeError.SessionRevoked
          }
          self.copies.append(copy)
          self.items[index].name = metadata.name
          self.items[index].outcome = .ready
        } catch {
          guard self.state == .preparing, run.isCurrent else { return }
          if error.isSessionRevoked {
            self.revoke()
            return
          }
          self.items[index].outcome = .failed
          self.items[index].issue = FilesModel.message(error)
        }
      }
      guard let self, self.state == .preparing else { return }
      self.state = .ready
      if !self.items.contains(where: { $0.outcome == .failed || $0.outcome == .skipped }) {
        self.share()
      }
    }
  }

  public func share() {
    guard state == .ready, !copies.isEmpty else { return }
    let urls = copies.compactMap(\.url)
    guard urls.count == copies.count else {
      revoke()
      return
    }
    let request = ShareRequest(urls: urls)
    attempt = request.id
    shareRequest = request
    state = .sharing
  }

  @discardableResult
  public func finishSharing(attempt: UUID, completed: Bool, failed: Bool) -> Task<Void, Never>? {
    guard self.attempt == attempt, state == .sharing else { return nil }
    self.attempt = nil
    shareRequest = nil
    if !completed && !failed {
      state = .ready
      return nil
    }
    state = .finishing
    if failed {
      issue = "The destination did not confirm completion. Some files may have been copied."
    }
    for index in items.indices where items[index].outcome == .ready {
      items[index].outcome = failed ? .uncertain : .shared
    }
    let copies = copies
    self.copies = []
    return work.start { [weak self] run in
      var cleanupFailed = false
      for copy in copies {
        do { try await copy.close() } catch { cleanupFailed = true }
      }
      guard let self, run.isCurrent else { return }
      if cleanupFailed { self.issue = "The temporary export copy could not be removed." }
      self.state = .finished
    }
  }

  public func revoke() {
    work.cancel()
    for copy in copies { copy.revoke() }
    copies = []
    items = []
    shareRequest = nil
    attempt = nil
    issue = nil
    state = .revoked
  }
}
