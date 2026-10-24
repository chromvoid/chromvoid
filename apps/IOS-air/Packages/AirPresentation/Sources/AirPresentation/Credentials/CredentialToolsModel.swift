import ChromVoidBridge
import Foundation
import Observation

/// The vault-wide tools of one credentials catalog: export, import, clear, the security audit
/// and multi-selection. `CredentialsModel` owns one tools model per screen and forwards its
/// accessors and `begin…`/`end…` methods, so views and tests keep addressing the catalog; this
/// type owns the tool sheets themselves, the rule that only one of them is open at a time, and
/// the guards that keep them apart from the catalog's own sheets (tags, creation, groups), the
/// pushed detail and the SSH screen. The catalog is reached only through the closures given at
/// init: a snapshot of what it shows, quick-copy cancellation, and the two reloads a finished
/// tool asks for (`onMutation` keeps the scope, `onVaultMutation` resets search and filters
/// because the whole vault changed). The tools know nothing about paging, sorting or filters.
@Observable
@MainActor
public final class CredentialToolsModel {
  /// What the catalog shows at the moment a tool asks to open.
  struct CatalogState {
    var state: CredentialsModel.State
    var hasEntries: Bool
    /// A sheet the catalog owns itself (tags, creation, groups) is shown.
    var showsSheet: Bool
    /// A credential detail is pushed.
    var showsDetail: Bool
    /// The SSH keys collection is pushed.
    var showsSSH: Bool
    /// The catalog is gone: nothing may open.
    static var revoked: CatalogState {
      CatalogState(
        state: .revoked, hasEntries: false, showsSheet: false, showsDetail: false, showsSSH: false)
    }
  }

  /// The one tool sheet shown at a time; nil while the catalog shows one of its own or none.
  public enum Presentation: Identifiable {
    case exporting(CredentialExportModel)
    case importing(CredentialImportModel)
    case clearing(CredentialClearModel)
    case audit(CredentialAuditModel)
    case selection(CredentialSelectionModel)
    public var id: String {
      switch self {
      case .exporting: "export"
      case .importing: "import"
      case .clearing: "clear"
      case .audit: "audit"
      case .selection: "selection"
      }
    }
  }
  public private(set) var presentation: Presentation?

  private let store: any CredentialStore
  private let generation: UInt64
  private let clipboard: any CredentialClipboard
  private let catalog: () -> CatalogState
  private let cancelQuickCopy: () -> Void
  private let onMutation: () -> Void
  private let onVaultMutation: () -> Void

  init(
    store: any CredentialStore, generation: UInt64, clipboard: any CredentialClipboard,
    catalog: @escaping () -> CatalogState, cancelQuickCopy: @escaping () -> Void,
    onMutation: @escaping () -> Void, onVaultMutation: @escaping () -> Void
  ) {
    self.store = store
    self.generation = generation
    self.clipboard = clipboard
    self.catalog = catalog
    self.cancelQuickCopy = cancelQuickCopy
    self.onMutation = onMutation
    self.onVaultMutation = onVaultMutation
  }

  // MARK: Presentation accessors

  public var exporting: CredentialExportModel? {
    if case .exporting(let model) = presentation { return model }
    return nil
  }
  public var importing: CredentialImportModel? {
    if case .importing(let model) = presentation { return model }
    return nil
  }
  public var clearing: CredentialClearModel? {
    if case .clearing(let model) = presentation { return model }
    return nil
  }
  public var audit: CredentialAuditModel? {
    if case .audit(let model) = presentation { return model }
    return nil
  }
  public var selection: CredentialSelectionModel? {
    if case .selection(let model) = presentation { return model }
    return nil
  }
  /// No tool sheet is shown, or only a selection that `resetSelectionForScopeChange()` may end.
  var presentsAtMostSelection: Bool {
    switch presentation {
    case nil, .selection: true
    default: false
    }
  }

  // MARK: Guards

  /// Vault-wide tools (clear, import, export) open only over the plain catalog: no sheet, detail
  /// or SSH screen. Ends a pending selection on success.
  private func canBeginVaultTool() -> Bool {
    let catalog = catalog()
    return catalog.state != .revoked && presentsAtMostSelection && !catalog.showsSheet
      && !catalog.showsDetail && !catalog.showsSSH && resetSelectionForScopeChange()
  }

  /// Ends a selection so the catalog scope may change; false while a selection is deleting or a
  /// vault-wide tool (clear, import, export) is open.
  func resetSelectionForScopeChange() -> Bool {
    switch presentation {
    case .clearing, .importing, .exporting: return false
    case .selection(let selection) where selection.state == .deleting: return false
    default: break
    }
    cancelQuickCopy()
    if let selection {
      selection.revoke()
      presentation = nil
    }
    return true
  }

  // MARK: Tools

  public func beginExport() {
    guard canBeginVaultTool() else { return }
    presentation = .exporting(CredentialExportModel(store: store, generation: generation))
  }
  public func endExport() {
    guard let exporting else { return }
    exporting.revoke()
    presentation = nil
  }

  public func beginImport() {
    guard canBeginVaultTool() else { return }
    presentation = .importing(
      CredentialImportModel(store: store, generation: generation) { [weak self] in
        self?.clipboard.clearOwned()
        self?.onVaultMutation()
      })
  }
  public func endImport() {
    guard let importing, importing.state != .committing else { return }
    let needsRefresh = importing.state == .uncertain
    importing.revoke()
    presentation = nil
    if needsRefresh { onVaultMutation() }
  }

  public func beginClear() {
    guard canBeginVaultTool() else { return }
    presentation = .clearing(
      CredentialClearModel(store: store, generation: generation, clipboard: clipboard) {
        [weak self] in self?.onVaultMutation()
      })
  }
  public func endClear() {
    guard let clearing, clearing.state != .clearing else { return }
    let needsRefresh = clearing.state == .uncertain
    clearing.revoke()
    presentation = nil
    if needsRefresh { onVaultMutation() }
  }

  public func beginAudit() {
    let catalog = catalog()
    guard catalog.state != .revoked, presentsAtMostSelection, !catalog.showsSheet,
      resetSelectionForScopeChange()
    else { return }
    let audit = CredentialAuditModel(
      store: store, generation: generation, clipboard: clipboard,
      onMutation: { [weak self] in self?.onMutation() })
    presentation = .audit(audit)
    audit.reload()
  }
  public func endAudit() {
    guard let audit else { return }
    audit.revoke()
    presentation = nil
  }

  public func beginSelection() {
    let catalog = catalog()
    guard catalog.state == .ready, presentation == nil, !catalog.showsSheet,
      !catalog.showsDetail, catalog.hasEntries
    else { return }
    cancelQuickCopy()
    presentation = .selection(
      CredentialSelectionModel(store: store, generation: generation, clipboard: clipboard))
  }
  public func endSelection() {
    guard let selection, selection.state != .deleting else { return }
    let needsRefresh = selection.state == .finished
    selection.revoke()
    presentation = nil
    if needsRefresh { onMutation() }
  }

  // MARK: Lifecycle

  /// The app is leaving the foreground or another screen takes over: the audit hides its
  /// revealed values.
  public func coverSensitiveValues() {
    audit?.coverSensitiveValues()
  }

  /// Revokes whichever tool is shown; the catalog calls this from its own `revoke()`.
  public func revoke() {
    switch presentation {
    case .exporting(let model): model.revoke()
    case .importing(let model): model.revoke()
    case .clearing(let model): model.revoke()
    case .audit(let model): model.revoke()
    case .selection(let model): model.revoke()
    case nil: break
    }
    presentation = nil
  }
}
