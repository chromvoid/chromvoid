import ChromVoidBridge
import Foundation
import Observation

/// Transient audit projection; Core owns every assessment and vault-wide comparison.
@Observable
@MainActor
public final class CredentialAuditModel: Identifiable {
  public enum State: Equatable { case loading, ready, failed, stale, revoked }
  public enum Filter: String, CaseIterable {
    case all, weak, reused, failed
    case withoutOTP = "without_otp"
    public var label: String {
      switch self {
      case .all: "All credentials"
      case .weak: "Weak passwords"
      case .reused: "Reused passwords"
      case .failed: "Not checked"
      case .withoutOTP: "Without one-time codes"
      }
    }
  }
  public struct Counts {
    public let total: Int
    public let weak: Int
    public let reused: Int
    public let otp: Int
    public let failed: Int
  }
  public let id = UUID()
  public private(set) var state: State = .loading
  public private(set) var filter: Filter = .all
  public private(set) var rows: [CredentialSecurityAuditRow] = []
  public private(set) var counts: Counts?
  public private(set) var loadingMore = false
  public private(set) var selected: CredentialDetailModel?
  private var nextOffset: Int?
  public var canLoadMore: Bool { nextOffset != nil }
  @ObservationIgnored private var revision: String?
  private let store: any CredentialStore
  private let generation: UInt64
  private let clipboard: any CredentialClipboard
  private let onMutation: () -> Void
  private let work = ModelWork()

  public init(
    store: any CredentialStore, generation: UInt64,
    clipboard: any CredentialClipboard = SystemCredentialClipboard(),
    onMutation: @escaping () -> Void = {}
  ) {
    self.store = store
    self.generation = generation
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
  public func setFilter(_ value: Filter) {
    guard state != .revoked, value != filter else { return }
    filter = value
    reload()
  }
  @discardableResult
  public func loadMore() -> Task<Void, Never>? {
    guard state == .ready, !loadingMore, let nextOffset else { return nil }
    loadingMore = true
    return fetch(offset: nextOffset)
  }
  public func select(_ id: String) {
    guard state == .ready, rows.contains(where: { $0.credential.id == id }) else { return }
    selected?.revoke()
    selected = CredentialDetailModel(
      id: id, store: store, generation: generation, clipboard: clipboard,
      onDelete: { [weak self] in
        self?.invalidate()
        self?.onMutation()
        self?.closeDetail()
      },
      onMutation: { [weak self] in
        self?.invalidate()
        self?.onMutation()
      })
  }
  public func closeDetail() {
    selected?.revoke()
    selected = nil
    if state == .stale { reload() }
  }
  public func coverSensitiveValues() { selected?.hideSecrets() }
  public func invalidate() {
    guard state != .revoked else { return }
    clear()
    state = .stale
  }
  public func revoke() {
    clear()
    state = .revoked
    selected?.revoke()
    selected = nil
    filter = .all
  }
  private func clear() {
    work.cancel()
    rows = []
    counts = nil
    revision = nil
    nextOffset = nil
    loadingMore = false
  }
  private func fetch(offset: Int) -> Task<Void, Never> {
    let request = PassmanagerSecurityAuditPageRequest(
      issue: filter == .all ? nil : filter.rawValue, limit: 50, offset: offset, revision: revision)
    return work.start { [weak self, store, generation] run in
      do {
        let page = try await store.securityAuditPage(request, generation: generation)
        guard let self, run.isCurrent else { return }
        guard page.algorithmVersion == 1, page.revision.count == 64,
          self.revision == nil || self.revision == page.revision,
          page.totalCount >= 0, page.entries.count <= 50,
          [page.weakPasswordCount, page.reusedPasswordCount, page.twoFactorCount, page.failedCount]
            .allSatisfy({ (0...page.totalCount).contains($0) }),
          page.nextOffset == nil || (page.nextOffset ?? 0) > offset,
          page.nextOffset == nil || !page.entries.isEmpty,
          page.entries.allSatisfy({ row in
            !row.credential.id.isEmpty
              && (row.audit == nil || row.audit?.entryID == row.credential.id)
          }),
          Set((self.rows + page.entries).map { $0.credential.id }).count == self.rows.count
            + page.entries.count
        else { throw CredentialStoreError.invalidPage }
        self.rows += page.entries
        self.counts = Counts(
          total: page.totalCount, weak: page.weakPasswordCount, reused: page.reusedPasswordCount,
          otp: page.twoFactorCount, failed: page.failedCount)
        self.revision = page.revision
        self.nextOffset = page.nextOffset
        self.state = .ready
        self.loadingMore = false
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        let changed =
          error.coreFailure?.code == "SYNC_CONFLICT"
          || (error as? CredentialStoreError) == .catalogChanged
        self.clear()
        self.state = changed ? .stale : .failed
      }
    }
  }
}
