import ChromVoidBridge
import SwiftUI

/// The Passwords box of one catalog screen: the active search and filter chips, the direct
/// subgroups as rows, then the entries that live in this group itself. The header carries the
/// sort and filter menu. The group alerts it drives live in `CredentialGroupAlerts`.
struct CredentialGroupsSection: View {
  @AirLocalizedCopy private var copy
  var model: CredentialsModel
  /// Entries of this group itself, as last shown; the parent keeps them across a refetch.
  let directEntries: [CredentialSummary]
  /// The list anchor the parent scrolls to; it moves here while no status row is shown.
  let anchor: String
  /// The name being edited in the group alert; rows set it before a rename.
  @Binding var groupName: String
  let zoom: Namespace.ID
  private var isRoot: Bool { model.scopePath == nil }
  private var showsGroups: Bool { !model.isSearching && !model.groups.isEmpty }

  var body: some View {
    Section {
      // The scope actions sit on the canvas like the rows under them, not in their own box.
      Group {
        if model.isSearching {
          Button(copy.text("Clear search")) {
            model.search("")
            AirKeyboard.dismiss()
          }
          .accessibilityIdentifier("clearCredentialSearch")
        }
        ForEach(model.appliedQuickFilters, id: \.self) { filter in
          Button {
            model.setQuickFilter(filter, enabled: false)
          } label: {
            Label(copy.text(filter.label), systemImage: "xmark.circle")
          }.accessibilityIdentifier("removeQuickFilter_" + filter.rawValue)
        }
        if model.hasFilters {
          Button(copy.text("Clear filters")) { model.clearFilters() }
            .accessibilityIdentifier("clearCredentialFilters")
        }
        if model.tag != nil {
          Button(copy.text("Clear tag filter"), action: model.clearTag)
            .accessibilityIdentifier("clearTagFilter")
        }
        if model.kind != .all {
          Button(copy.text("Clear type filter")) { model.filterKind(.all) }
            .accessibilityIdentifier("clearTypeFilter")
        }
      }
      .listRowBackground(Color.clear)
      if showsGroups {
        ForEach(model.groups, id: \.path) { group in groupRow(group) }
      }
      if let issue = model.groupIssue {
        Text(copy.text(issue)).font(.footnote).foregroundStyle(.red)
          .accessibilityIdentifier("groupIssue")
      }
      ForEach(directEntries, id: \.id) { entry in
        CredentialCatalogRow(model: model, entry: entry, namespace: zoom)
      }
    } header: {
      HStack(spacing: 6) {
        Text(copy.text(isRoot ? "Passwords" : "Groups"))
        if isRoot, let total = model.totalCount, !model.isSearching, !model.hasFilters {
          Text(verbatim: "· " + copy.count(total)).foregroundStyle(.tertiary)
            .accessibilityLabel(copy.format("Passwords: %@", copy.count(total)))
        }
        Spacer()
        CredentialCatalogControls(model: model)
      }
    }
    .id(anchor)
  }

  private func groupRow(_ group: PassmanagerGroupSummary) -> some View {
    let name = String(group.path.split(separator: "/").last ?? "")
    return Button {
      model.openGroup(group.path)
    } label: {
      HStack(spacing: 14) {
        Image(systemName: "folder.fill")
          .font(.body.weight(.medium))
          .foregroundStyle(Color.accentColor)
          .frame(width: 28)
        Text(name).foregroundStyle(.primary)
        Spacer(minLength: 8)
        Text(String(group.entryCount))
          .font(.subheadline.monospacedDigit())
          .foregroundStyle(.secondary)
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.tertiary)
          .accessibilityHidden(true)
      }
      .frame(minHeight: 44)
      .contentShape(Rectangle())
      .zoomSource(id: group.path, in: zoom)
    }
    .buttonStyle(.plain)
    .listRowBackground(Color.clear)
    .disabled(model.groupBusy)
    .accessibilityLabel(name + ", " + String(group.entryCount))
    .accessibilityIdentifier("openGroup_" + group.path)
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      Button(role: .destructive) {
        model.requestGroupDeletion(group.path)
      } label: {
        Label(copy.text("Delete"), systemImage: "trash")
      }
      .accessibilityIdentifier("deleteGroup_" + group.path)
      Button {
        groupName = name
        model.beginGroupEdit(.rename(group.path))
      } label: {
        Label(copy.text("Rename"), systemImage: "pencil")
      }
      .tint(.orange)
      .accessibilityIdentifier("renameGroup_" + group.path)
    }
    .contextMenu {
      Button {
        groupName = name
        model.beginGroupEdit(.rename(group.path))
      } label: {
        Label(copy.text("Rename"), systemImage: "pencil")
      }
      Button(role: .destructive) {
        model.requestGroupDeletion(group.path)
      } label: {
        Label(copy.text("Delete"), systemImage: "trash")
      }
    }
  }
}

/// The group name alert (new subgroup or rename) and the delete confirmation of one catalog
/// screen, attached to the list they belong to.
struct CredentialGroupAlerts: ViewModifier {
  @AirLocalizedCopy private var copy
  var model: CredentialsModel
  @Binding var groupName: String

  func body(content: Content) -> some View {
    content
      .alert(
        copy.text(model.groupEdit == .create ? "New group" : "Rename group"),
        isPresented: .presented({ model.groupEdit != nil }, close: { model.cancelGroupEdit() })
      ) {
        TextField(copy.text("Group name"), text: $groupName)
          .textInputAutocapitalization(.sentences).autocorrectionDisabled()
          .accessibilityIdentifier("groupName")
        Button(copy.text("Save")) { model.saveGroup(name: groupName) }
          .accessibilityIdentifier("saveGroup")
        Button(copy.text("Cancel"), role: .cancel, action: model.cancelGroupEdit)
      } message: {
        Text(
          copy.text(
            model.groupEdit == .create
              ? "Enter a name for the new group." : "Enter a new name for this group."))
      }
      .alert(
        copy.text("Delete group and contents?"),
        isPresented: .presented(
          { model.deletingGroup != nil }, close: { model.cancelGroupDeletion() })
      ) {
        Button(copy.text("Delete"), role: .destructive) { model.confirmGroupDeletion() }
          .accessibilityIdentifier("confirmDeleteGroup")
        Button(copy.text("Cancel"), role: .cancel, action: model.cancelGroupDeletion)
      } message: {
        deleteGroupMessage
      }
  }

  private var deleteGroupMessage: Text {
    let warning = copy.text(
      "All nested groups, credentials and their stored fields will be deleted. This action cannot be undone."
    )
    return Text(model.deletingGroup ?? "") + Text("\n\n") + Text(warning)
  }
}

#if DEBUG
  private struct CredentialGroupsPreview: View {
    var model: CredentialsModel
    @State private var groupName = ""
    @Namespace private var zoom
    var body: some View {
      List {
        CredentialGroupsSection(
          model: model, directEntries: model.directEntries, anchor: "credentialsTop",
          groupName: $groupName, zoom: zoom)
      }
      .airCanvas()
      .modifier(CredentialGroupAlerts(model: model, groupName: $groupName))
    }
  }

  #Preview("Groups") {
    CredentialGroupsPreview(model: CredentialPreviewFixtures.catalogModel())
  }
#endif
