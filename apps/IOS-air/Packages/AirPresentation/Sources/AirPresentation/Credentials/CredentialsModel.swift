import ChromVoidBridge
import Foundation
import Observation

/// Metadata belongs to one authorized generation and is never persisted by Swift.
@Observable
@MainActor
public final class CredentialsModel {
  public enum Sort: String, CaseIterable {
    case name, username, website, created, modified
    public var label: String {
      switch self {
      case .name: "Name"
      case .username: "Username"
      case .website: "Website"
      case .created: "Date created"
      case .modified: "Date modified"
      }
    }
  }
  public enum Kind: String, CaseIterable {
    case all, login
    case paymentCard = "payment_card"
    public var label: String {
      switch self {
      case .all: "All types"
      case .login: "Login"
      case .paymentCard: "Payment card"
      }
    }
  }
  public enum Grouping: String, CaseIterable {
    case none, website, modified, security
    public var label: String {
      switch self {
      case .none: "No grouping"
      case .website: "Website"
      case .modified: "Date modified"
      case .security: "One-time codes"
      }
    }
    func title(for key: String?) -> AirText? {
      guard let key else { return nil }
      switch self {
      case .none: return nil
      case .website: return key.isEmpty ? .key("No website") : .verbatim(key)
      case .modified:
        let labels = [
          "today": "Last 24 hours", "yesterday": "24–48 hours ago", "week": "Last 7 days",
          "month": "Last 30 days", "year": "Last 365 days", "older": "More than a year ago",
        ]
        return labels[key].map(AirText.key)
      case .security:
        switch key {
        case "otp": return .key("With one-time codes")
        case "basic": return .key("Without one-time codes")
        default: return nil
        }
      }
    }
  }
  public struct CatalogSection: Identifiable {
    public let id: String
    public let title: AirText?
    public var entries: [CredentialSummary]
  }
  public enum QuickCopyState: Equatable {
    case idle
    case loading(String)
    case copied(String, UUID)
    case failed(String, String)
  }
  public private(set) var quickCopyState: QuickCopyState = .idle
  private let quickCopy = ModelWork()
  public var isQuickCopying: Bool {
    if case .loading = quickCopyState { return true }
    return false
  }

  /// The one sheet the catalog itself can show at a time. The vault tools (export, import,
  /// clear, audit, selection) are sheets of `tools`; pushed screens (detail, codes, subgroup,
  /// SSH keys) and the group alerts are separate state.
  public enum Presentation: Identifiable {
    case tags(CredentialTagsModel)
    case creation(CredentialCreationModel)
    case groups(CredentialGroupsModel)
    public var id: String {
      switch self {
      case .tags: "tags"
      case .creation: "creation"
      case .groups: "groups"
      }
    }
  }
  public private(set) var presentation: Presentation?
  /// The vault-wide tools of this screen. Views reach a tool sheet through `tools` (or the
  /// forwarding accessors below), so its own tracked `presentation` is what they observe; see
  /// `CredentialToolsModel` for the split.
  @ObservationIgnored public private(set) lazy var tools: CredentialToolsModel = makeTools()
  /// The SSH keys collection pushed from the root tile.
  public private(set) var ssh: SSHModel?
  public private(set) var grouping: Grouping = .none
  @ObservationIgnored private var groupingTime: Int?
  /// The section of entries that live in this group itself (no grouping, no search).
  public static let directSectionID = "direct"
  public var sections: [CatalogSection] {
    if grouping == .none && !isSearching {
      var result: [CatalogSection] = []
      let direct = directEntries
      let nested = nestedEntries
      if !direct.isEmpty {
        result.append(CatalogSection(id: Self.directSectionID, title: nil, entries: direct))
      }
      if !nested.isEmpty {
        result.append(
          CatalogSection(id: "nested", title: .key("In nested groups"), entries: nested))
      }
      return result
    }
    var result: [CatalogSection] = []
    for entry in entries {
      let key = entry.groupKey ?? ""
      if result.last?.id == key {
        result[result.count - 1].entries.append(entry)
      } else {
        result.append(
          CatalogSection(id: key, title: grouping.title(for: entry.groupKey), entries: [entry]))
      }
    }
    return result
  }

  public private(set) var sort: Sort = .name
  public private(set) var descending = false
  public private(set) var kind: Kind = .all
  public enum QuickFilter: String, CaseIterable {
    case recent, otp, ssh
    public var label: String {
      switch self {
      case .recent: "Updated in the last 14 days"
      case .otp: "With one-time codes"
      case .ssh: "With SSH keys"
      }
    }
  }
  public private(set) var quickFilters: Set<QuickFilter> = []
  public var hasFilters: Bool { kind != .all || tag != nil || !quickFilters.isEmpty }
  public var appliedQuickFilters: [QuickFilter] {
    QuickFilter.allCases.filter { quickFilters.contains($0) }
  }

  public private(set) var tag: CredentialTagSummary?
  public enum State: Equatable { case loading, ready, failed, groupMissing, revoked }
  public var isSearching: Bool { !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  public private(set) var groupPath: String?
  /// The group this screen shows; nil for the vault root. Fixed for the screen's lifetime.
  public let scopePath: String?
  /// A pushed catalog for one subgroup, as `FilesModel.child` does for folders.
  public private(set) var child: CredentialsModel?
  /// The Codes collection pushed from the root tile.
  public private(set) var codes: CodesModel?
  /// Direct subgroups of `scopePath`, shown above the entries.
  public private(set) var groups: [PassmanagerGroupSummary] = []
  public private(set) var groupsState: State = .loading
  public enum GroupEdit: Equatable {
    case create
    case rename(String)
  }
  /// A group name being asked for (new subgroup or rename) and the group awaiting deletion.
  public private(set) var groupEdit: GroupEdit?
  public private(set) var deletingGroup: String?
  public private(set) var groupBusy = false
  public private(set) var groupIssue: String?
  /// Counts for the root tiles; nil until loaded, "50+" style strings when the page is capped.
  public struct CollectionCounts: Equatable {
    public var codes: String?
    public var passkeys: String?
    public var ssh: String?
  }
  public private(set) var collectionCounts = CollectionCounts()
  private let passkeyStore: (any PasskeyStore)?
  private let groupsWork = ModelWork()
  private let countsWork = ModelWork()
  private let groupMutation = ModelWork()
  public let generation: UInt64
  public private(set) var selected: CredentialDetailModel?
  public private(set) var entries: [CredentialSummary] = []
  /// Matching entries in the whole scope, when Core counted them (sorted or grouped pages).
  public private(set) var totalCount: Int?
  /// Entry icons shared by this screen and the group screens pushed from it.
  public let icons: CredentialIconCache
  public private(set) var query = ""
  public private(set) var state: State = .loading
  public private(set) var loadingMore = false
  public var canLoadMore: Bool { nextOffset != nil }
  private let store: any CredentialStore
  private let clipboard: any CredentialClipboard
  private var nextOffset: UInt32?
  @ObservationIgnored private var sequence: UInt64?
  private let work = ModelWork()

  public init(
    store: any CredentialStore, generation: UInt64,
    clipboard: any CredentialClipboard = SystemCredentialClipboard(),
    groupPath: String? = nil, passkeys: (any PasskeyStore)? = nil,
    icons: CredentialIconCache? = nil
  ) {
    self.store = store
    self.generation = generation
    self.clipboard = clipboard
    self.scopePath = groupPath
    self.groupPath = groupPath
    self.passkeyStore = passkeys
    self.icons = icons ?? CredentialIconCache(store: store, generation: generation)
  }

  private func makeTools() -> CredentialToolsModel {
    let tools = CredentialToolsModel(
      store: store, generation: generation, clipboard: clipboard,
      catalog: { [weak self] in
        guard let self else { return .revoked }
        return CredentialToolsModel.CatalogState(
          state: state, hasEntries: !entries.isEmpty, showsSheet: presentation != nil,
          showsDetail: selected != nil, showsSSH: ssh != nil)
      },
      cancelQuickCopy: { [weak self] in self?.cancelQuickCopy() },
      onMutation: { [weak self] in self?.reload() },
      onVaultMutation: { [weak self] in self?.refreshAfterMutation() })
    return tools
  }

  // MARK: Presentation accessors

  /// The tool sheets, forwarded from `tools` so the catalog stays the one model views observe.
  public var exporting: CredentialExportModel? { tools.exporting }
  public var importing: CredentialImportModel? { tools.importing }
  public var clearing: CredentialClearModel? { tools.clearing }
  public var audit: CredentialAuditModel? { tools.audit }
  public var selection: CredentialSelectionModel? { tools.selection }
  public var tagBrowser: CredentialTagsModel? {
    if case .tags(let model) = presentation { return model }
    return nil
  }
  public var creation: CredentialCreationModel? {
    if case .creation(let model) = presentation { return model }
    return nil
  }
  public var groupBrowser: CredentialGroupsModel? {
    if case .groups(let model) = presentation { return model }
    return nil
  }
  /// No sheet is shown, or only a selection that `tools.resetSelectionForScopeChange()` may end.
  private var presentsAtMostSelection: Bool {
    presentation == nil && tools.presentsAtMostSelection
  }

  /// The last path component, or nil at the root.
  public var groupName: String? {
    scopePath.flatMap { $0.split(separator: "/").last.map(String.init) }
  }
  /// Entries that live in this group itself, and those from its subgroups.
  public var directEntries: [CredentialSummary] { entries.filter(isDirect) }
  public var nestedEntries: [CredentialSummary] { entries.filter { !isDirect($0) } }
  private func isDirect(_ entry: CredentialSummary) -> Bool {
    entry.groupPath == (scopePath ?? "/") || (scopePath == nil && entry.groupPath.isEmpty)
  }

  public func quickCopyLabel(for entry: CredentialSummary) -> String? {
    switch entry.entryType {
    case "login": "Copy password"
    case "payment_card": "Copy card number"
    default: nil
    }
  }

  @discardableResult
  public func copyPrimarySecret(_ id: String) -> Task<Void, Never>? {
    guard state == .ready, !isQuickCopying, presentation == nil, tools.presentation == nil,
      selected == nil, ssh == nil, let entry = entries.first(where: { $0.id == id }),
      quickCopyLabel(for: entry) != nil
    else { return nil }
    cancelQuickCopy()
    let type = entry.entryType == "payment_card" ? "card_pan" : "password"
    quickCopyState = .loading(id)
    return quickCopy.start { [weak self, store, generation] run in
      do {
        let value = try await store.readCredentialSecret(id: id, type: type, generation: generation)
        guard let self, run.isCurrent else { return }
        guard !value.isEmpty else {
          self.quickCopyState = .failed(id, "This field has no saved value.")
          return
        }
        self.clipboard.copy(value)
        self.quickCopyState = .copied(id, UUID())
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        let message: String
        switch error.coreFailureKind {
        case .missing: message = "This field has no saved value."
        case .denied: message = "This vault does not allow access to this field."
        default: message = "Couldn’t read this field. Try again."
        }
        self.quickCopyState = .failed(id, message)
      }
    }
  }

  public func cancelQuickCopy() {
    quickCopy.cancel()
    quickCopyState = .idle
  }

  public func clearQuickCopyFeedback(_ receipt: UUID) {
    if case .copied(_, let current) = quickCopyState, current == receipt { quickCopyState = .idle }
  }

  public func synchronize(sequence: UInt64) {
    guard state != .revoked, self.sequence != sequence else { return }
    self.sequence = sequence
    tools.audit?.invalidate()
    ssh?.invalidate()
    groupBrowser?.synchronize()
    tagBrowser?.synchronize()
    child?.synchronize(sequence: sequence)
    codes?.reload()
    if tagBrowser == nil { reload() }
  }

  public func search(_ query: String) {
    guard state != .revoked, self.query != query, tools.resetSelectionForScopeChange() else {
      return
    }
    self.query = query
    reload()
  }

  @discardableResult
  public func setSort(_ sort: Sort) -> Task<Void, Never>? {
    guard state != .revoked, self.sort != sort, tools.resetSelectionForScopeChange() else {
      return nil
    }
    self.sort = sort
    return reload()
  }
  @discardableResult
  public func setDescending(_ descending: Bool) -> Task<Void, Never>? {
    guard state != .revoked, self.descending != descending, tools.resetSelectionForScopeChange()
    else {
      return nil
    }
    self.descending = descending
    return reload()
  }
  @discardableResult
  public func filterKind(_ kind: Kind) -> Task<Void, Never>? {
    guard state != .revoked, self.kind != kind, tools.resetSelectionForScopeChange() else {
      return nil
    }
    self.kind = kind
    return reload()
  }
  @discardableResult
  public func setGrouping(_ grouping: Grouping) -> Task<Void, Never>? {
    guard state != .revoked, self.grouping != grouping, tools.resetSelectionForScopeChange() else {
      return nil
    }
    self.grouping = grouping
    return reload()
  }

  @discardableResult
  public func setQuickFilter(_ filter: QuickFilter, enabled: Bool) -> Task<Void, Never>? {
    guard state != .revoked, quickFilters.contains(filter) != enabled,
      tools.resetSelectionForScopeChange()
    else { return nil }
    if enabled { quickFilters.insert(filter) } else { quickFilters.remove(filter) }
    return reload()
  }

  @discardableResult
  public func clearFilters() -> Task<Void, Never>? {
    guard state != .revoked, hasFilters, tools.resetSelectionForScopeChange() else { return nil }
    quickFilters = []
    kind = .all
    tag = nil
    return reload()
  }
  @discardableResult
  public func reload() -> Task<Void, Never>? {
    guard state != .revoked else { return nil }
    cancelQuickCopy()
    entries = []
    totalCount = nil
    nextOffset = nil
    loadingMore = false
    state = .loading
    groupingTime = grouping == .modified ? Int(Date().timeIntervalSince1970 * 1000) : nil
    let task = fetch(offset: 0)
    fetchGroups()
    return task
  }

  // MARK: Groups of this screen

  private func fetchGroups() {
    let parent = scopePath ?? "/"
    if groups.isEmpty { groupsState = .loading }
    groupsWork.start { [weak self, store, generation] run in
      do {
        var offset: UInt32 = 0
        var result: [PassmanagerGroupSummary] = []
        // Levels rarely exceed one page; walk them all so the list is complete.
        for _ in 0..<20 {
          let page = try await store.groupPage(
            parent: parent, offset: offset, generation: generation)
          guard page.parent == parent else { throw CredentialStoreError.invalidPage }
          result.append(contentsOf: page.groups)
          guard let next = page.nextOffset.flatMap(UInt32.init(exactly:)), next > offset else {
            break
          }
          offset = next
        }
        guard let self, run.isCurrent else { return }
        self.groups = result
        self.groupsState = .ready
      } catch {
        guard let self, run.isCurrent else { return }
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        self.groups = []
        self.groupsState =
          error.coreFailureKind == .missing ? .groupMissing : .failed
      }
    }
  }

  /// Pushes the catalog of one subgroup. The child inherits sort and filters.
  public func openGroup(_ path: String) {
    guard state != .revoked, child == nil, selected == nil, tools.resetSelectionForScopeChange()
    else {
      return
    }
    let child = CredentialsModel(
      store: store, generation: generation, clipboard: clipboard, groupPath: path,
      passkeys: passkeyStore, icons: icons)
    child.sort = sort
    child.descending = descending
    child.kind = kind
    child.quickFilters = quickFilters
    child.grouping = grouping
    if let sequence { child.synchronize(sequence: sequence) } else { child.reload() }
    self.child = child
  }
  public func closeChild() {
    child?.revoke()
    child = nil
  }
  public func beginCodes() {
    guard state != .revoked, codes == nil, child == nil, selected == nil,
      tools.resetSelectionForScopeChange()
    else { return }
    let codes = CodesModel(store: store, generation: generation, clipboard: clipboard) {
      [weak self] in self?.reload()
    }
    codes.reload()
    self.codes = codes
  }
  public func endCodes() {
    codes?.revoke()
    codes = nil
  }

  public func beginGroupEdit(_ edit: GroupEdit) {
    guard state != .revoked, !groupBusy, groupEdit == nil else { return }
    cancelQuickCopy()
    groupIssue = nil
    groupEdit = edit
  }
  public func cancelGroupEdit() {
    groupEdit = nil
    groupIssue = nil
  }
  /// Creates a subgroup of this screen or renames the group being edited.
  @discardableResult
  public func saveGroup(name: String) -> Task<Void, Never>? {
    guard let edit = groupEdit, !groupBusy else { return nil }
    let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, !name.hasPrefix("."), !name.contains("/"), !name.contains("\\"),
      !name.contains("\0")
    else {
      groupIssue = "Enter a group name without slashes or a leading dot."
      return nil
    }
    return mutateGroup { [store, generation, scopePath] in
      switch edit {
      case .create:
        let parent = scopePath ?? "/"
        try await store.ensureGroup(
          path: parent == "/" ? "/" + name : parent + "/" + name, generation: generation)
      case .rename(let path):
        try await store.renameGroup(path: path, name: name, generation: generation)
      }
    }
  }
  public func requestGroupDeletion(_ path: String) {
    guard state != .revoked, !groupBusy, path != "/" else { return }
    cancelQuickCopy()
    deletingGroup = path
  }
  public func cancelGroupDeletion() { deletingGroup = nil }
  @discardableResult
  public func confirmGroupDeletion() -> Task<Void, Never>? {
    guard let path = deletingGroup, !groupBusy else { return nil }
    deletingGroup = nil
    return mutateGroup { [store, generation] in
      try await store.deleteGroup(path: path, generation: generation)
    }
  }
  private func mutateGroup(_ action: @escaping () async throws -> Void) -> Task<Void, Never> {
    groupBusy = true
    groupIssue = nil
    return groupMutation.start { [weak self] run in
      do {
        try await action()
        guard let self, run.isCurrent else { return }
        self.groupBusy = false
        self.groupEdit = nil
        self.reload()
      } catch {
        guard let self, run.isCurrent else { return }
        self.groupBusy = false
        if error.isSessionRevoked {
          self.revoke()
          return
        }
        switch error.coreFailureKind {
        case .conflict: self.groupIssue = "A group or credential already uses this name."
        case .invalidInput:
          self.groupIssue = "Check the group name and try again."
        case .denied: self.groupIssue = "This vault does not allow this change."
        case .missing:
          self.groupEdit = nil
          self.reload()
        default:
          self.groupIssue =
            "The group change could not be confirmed. Reload groups before trying again."
          self.reload()
        }
      }
    }
  }

  // MARK: Root collections

  /// Counts for the root tiles. Driven by the root screen, not by `reload()`, so the extra page
  /// reads never interleave with the catalog's own paging.
  public func refreshCollectionCounts() {
    guard scopePath == nil, state != .revoked else { return }
    countsWork.start { [weak self, store, generation, passkeyStore] run in
      var counts = CollectionCounts()
      if let page = try? await store.credentialPage(
        PassmanagerEntryPageRequest(
          descending: false, entryType: nil, groupBy: nil, groupPath: nil, groupingTime: nil,
          limit: 50, offset: 0, query: "", quickFilters: ["otp"], sort: "name", tagKey: nil),
        generation: generation)
      {
        counts.codes = page.nextOffset == nil ? String(page.entries.count) : "50+"
      }
      if let page = try? await store.sshPage(
        PassmanagerSSHPageRequest(
          keyType: nil, limit: 1, offset: 0, query: nil, revision: nil, sourceEntryID: nil),
        generation: generation)
      {
        counts.ssh = String(page.totalCount)
      }
      if let passkeyStore, let list = try? await passkeyStore.listPasskeys(generation: generation) {
        counts.passkeys = String(list.passkeys.count)
      }
      guard let self, run.isCurrent else { return }
      self.collectionCounts = counts
    }
  }

  public func loadMore() {
    guard state == .ready, !loadingMore, let nextOffset else { return }
    loadingMore = true
    fetch(offset: nextOffset)
  }

  public func select(_ id: String) {
    guard state != .revoked, tools.selection == nil, tools.clearing == nil, tools.importing == nil,
      tools.exporting == nil
    else { return }
    cancelQuickCopy()
    selected?.revoke()
    selected = CredentialDetailModel(
      id: id, store: store, generation: generation, clipboard: clipboard,
      onDelete: { [weak self] in
        self?.closeDetail()
        self?.reload()
      }, onMutation: { [weak self] in self?.reload() })
  }

  public func beginTags() {
    guard state != .revoked, presentsAtMostSelection, tools.resetSelectionForScopeChange() else {
      return
    }
    work.cancel()
    loadingMore = false
    presentation = .tags(
      CredentialTagsModel(
        store: store, generation: generation,
        onChoose: { [weak self] tag in
          self?.tag = tag
          self?.endTags()
        },
        onMutation: { [weak self] source, replacement in
          if let source, self?.tag?.key == source { self?.tag = replacement }
        }))
  }
  public func endTags() {
    guard let tagBrowser else { return }
    if let key = tagBrowser.uncertainTagKey, tag?.key == key { tag = nil }
    tagBrowser.revoke()
    presentation = nil
    reload()
  }
  public func clearTag() {
    guard state != .revoked, tools.resetSelectionForScopeChange() else { return }
    tag = nil
    reload()
  }

  public func beginGroups() {
    guard state != .revoked, presentsAtMostSelection, tools.resetSelectionForScopeChange() else {
      return
    }
    presentation = .groups(
      CredentialGroupsModel(
        store: store, generation: generation, path: groupPath ?? "/",
        onChoose: { [weak self] path in
          self?.groupPath = path == "/" ? nil : path
          self?.endGroups()
        },
        onMutation: { [weak self] in
          self?.groupPath = nil
          self?.reload()
        }))
  }
  public func endGroups() {
    guard let groupBrowser else { return }
    groupBrowser.revoke()
    presentation = nil
    reload()
  }
  public func filterGroup(_ path: String?) {
    guard state != .revoked, tools.resetSelectionForScopeChange() else { return }
    groupPath = path
    reload()
  }

  public func closeDetail() {
    selected?.revoke()
    selected = nil
  }

  public func coverSensitiveValues() {
    cancelQuickCopy()
    selected?.hideSecrets()
    tools.coverSensitiveValues()
    ssh?.coverSensitiveValues()
  }

  // MARK: Vault tools (forwarded to `tools`)

  public func beginExport() { tools.beginExport() }
  public func endExport() { tools.endExport() }
  public func beginImport() { tools.beginImport() }
  public func endImport() { tools.endImport() }
  public func beginClear() { tools.beginClear() }
  public func endClear() { tools.endClear() }
  public func beginAudit() { tools.beginAudit() }
  public func endAudit() { tools.endAudit() }
  public func beginSelection() { tools.beginSelection() }
  public func endSelection() { tools.endSelection() }

  public func beginSSH() {
    guard state != .revoked, ssh == nil, tools.resetSelectionForScopeChange() else { return }
    let ssh = SSHModel(
      store: store, generation: generation, clipboard: clipboard,
      onMutation: { [weak self] in self?.reload() })
    self.ssh = ssh
    ssh.reload()
  }
  public func endSSH() {
    ssh?.revoke()
    ssh = nil
  }
  public func beginCreation() {
    guard state != .revoked, presentsAtMostSelection, tools.resetSelectionForScopeChange() else {
      return
    }
    presentation = .creation(
      CredentialCreationModel(
        store: store, generation: generation, groupPath: groupPath ?? ""
      ) { [weak self] in
        self?.endCreation()
        self?.refreshAfterMutation()
      })
  }

  public func endCreation() {
    guard let creation else { return }
    let needsRefresh = creation.state == .uncertain
    creation.revoke()
    presentation = nil
    if needsRefresh { refreshAfterMutation() }
  }

  public func revoke() {
    cancelQuickCopy()
    state = .revoked
    closeChild()
    endCodes()
    groupsWork.cancel()
    countsWork.cancel()
    groupMutation.cancel()
    groups = []
    groupEdit = nil
    deletingGroup = nil
    groupBusy = false
    groupIssue = nil
    tools.revoke()
    switch presentation {
    case .tags(let model): model.revoke()
    case .creation(let model): model.revoke()
    case .groups(let model): model.revoke()
    case nil: break
    }
    presentation = nil
    endSSH()
    tag = nil
    groupPath = nil
    kind = .all
    quickFilters = []
    sort = .name
    grouping = .none
    groupingTime = nil
    descending = false
    closeDetail()
    work.cancel()
    entries = []
    query = ""
    nextOffset = nil
    loadingMore = false
  }

  /// A vault-wide change (import, clear, creation) landed: show the whole scope again.
  private func refreshAfterMutation() {
    guard state != .revoked else { return }
    query = ""
    tag = nil
    groupPath = scopePath
    kind = .all
    quickFilters = []
    reload()
  }

  @discardableResult
  private func fetch(offset: UInt32) -> Task<Void, Never> {
    let groupPath = groupPath
    let grouping = grouping
    let request = PassmanagerEntryPageRequest(
      descending: descending, entryType: kind == .all ? nil : kind.rawValue,
      groupBy: grouping == .none ? nil : grouping.rawValue, groupPath: groupPath,
      groupingTime: groupingTime, limit: 50, offset: Int(offset), query: query,
      quickFilters: appliedQuickFilters.map(\.rawValue), sort: sort.rawValue, tagKey: tag?.key)
    return work.start { [weak self, store, generation] run in
      do {
        let page = try await store.credentialPage(
          request, generation: generation)
        guard let self, run.isCurrent else { return }
        let next = page.nextOffset.flatMap(UInt32.init(exactly:))
        guard
          page.entries.allSatisfy({ entry in
            grouping == .none ? entry.groupKey == nil : grouping.title(for: entry.groupKey) != nil
          }), page.nextOffset == nil || (next.map { $0 > offset } == true),
          Set(self.entries.map(\.id) + page.entries.map(\.id)).count == self.entries.count
            + page.entries.count
        else { throw CredentialStoreError.invalidPage }
        self.entries.append(contentsOf: page.entries)
        if offset == 0 { self.totalCount = page.totalCount }
        self.nextOffset = next
        self.loadingMore = false
        self.state = .ready
        self.icons.request(page.entries.compactMap(\.iconRef))
      } catch {
        guard let self, run.isCurrent else { return }
        self.loadingMore = false
        // Catalog invalidation is handled by the coordinator's ordered event stream.
        // Never retry mutations or disguise an unreadable catalog as an empty vault.
        self.state =
          groupPath != nil && error.coreFailureKind == .missing
          ? .groupMissing : .failed
      }
    }
  }
}
