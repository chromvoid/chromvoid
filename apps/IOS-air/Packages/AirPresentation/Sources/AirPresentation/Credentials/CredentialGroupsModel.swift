import ChromVoidBridge
import Foundation
import Observation

/// One transient browser; Core owns hierarchy, counts, filtering and mutations.
@Observable
@MainActor
public final class CredentialGroupsModel: Identifiable {
  public enum State: Equatable { case loading, ready, failed, missing, revoked }
  public enum Edit: Equatable { case create, rename }
  public enum Mutation: Equatable { case idle, saving, uncertain }
  public let id = UUID()
  public private(set) var path = "/"
  public private(set) var groups: [PassmanagerGroupSummary] = []
  public private(set) var state: State = .loading
  public private(set) var mutation: Mutation = .idle
  public private(set) var edit: Edit?
  public private(set) var name = ""
  public private(set) var issue: String?
  public private(set) var focusRevision = 0
  public private(set) var confirmingDelete = false
  public private(set) var loadingMore = false
  private var nextOffset: UInt32?
  public var canLoadMore: Bool { nextOffset != nil }
  public var canChoose: Bool { state == .ready && mutation == .idle && edit == nil }
  private let store: any CredentialGroupStore
  private let generation: UInt64
  private let onChoose: (String) -> Void
  private let onMutation: () -> Void
  private let work = ModelWork()

  public init(
    store: any CredentialGroupStore, generation: UInt64, path: String = "/",
    onChoose: @escaping (String) -> Void,
    onMutation: @escaping () -> Void
  ) {
    self.path = path
    self.store = store
    self.generation = generation
    self.onChoose = onChoose
    self.onMutation = onMutation
    reload()
  }
  public func browse(_ path: String) {
    guard state != .revoked, mutation == .idle, edit == nil else { return }
    self.path = path
    reload()
  }
  public func up() { browse(Self.parent(of: path)) }
  public static func parent(of path: String) -> String {
    let parent = path.split(separator: "/").dropLast().joined(separator: "/")
    return parent.isEmpty ? "/" : "/" + parent
  }
  public func choose() { if canChoose { onChoose(path) } }
  public func synchronize() {
    if state != .revoked && mutation == .idle && edit == nil { reload() }
  }
  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked, mutation != .saving else { return nil }
    groups = []
    nextOffset = nil
    loadingMore = false
    state = .loading
    return fetch(offset: 0)
  }
  public func loadMore() {
    guard canChoose, !loadingMore, let nextOffset else { return }
    loadingMore = true
    fetch(offset: nextOffset)
  }
  @discardableResult
  private func fetch(offset: UInt32) -> Task<Void, Never> {
    let path = path
    return work.start { [weak self, store, generation] run in
      do {
        let page = try await store.groupPage(parent: path, offset: offset, generation: generation)
        guard let self, run.isCurrent else { return }
        let next = page.nextOffset.flatMap(UInt32.init(exactly:))
        guard page.parent == path, page.nextOffset == nil || next.map({ $0 > offset }) == true,
          page.groups.allSatisfy({ Self.parent(of: $0.path) == path && $0.path != path }),
          Set(self.groups.map(\.path) + page.groups.map(\.path)).count == self.groups.count
            + page.groups.count
        else { throw CredentialStoreError.invalidPage }
        self.groups.append(contentsOf: page.groups)
        self.nextOffset = next
        self.loadingMore = false
        self.state = .ready
        if self.mutation == .uncertain {
          self.mutation = .idle
          self.cancelEdit()
          self.issue = nil
        }
      } catch {
        guard let self, run.isCurrent else { return }
        self.loadingMore = false
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.state = error.coreFailureKind == .missing ? .missing : .failed
        if self.state == .missing {
          self.mutation = .idle
          self.cancelEdit()
        }
      }
    }
  }
  public func beginEdit(_ edit: Edit) {
    guard canChoose, edit != .rename || path != "/" else { return }
    self.edit = edit
    name = edit == .rename ? String(path.split(separator: "/").last ?? "") : ""
    issue = nil
    focusRevision += 1
  }
  public func changeName(_ name: String) {
    if mutation == .idle, self.name != name {
      self.name = name
      issue = nil
    }
  }
  public func cancelEdit() {
    guard mutation != .saving else { return }
    edit = nil
    name = ""
    issue = nil
  }
  @discardableResult
  public func save() -> Task<Void, Never>? {
    guard state == .ready, mutation == .idle, let edit else { return nil }
    let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, !name.hasPrefix("."), !name.contains("/"), !name.contains("\\"),
      !name.contains("\0")
    else {
      issue = "Enter a group name without slashes or a leading dot."
      focusRevision += 1
      return nil
    }
    return mutate(edit == .create ? .create(name) : .rename(name))
  }
  public func requestDelete() { if canChoose && path != "/" { confirmingDelete = true } }
  public func cancelDelete() { confirmingDelete = false }
  @discardableResult
  public func confirmDelete() -> Task<Void, Never>? {
    guard confirmingDelete, canChoose, path != "/" else { return nil }
    confirmingDelete = false
    return mutate(.delete)
  }
  private enum Action {
    case create(String)
    case rename(String)
    case delete
  }
  private func mutate(_ action: Action) -> Task<Void, Never> {
    mutation = .saving
    issue = nil
    let path = path
    return work.start { [weak self, store, generation] run in
      do {
        let destination: String
        switch action {
        case .create(let name):
          destination = path == "/" ? "/" + name : path + "/" + name
          try await store.ensureGroup(path: destination, generation: generation)
        case .rename(let name):
          let parent = Self.parent(of: path)
          destination = parent == "/" ? "/" + name : parent + "/" + name
          try await store.renameGroup(path: path, name: name, generation: generation)
        case .delete:
          destination = Self.parent(of: path)
          try await store.deleteGroup(path: path, generation: generation)
        }
        guard let self, run.isCurrent else { return }
        self.mutation = .idle
        self.cancelEdit()
        self.path = destination
        self.onMutation()
        self.reload()
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.mutation = .idle
        switch error.coreFailureKind {
        case .conflict:
          self.issue = "A group or credential already uses this name."
        case .invalidInput:
          self.issue = "Check the group name and try again."
        case .denied: self.issue = "This vault does not allow this change."
        case .missing:
          self.state = .missing
          self.cancelEdit()
        default:
          self.mutation = .uncertain
          self.issue = "The group change could not be confirmed. Reload groups before trying again."
        }
        self.focusRevision += 1
      }
    }
  }
  public func revoke() {
    work.cancel()
    state = .revoked
    mutation = .idle
    cancelEdit()
    confirmingDelete = false
    groups = []
    path = "/"
    nextOffset = nil
    loadingMore = false
  }
}
