import ChromVoidBridge
import SwiftUI

/// The trailing navigation items of one catalog screen: the `⋯` tools menu and the add menu.
/// Two items at most: with a back button a third one collapses into an overflow menu, so group
/// screens keep the lock inside `⋯` instead of a third button.
struct CredentialsToolbar: ToolbarContent {
  let model: CredentialsModel
  let lock: () -> Void
  /// The name being edited in the group alert; "New group" clears it first.
  let groupName: Binding<String>
  let addCredential: () -> Void

  var body: some ToolbarContent {
    ToolbarItem(placement: .primaryAction) { CredentialsToolsMenu(model: model, lock: lock) }
    ToolbarItem(placement: .primaryAction) {
      CredentialsAddMenu(model: model, groupName: groupName, addCredential: addCredential)
    }
  }
}

/// Tools that are not navigation: select, audit, tags, import, export, clear, and on group
/// screens the lock.
struct CredentialsToolsMenu: View {
  @AirLocalizedCopy private var copy
  var model: CredentialsModel
  let lock: () -> Void
  private var isRoot: Bool { model.scopePath == nil }

  var body: some View {
    Menu {
      if !isRoot {
        Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
          .accessibilityIdentifier("lockVault")
        Divider()
      }
      Button(action: model.beginSelection) {
        Label(copy.text("Select"), systemImage: "checkmark.circle")
      }
      .disabled(model.state != .ready || model.entries.isEmpty)
      .accessibilityIdentifier("selectCredentials")
      Button(action: model.beginAudit) {
        Label(copy.text("Security audit"), systemImage: "checkmark.shield")
      }
      .accessibilityIdentifier("openSecurityAudit")
      Button(action: model.beginTags) { Label(copy.text("Tags"), systemImage: "tag") }
        .accessibilityIdentifier("browseTags")
      Divider()
      Button(action: model.beginImport) {
        Label(copy.text("Import credentials"), systemImage: "square.and.arrow.down")
      }
      .accessibilityIdentifier("openCredentialImport")
      Button(action: model.beginExport) {
        Label(copy.text("Export credentials"), systemImage: "square.and.arrow.up")
      }
      .accessibilityIdentifier("openCredentialExport")
      Button(role: .destructive, action: model.beginClear) {
        Label(copy.text("Clear all credentials"), systemImage: "trash")
      }
      .accessibilityIdentifier("openCredentialClear")
    } label: {
      Label(copy.text("More actions"), systemImage: "ellipsis.circle")
    }
    .accessibilityIdentifier("vaultTools")
  }
}

/// Tap adds a credential in this group; hold for the other things that can be added.
struct CredentialsAddMenu: View {
  @AirLocalizedCopy private var copy
  var model: CredentialsModel
  @Binding var groupName: String
  let addCredential: () -> Void

  var body: some View {
    Menu {
      Button(action: addCredential) { Label(copy.text("New credential"), systemImage: "key") }
        .accessibilityIdentifier("addCredentialHere")
      Button {
        groupName = ""
        model.beginGroupEdit(.create)
      } label: {
        Label(copy.text("New group"), systemImage: "folder.badge.plus")
      }
      .accessibilityIdentifier("addGroup")
    } label: {
      Label(copy.text("Add credential"), systemImage: "plus")
    } primaryAction: {
      addCredential()
    }
    .accessibilityIdentifier("addCredential")
  }
}

/// Sort, order, type, grouping and quick filters: one menu in the Passwords header.
struct CredentialCatalogControls: View {
  @AirLocalizedCopy private var copy
  var model: CredentialsModel
  var body: some View {
    Menu {
      Picker(
        copy.text("Sort by"), selection: Binding(get: { model.sort }, set: { model.setSort($0) })
      ) {
        ForEach(CredentialsModel.Sort.allCases, id: \.self) { sort in
          Text(copy.text(sort.label)).tag(sort)
        }
      }
      Picker(
        copy.text("Order"),
        selection: Binding(get: { model.descending }, set: { model.setDescending($0) })
      ) {
        Text(copy.text("Ascending")).tag(false)
        Text(copy.text("Descending")).tag(true)
      }
      Picker(
        copy.text("Credential type"),
        selection: Binding(get: { model.kind }, set: { model.filterKind($0) })
      ) {
        ForEach(CredentialsModel.Kind.allCases, id: \.self) { kind in
          Text(copy.text(kind.label)).tag(kind)
        }
      }
      Menu(copy.text("Group by")) {
        Picker(
          copy.text("Group by"),
          selection: Binding(get: { model.grouping }, set: { model.setGrouping($0) })
        ) {
          ForEach(CredentialsModel.Grouping.allCases, id: \.self) { grouping in
            Text(copy.text(grouping.label)).tag(grouping)
          }
        }
      }.accessibilityIdentifier("catalogGrouping")
      Section(copy.text("Quick filters")) {
        ForEach(CredentialsModel.QuickFilter.allCases, id: \.self) { filter in
          Toggle(
            copy.text(filter.label),
            isOn: Binding(
              get: { model.quickFilters.contains(filter) },
              set: { model.setQuickFilter(filter, enabled: $0) })
          ).accessibilityIdentifier("quickFilter_" + filter.rawValue)
        }
      }
    } label: {
      HStack(spacing: 4) {
        Text(copy.text(model.sort.label))
        Image(systemName: "line.3.horizontal.decrease")
      }
      .font(.footnote.weight(.medium))
      .textCase(nil)
      .foregroundStyle(Color.accentColor)
      .frame(minHeight: 32)
      .contentShape(Rectangle())
    }
    .buttonStyle(.borderless)
    .accessibilityLabel(copy.format("Sort and filter: %@", copy.text(model.sort.label)))
    .accessibilityIdentifier("catalogOptions")
  }
}

#if DEBUG
  private struct CredentialsToolbarPreview: View {
    let model: CredentialsModel
    @State private var groupName = ""
    var body: some View {
      NavigationStack {
        List {
          Section {
            Text("The tools and add menus sit in the navigation bar.")
          } header: {
            HStack {
              Text("Passwords")
              Spacer()
              CredentialCatalogControls(model: model)
            }
          }
        }
        .airCanvas()
        .navigationTitle("Vault")
        .toolbar {
          CredentialsToolbar(model: model, lock: {}, groupName: $groupName, addCredential: {})
        }
      }
    }
  }

  #Preview("Toolbar") {
    CredentialsToolbarPreview(model: CredentialPreviewFixtures.catalogModel())
  }
#endif
