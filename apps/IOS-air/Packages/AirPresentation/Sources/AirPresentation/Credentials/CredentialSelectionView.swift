import SwiftUI

struct CredentialSelectionView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialSelectionModel
  var catalog: CredentialsModel
  let dismiss: () -> Void

  var body: some View {
    NavigationStack {
      List {
        if model.state == .selecting || model.state == .confirming {
          Section {
            Text(copy.format("Selected: %@", copy.count(model.chosen.count)))
              .accessibilityIdentifier("selectedCredentialCount")
            Text(copy.text("Choose credentials from the current search and filters."))
              .foregroundStyle(.secondary)
          }
          Section {
            if catalog.state == .loading { ProgressView(copy.text("Loading credentials…")) }
            ForEach(catalog.entries, id: \.id) { entry in
              Button {
                model.toggle(entry)
              } label: {
                HStack(spacing: 12) {
                  Image(systemName: model.contains(entry.id) ? "checkmark.circle.fill" : "circle")
                  VStack(alignment: .leading, spacing: 4) {
                    Text(entry.title.isEmpty ? copy.text("Untitled credential") : entry.title)
                      .foregroundStyle(Color.primary)
                    if !entry.username.isEmpty {
                      Text(entry.username).foregroundStyle(Color.secondary)
                    }
                    Text(entry.groupPath).font(.caption).foregroundStyle(Color.secondary)
                  }
                }.frame(minHeight: 44)
              }
              .disabled(!model.canSelect(entry))
              .accessibilityAddTraits(model.contains(entry.id) ? .isSelected : [])
              .accessibilityIdentifier("selectCredential_" + entry.id)
            }
            if catalog.state == .failed || catalog.state == .groupMissing {
              Text(copy.text("Couldn’t load credentials"))
              Button(copy.text("Try again")) { catalog.reload() }
            } else if catalog.canLoadMore {
              if catalog.loadingMore {
                ProgressView(copy.text("Loading credentials…"))
              } else {
                Button(copy.text("Load more"), action: catalog.loadMore)
              }
            } else if catalog.state == .ready && catalog.entries.isEmpty {
              Text(copy.text("No matching credentials"))
            }
          }
        } else if model.state == .revoked {
          Text(copy.text("Vault locked"))
        } else {
          Section {
            if model.state == .deleting {
              ProgressView(
                value: Double(model.results.count), total: Double(model.chosen.count)
              ) { Text(copy.text("Deleting credentials…")) }
            }
            Text(copy.format("Deleted: %@", copy.count(model.deletedCount)))
              .accessibilityIdentifier("deletedCredentialCount")
            if model.needsCheck {
              Text(
                copy.text(
                  "Deletion stopped because one result could not be confirmed. Close this report and check the vault before trying again."
                ))
            }
          }
          Section(copy.text("Results")) {
            ForEach(model.results) { result in
              VStack(alignment: .leading, spacing: 4) {
                Text(
                  result.entry.title.isEmpty
                    ? copy.text("Untitled credential") : result.entry.title)
                Text(copy.text(result.outcome.label)).foregroundStyle(.secondary)
              }
            }
          }
        }
      }
      .airCanvas()
      .privacySensitive().accessibilityIdentifier("credentialSelectionForm")
      .navigationTitle(
        copy.text(model.state == .finished ? "Deletion results" : "Select credentials")
      )
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text(model.state == .finished ? "Done" : "Cancel"), action: dismiss)
            .disabled(model.state == .deleting).accessibilityIdentifier("closeCredentialSelection")
        }
        // toolbar-mode: selection is a mode the person turns on
        if model.state == .selecting {
          ToolbarItem(placement: .primaryAction) {
            Button(role: .destructive, action: model.requestDeletion) {
              Label(copy.text("Delete selected"), systemImage: "trash")
            }
            .disabled(model.chosen.isEmpty).accessibilityIdentifier("deleteSelectedCredentials")
          }
        }
      }
      .alert(
        copy.text("Delete selected credentials?"),
        isPresented: Binding(
          get: { model.state == .confirming }, set: { if !$0 { model.cancelDeletion() } })
      ) {
        Button(copy.text("Delete"), role: .destructive) { model.confirmDeletion() }
          .accessibilityIdentifier("confirmDeleteSelectedCredentials")
        Button(copy.text("Cancel"), role: .cancel, action: model.cancelDeletion)
      } message: {
        Text(copy.format("Selected: %@", copy.count(model.chosen.count)) + "\n\n")
          + Text(
            copy.text(
              "The selected credentials and their stored fields will be deleted. This action cannot be undone."
            ))
      }
    }
    .interactiveDismissDisabled(model.state == .deleting)
  }
}
