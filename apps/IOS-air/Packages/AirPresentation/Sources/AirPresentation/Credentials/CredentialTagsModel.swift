import ChromVoidBridge
import Foundation
import Observation

/// Core owns tag identity, normalization, counts and atomic assignments.
@Observable
@MainActor
public final class CredentialTagsModel: Identifiable {
  public struct Selection: Equatable {
    public let key: String
    public let label: String
    public init(key: String, label: String) {
      self.key = key
      self.label = label
    }
  }
  private enum Mode {
    case filter((CredentialTagSummary) -> Void)
    case assignment(([Selection]) -> Void)
  }
  public var isAssignment: Bool {
    if case .assignment = mode { return true }
    return false
  }
  public private(set) var selection: [Selection] = []
  public enum State { case loading, ready, failed, revoked }
  public enum Mutation { case idle, saving, uncertain }
  public enum Edit {
    case create
    case existing(CredentialTagSummary)
    var source: String? {
      if case .existing(let tag) = self { return tag.key }
      return nil
    }
  }
  public enum Color: String, CaseIterable {
    case violet, green, blue, pink, amber, orange, cyan
    public var label: String { rawValue.capitalized }
  }
  public let id = UUID()
  public private(set) var tags: [CredentialTagSummary] = []
  public private(set) var state: State = .loading
  public private(set) var mutation: Mutation = .idle
  public private(set) var edit: Edit?
  public private(set) var name = ""
  public private(set) var color: Color = .violet
  public private(set) var issue: String?
  public private(set) var deleting: CredentialTagSummary?
  public private(set) var confirmingDelete = false
  var uncertainTagKey: String? { mutation == .uncertain ? (edit?.source ?? deleting?.key) : nil }
  public private(set) var focusRevision = 0
  public private(set) var loadingMore = false
  private var nextOffset: UInt32?
  public var canLoadMore: Bool { nextOffset != nil }
  public var canChoose: Bool { state == .ready && mutation == .idle && edit == nil }
  private let store: any CredentialTagStore
  private let generation: UInt64
  private let mode: Mode
  private let onMutation: (String?, CredentialTagSummary?) -> Void
  private let work = ModelWork()

  public init(
    store: any CredentialTagStore, generation: UInt64,
    onChoose: @escaping (CredentialTagSummary) -> Void,
    onMutation: @escaping (String?, CredentialTagSummary?) -> Void
  ) {
    self.store = store
    self.generation = generation
    self.mode = .filter(onChoose)
    self.onMutation = onMutation
    reload()
  }
  public init(
    store: any CredentialTagStore, generation: UInt64, selection: [Selection],
    onApply: @escaping ([Selection]) -> Void
  ) {
    self.store = store
    self.generation = generation
    self.selection = selection
    self.mode = .assignment(onApply)
    self.onMutation = { _, _ in }
    reload()
  }
  public func choose(_ tag: CredentialTagSummary) {
    guard canChoose else { return }
    switch mode {
    case .filter(let choose): choose(tag)
    case .assignment:
      if let index = selection.firstIndex(where: { $0.key == tag.key }) {
        selection.remove(at: index)
      } else {
        selection.append(Selection(key: tag.key, label: tag.label))
      }
      issue = nil
    }
  }
  public func applySelection() {
    guard canChoose, case .assignment(let apply) = mode else { return }
    guard selection.count <= 12 else {
      issue = "Choose up to 12 tags per credential."
      return
    }
    apply(selection)
  }
  public func synchronize() {
    if canChoose { reload() }
  }
  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked, mutation != .saving else { return nil }
    tags = []
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
    return work.start { [weak self, store, generation] run in
      do {
        let page = try await store.tagPage(offset: offset, generation: generation)
        guard let self, run.isCurrent else { return }
        let next = page.nextOffset.flatMap(UInt32.init(exactly:))
        guard page.nextOffset == nil || next.map({ $0 > offset }) == true,
          page.tags.allSatisfy({
            !$0.key.isEmpty && !$0.label.isEmpty && Color(rawValue: $0.colorID) != nil
              && $0.count >= 0
          }),
          Set(self.tags.map(\.key) + page.tags.map(\.key)).count == self.tags.count
            + page.tags.count
        else { throw CredentialStoreError.invalidPage }
        self.tags.append(contentsOf: page.tags)
        self.nextOffset = next
        self.loadingMore = false
        self.state = .ready
        if self.mutation == .uncertain {
          let source = self.edit?.source ?? self.deleting?.key
          self.mutation = .idle
          self.cancelEdit()
          self.deleting = nil
          self.onMutation(source, nil)
        }
      } catch {
        guard let self, run.isCurrent else { return }
        self.loadingMore = false
        if error.isSessionRevoked { self.revoke() } else { self.state = .failed }
      }
    }
  }
  public func beginEdit(_ tag: CredentialTagSummary? = nil) {
    guard canChoose, tag == nil || !isAssignment else { return }
    edit = tag.map(Edit.existing) ?? .create
    name = tag?.label ?? ""
    color = tag.flatMap { Color(rawValue: $0.colorID) } ?? .violet
    issue = nil
    focusRevision += 1
  }
  public func changeName(_ value: String) {
    if mutation == .idle, name != value {
      name = value
      issue = nil
    }
  }
  public func changeColor(_ value: Color) { if mutation == .idle { color = value } }
  public func cancelEdit() {
    guard mutation == .idle else { return }
    edit = nil
    name = ""
    color = .violet
    issue = nil
  }
  @discardableResult
  public func save() -> Task<Void, Never>? {
    guard state == .ready, mutation == .idle, let edit else { return nil }
    guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      issue = "Enter a tag name."
      focusRevision += 1
      return nil
    }
    return mutate(source: edit.source, name: name, colorID: color.rawValue)
  }
  public func requestDelete(_ tag: CredentialTagSummary) {
    if canChoose && !isAssignment {
      deleting = tag
      confirmingDelete = true
    }
  }
  public func cancelDelete() {
    if mutation == .idle {
      confirmingDelete = false
      deleting = nil
    }
  }
  @discardableResult
  public func confirmDelete() -> Task<Void, Never>? {
    guard confirmingDelete, canChoose, let deleting else { return nil }
    confirmingDelete = false
    return mutate(source: deleting.key, name: nil, colorID: color.rawValue)
  }
  private func mutate(source: String?, name: String?, colorID: String) -> Task<Void, Never> {
    mutation = .saving
    issue = nil
    return work.start { [weak self, store, generation] run in
      do {
        let replacement: CredentialTagSummary?
        if let name {
          replacement = try await store.saveTag(
            sourceKey: source, label: name, colorID: colorID, generation: generation)
        } else if let source {
          try await store.deleteTag(key: source, generation: generation)
          replacement = nil
        } else {
          throw CredentialStoreError.invalidPage
        }
        guard let self, run.isCurrent else { return }
        self.mutation = .idle
        self.cancelEdit()
        self.deleting = nil
        self.onMutation(source, replacement)
        self.reload()
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.mutation = .idle
        switch error.coreFailureKind {
        case .conflict: self.issue = "A tag already uses this name."
        case .invalidInput: self.issue = "Enter a tag name of 1 to 32 characters."
        case .denied: self.issue = "This vault does not allow this change."
        case .missing:
          self.cancelEdit()
          self.deleting = nil
          self.onMutation(source, nil)
          self.reload()
        default:
          self.mutation = .uncertain
          self.issue = "The tag change could not be confirmed. Reload tags before trying again."
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
    deleting = nil
    confirmingDelete = false
    tags = []
    selection = []
    nextOffset = nil
    loadingMore = false
  }
}
