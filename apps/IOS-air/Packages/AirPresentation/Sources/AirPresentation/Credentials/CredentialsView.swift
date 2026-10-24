import ChromVoidBridge
import SwiftUI

/// The vault as a browser: at the root the collections (codes, passkeys, SSH keys, wallet)
/// sit above the password groups and entries; a group row pushes the same screen for that
/// group. Tools that are not navigation live behind the `⋯` menu.
struct CredentialsView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialsModel
  let lock: () -> Void
  let openPasskeys: () -> Void
  let openWallet: () -> Void
  /// Screens above this one, root first, each with a way to pop back to it.
  var ancestors: [VaultAncestor] = []
  /// Network accounts of the wallet for the root tile; the shell owns the wallet model.
  var walletCount: String? = nil
  @Namespace private var zoom
  private var toolsContent: some View {
    CredentialsContent(
      openPasskeys: openPasskeys, openWallet: openWallet, lock: lock, model: model,
      ancestors: ancestors, walletCount: walletCount, zoom: zoom
    )
    .sheet(item: .presence({ model.exporting }, close: { model.endExport() })) {
      exporting in
      CredentialExportView(model: exporting, dismiss: model.endExport, lock: lock)
    }
    .sheet(item: .presence({ model.importing }, close: { model.endImport() })) {
      importing in
      CredentialImportView(model: importing, dismiss: model.endImport, lock: lock)
    }
    .sheet(item: .presence({ model.clearing }, close: { model.endClear() })) {
      clearing in
      CredentialClearView(model: clearing, dismiss: model.endClear, lock: lock)
    }
    .navigationDestination(
      isPresented: .presented({ model.ssh != nil }, close: { model.endSSH() })
    ) {
      if let ssh = model.ssh { SSHView(model: ssh, lock: lock) }
    }
    .sheet(item: .presence({ model.audit }, close: { model.endAudit() })) {
      audit in
      CredentialAuditView(model: audit, dismiss: model.endAudit, lock: lock)
    }
    .sheet(
      item: .presence({ model.selection }, close: { model.endSelection() })
    ) {
      selection in
      CredentialSelectionView(model: selection, catalog: model, dismiss: model.endSelection)
    }
    .sheet(item: .presence({ model.tagBrowser }, close: { model.endTags() })) {
      tags in
      CredentialTagsView(model: tags, dismiss: model.endTags)
    }
  }

  var body: some View {
    toolsContent
      .onDisappear { model.cancelQuickCopy() }
      .navigationDestination(
        isPresented: .presented({ model.selected != nil }, close: { model.closeDetail() })
      ) {
        if let detail = model.selected {
          CredentialDetailView(model: detail, lock: lock, zoom: zoom)
        }
      }
      .navigationDestination(
        isPresented: .presented({ model.codes != nil }, close: { model.endCodes() })
      ) {
        if let codes = model.codes { CodesView(model: codes, lock: lock) }
      }
      .navigationDestination(
        isPresented: .presented({ model.child != nil }, close: { model.closeChild() })
      ) {
        if let child = model.child {
          CredentialsView(
            model: child, lock: lock, openPasskeys: openPasskeys, openWallet: openWallet,
            ancestors: ancestors + [
              VaultAncestor(
                title: model.groupName ?? copy.text("Vault"),
                close: { [weak model] in model?.closeChild() })
            ],
            walletCount: walletCount
          )
          .zoomDestination(id: child.scopePath ?? "/", in: zoom)
        }
      }
      .sheet(
        item: .presence({ model.creation }, close: { model.endCreation() })
      ) { creation in
        CredentialCreationView(model: creation, dismiss: model.endCreation)
      }
  }
}

/// What one catalog screen is showing, for a single animation over the whole list.
private struct CatalogLayout: Equatable {
  let searching: Bool
  let emptyCard: Bool
  let state: CredentialsModel.State
  let hasFilters: Bool
  let quickFilters: [CredentialsModel.QuickFilter]
  let sections: [String]
  let direct: [String]
  let groups: [String]
}

/// One screen above the current group screen: its name and how to pop back to it.
struct VaultAncestor: Identifiable {
  let id = UUID()
  let title: String
  let close: () -> Void
}

/// The list of one catalog screen: status, root collections, the Passwords box, the grouped
/// or nested entries and paging. Its parts are `CredentialCollectionsSection`,
/// `CredentialGroupsSection` and `CredentialsToolbar`.
private struct CredentialsContent: View {
  @AirLocalizedCopy private var copy
  let openPasskeys: () -> Void
  let openWallet: () -> Void
  let lock: () -> Void
  var model: CredentialsModel
  let ancestors: [VaultAncestor]
  let walletCount: String?
  let zoom: Namespace.ID
  @State private var groupName = ""
  private static let top = "credentialsTop"
  // The rows last shown for the current scope. A refetch after a save, a closed sheet or a
  // returned detail keeps them on screen until the fresh page lands, so the list never
  // collapses to a spinner. A new scope (search, filter, group, sort) shows nothing stale.
  @State private var shownSections: [CredentialsModel.CatalogSection] = []
  @State private var shownScope = ""
  @State private var scrollOnReady = false
  /// Whether the list was showing search results at the last change, so the swap into and out
  /// of search can skip the animation the rows themselves use.
  @State private var wasSearching = false

  private var scope: String {
    [
      model.query, model.groupPath ?? "", model.kind.rawValue, model.tag?.key ?? "",
      model.sort.rawValue, String(model.descending), model.grouping.rawValue,
      model.appliedQuickFilters.map(\.rawValue).sorted().joined(separator: ","),
    ].joined(separator: "|")
  }
  private var sections: [CredentialsModel.CatalogSection] {
    if model.state == .ready { return model.sections }
    if model.state == .loading && shownScope == scope { return shownSections }
    return []
  }
  private var feedback: (text: String, symbol: String, identifier: String)? {
    switch model.quickCopyState {
    case .copied:
      (
        copy.text("Copied. Expires in 15 seconds on this device."), "checkmark",
        "quickCopySucceeded"
      )
    case .failed(_, let message):
      (copy.text(message), "exclamationmark.triangle", "quickCopyIssue")
    default: nil
    }
  }
  private var isRoot: Bool { model.scopePath == nil }
  /// Everything the list draws, as one value.
  private var layout: CatalogLayout {
    CatalogLayout(
      searching: model.isSearching, emptyCard: showsEmptyCard, state: model.state,
      hasFilters: model.hasFilters, quickFilters: model.appliedQuickFilters,
      sections: sections.map(\.id), direct: directEntries.map(\.id),
      groups: model.groups.map(\.path))
  }
  /// Opening or clearing a search replaces the list: the collections, the groups and every row
  /// change at once, and sliding that is a long move of content the eye cannot follow. Within
  /// one kind of list, rows still animate.
  private var listAnimation: Animation? {
    model.isSearching == wasSearching ? AirMotion.layout : AirMotion.none
  }
  /// Entries of this group itself render inside the Passwords box, under its groups.
  private static let directSection = CredentialsModel.directSectionID
  private var directEntries: [CredentialSummary] {
    sections.first(where: { $0.id == Self.directSection })?.entries ?? []
  }
  private var showsGroups: Bool { !model.isSearching && !model.groups.isEmpty }
  /// A root with no passwords at all shows the brand card instead of the Passwords box.
  private var showsEmptyCard: Bool {
    isRoot && model.state == .ready && model.entries.isEmpty && !showsGroups
      && !model.isSearching && !model.hasFilters
  }

  var body: some View {
    ScrollViewReader { scroll in
      List {
        Section {
          AirSearchField(
            prompt: model.scopePath == nil
              ? "Name, username, website or tag" : "Search this group",
            text: Binding(get: { model.query }, set: { model.search($0) }),
            identifier: "credentialSearch"
          )
          .airSearchRow()
        }
        .listSectionSeparator(.hidden)
        if model.state != .ready && sections.isEmpty && !showsGroups {
          Section { status }.id(Self.top)
        }
        if isRoot && !model.isSearching {
          CredentialCollectionsSection(
            model: model, openPasskeys: openPasskeys, openWallet: openWallet,
            walletCount: walletCount)
        }
        if showsEmptyCard {
          Section {
            VaultEmptyCard(addPassword: addCredential, importCredentials: model.beginImport)
              .listRowInsets(EdgeInsets())
              .listRowBackground(Color.clear)
          }
          .listSectionSeparator(.hidden)
          .id(Self.top)
        } else {
          CredentialGroupsSection(
            model: model, directEntries: directEntries,
            anchor: model.state == .ready || !sections.isEmpty ? Self.top : "credentialTools",
            groupName: $groupName, zoom: zoom)
        }
        if model.state == .ready && model.entries.isEmpty && !showsGroups && !showsEmptyCard {
          Section { status }
        }
        ForEach(sections.filter { $0.id != Self.directSection }) { section in
          Section {
            ForEach(section.entries, id: \.id) { entry in
              CredentialCatalogRow(model: model, entry: entry, namespace: zoom)
            }
          } header: {
            if let title = section.title {
              Text(copy.text(title)).accessibilityIdentifier("credentialSection_" + section.id)
            }
          }
        }
        if model.canLoadMore {
          Section {
            if model.loadingMore {
              ProgressView(copy.text("Loading credentials…"))
            } else if model.state == .ready {
              Button(copy.text("Load more"), action: model.loadMore)
            }
          }
        }
      }
      .airCanvas()
      .scrollDismissesKeyboard(.interactively)
      // One animation for the whole list. Seven of them, one per value, used to fire together
      // whenever a search changed several at once, and the overlapping springs read as one
      // long elastic move.
      .animation(listAnimation, value: layout)
      .onChange(of: model.isSearching) { _, searching in wasSearching = searching }
      .onChange(of: model.query) { scroll.scrollTo(Self.top, anchor: .top) }
      .onChange(of: model.state) { _, state in
        // A new scope starts at the top; a refetch of the same scope keeps the reader's place.
        if state == .loading { scrollOnReady = shownScope != scope }
        if state == .ready {
          shownSections = model.sections
          shownScope = scope
          if scrollOnReady { scroll.scrollTo(Self.top, anchor: .top) }
          scrollOnReady = false
        }
      }
      .onChange(of: model.entries.map(\.id)) {
        if model.state == .ready {
          shownSections = model.sections
          shownScope = scope
        }
      }
      .accessibilityIdentifier(isRoot ? "credentialsCatalog" : "credentialsGroup")
      .airToast(
        feedback?.text, systemImage: feedback?.symbol ?? "checkmark",
        identifier: feedback?.identifier ?? "quickCopyFeedback"
      )
      .navigationTitle(model.groupName ?? copy.text("Vault"))
      .toolbarTitleMenu {
        ForEach(ancestors) { ancestor in
          Button(action: ancestor.close) {
            Label(ancestor.title, systemImage: "chevron.left")
          }
        }
      }
      .toolbar {
        CredentialsToolbar(
          model: model, lock: lock, groupName: $groupName, addCredential: addCredential)
      }
      .modifier(CredentialGroupAlerts(model: model, groupName: $groupName))
    }
  }

  private func addCredential() {
    AirKeyboard.dismiss()
    model.beginCreation()
  }

  @ViewBuilder
  private var status: some View {
    if model.state == .loading {
      ProgressView(copy.text("Loading credentials…"))
        .accessibilityIdentifier("credentialsLoading")
    } else if model.state == .groupMissing {
      Text(copy.text("This group is no longer available."))
      if let back = ancestors.last { Button(back.title, action: back.close) }
    } else if model.state == .failed {
      Label(copy.text("Couldn’t load credentials"), systemImage: "exclamationmark.triangle")
      Text(
        copy.text("Your vault is open, but its catalog could not be read. Try loading it again.")
      )
      .foregroundStyle(.secondary)
      Button(copy.text("Try again")) { model.reload() }
    } else if model.state == .ready && model.entries.isEmpty {
      Label(
        copy.text(
          (model.isSearching || model.hasFilters)
            ? "No matching credentials"
            : (isRoot ? "This vault is empty" : "This group is empty")),
        systemImage: !model.isSearching ? "tray" : "magnifyingglass"
      )
      .font(.headline)
      .accessibilityIdentifier(
        (model.isSearching || model.hasFilters)
          ? "credentialsNoMatches" : (isRoot ? "emptyVault" : "emptyGroup"))
      Text(
        copy.text(
          !(model.isSearching || model.hasFilters)
            ? (isRoot
              ? "There are no credentials in this vault yet."
              : "Add a credential or choose a different group.")
            : "Change the search or filters to find credentials.")
      )
      .foregroundStyle(.secondary)
    }
  }
}

#if DEBUG
  #Preview("Vault") {
    NavigationStack {
      CredentialsView(
        model: CredentialPreviewFixtures.catalogModel(), lock: {}, openPasskeys: {},
        openWallet: {})
    }
  }
#endif
