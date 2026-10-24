import ChromVoidBridge
import Foundation
import Observation

@Observable
@MainActor
public final class SSHModel: Identifiable {
  public enum KeyType: String, CaseIterable {
    case all = ""
    case ed25519, rsa, ecdsa
  }
  public enum State: Equatable { case loading, ready, failed, stale, revoked }
  public let id = UUID()
  public private(set) var state: State = .loading
  public private(set) var query = ""
  public private(set) var keyType: KeyType = .all
  public var hasFilters: Bool { !query.isEmpty || keyType != .all }
  public private(set) var keys: [SSHKeySummary] = []
  public private(set) var loadingMore = false
  public private(set) var creation: SSHCreationModel?
  public private(set) var linkedCredential: CredentialDetailModel?
  public private(set) var selected: SSHDetailModel?
  private var nextOffset: Int?
  public var canLoadMore: Bool { nextOffset != nil }
  public let sourceID: String?
  private let store: any CredentialStore
  private let generation: UInt64
  private let clipboard: any CredentialClipboard
  private let onMutation: () -> Void
  @ObservationIgnored private var revision: String?
  private let work = ModelWork()

  public init(
    store: any CredentialStore, generation: UInt64, sourceID: String? = nil,
    clipboard: any CredentialClipboard = SystemCredentialClipboard(),
    onMutation: @escaping () -> Void = {}
  ) {
    self.store = store
    self.generation = generation
    self.sourceID = sourceID
    self.clipboard = clipboard
    self.onMutation = onMutation
  }
  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked else { return nil }
    clear()
    state = .loading
    return fetch(offset: 0)
  }
  @discardableResult
  public func search(_ query: String) -> Task<Void, Never>? {
    guard state != .revoked, self.query != query else { return nil }
    self.query = query
    return reload()
  }
  @discardableResult
  public func setKeyType(_ type: KeyType) -> Task<Void, Never>? {
    guard state != .revoked, keyType != type else { return nil }
    keyType = type
    return reload()
  }
  @discardableResult
  public func clearFilters() -> Task<Void, Never>? {
    guard state != .revoked, hasFilters else { return nil }
    query = ""
    keyType = .all
    return reload()
  }
  @discardableResult
  public func loadMore() -> Task<Void, Never>? {
    guard state == .ready, !loadingMore, let nextOffset else { return nil }
    loadingMore = true
    return fetch(offset: nextOffset)
  }
  public func beginCreation() {
    guard state != .revoked, creation == nil else { return }
    creation = SSHCreationModel(store: store, generation: generation, sourceID: sourceID) {
      [weak self] in
      self?.endCreation()
      self?.onMutation()
    }
  }
  public func endCreation() {
    creation?.revoke()
    creation = nil
    if state != .revoked { reload() }
  }
  public func select(_ id: String) {
    guard state == .ready, let row = keys.first(where: { $0.key.id == id }) else { return }
    selected?.revoke()
    selected = SSHDetailModel(
      row: row, store: store, generation: generation, clipboard: clipboard,
      onMutation: { [weak self] in
        self?.invalidate()
        self?.onMutation()
      },
      onDelete: { [weak self] in self?.closeDetail() },
      onOpenSource: { [weak self] in self?.openSource($0) })
  }
  private func openSource(_ id: String) {
    guard state != .revoked, linkedCredential == nil else { return }
    linkedCredential = CredentialDetailModel(
      id: id, store: store, generation: generation, clipboard: clipboard,
      onDelete: { [weak self] in
        self?.closeSource()
        self?.invalidate()
        self?.onMutation()
      },
      onMutation: { [weak self] in
        self?.invalidate()
        self?.onMutation()
      })
  }
  public func closeSource() {
    linkedCredential?.revoke()
    linkedCredential = nil
  }
  public func closeDetail() {
    closeSource()
    selected?.revoke()
    selected = nil
    if state != .revoked { reload() }
  }
  public func coverSensitiveValues() {
    linkedCredential?.hideSecrets()
    if creation != nil { endCreation() }
    selected?.cancelExport()
  }
  public func invalidate() {
    guard state != .revoked else { return }
    clear()
    state = .stale
  }
  public func revoke() {
    closeSource()
    clear()
    state = .revoked
    creation?.revoke()
    creation = nil
    selected?.revoke()
    selected = nil
    query = ""
    keyType = .all
  }
  private func clear() {
    work.cancel()
    keys = []
    revision = nil
    nextOffset = nil
    loadingMore = false
  }
  private func fetch(offset: Int) -> Task<Void, Never> {
    let request = PassmanagerSSHPageRequest(
      keyType: keyType == .all ? nil : keyType.rawValue, limit: 50, offset: offset, query: query,
      revision: revision, sourceEntryID: sourceID)
    return work.start { [weak self, store, generation] run in
      do {
        let page = try await store.sshPage(request, generation: generation)
        guard let self, run.isCurrent else { return }
        guard page.revision.count == 64, page.keys.count <= 50,
          self.revision == nil || self.revision == page.revision,
          page.nextOffset == nil || (page.nextOffset ?? 0) > offset,
          page.nextOffset == nil || !page.keys.isEmpty,
          page.keys.allSatisfy({ !$0.key.id.isEmpty && $0.revision.count == 64 }),
          Set((self.keys + page.keys).map { $0.key.id }).count == self.keys.count + page.keys.count
        else { throw CredentialStoreError.invalidPage }
        self.keys += page.keys
        self.revision = page.revision
        self.nextOffset = page.nextOffset
        self.loadingMore = false
        self.state = .ready
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.clear()
        self.state = error.coreFailure?.code == "SYNC_CONFLICT" ? .stale : .failed
      }
    }
  }
}
