import SwiftUI

struct SSHView: View {
  @AirLocalizedCopy private var copy
  var model: SSHModel
  let lock: () -> Void
  var body: some View {
    // Pushed from the vault; key detail and linked credential push onto the same stack.
    List {
      Section {
        if model.sourceID != nil { Text(copy.text("Keys linked to this credential")) }
        Picker(
          copy.text("Key type"),
          selection: Binding(
            get: { model.keyType }, set: { model.setKeyType($0) }
          )
        ) {
          ForEach(SSHModel.KeyType.allCases, id: \.self) { type in
            Text(type == .all ? copy.text("All types") : type.rawValue.uppercased()).tag(type)
          }
        }.accessibilityIdentifier("sshTypeFilter")
        if model.hasFilters {
          Button(copy.text("Clear filters")) { model.clearFilters() }
            .accessibilityIdentifier("clearSSHFilters")
        }
      } footer: {
        Text(copy.text("Keep SSH keys in your vault and export them when you need to connect."))
      }
      if model.state == .loading {
        ProgressView(copy.text("Loading SSH keys…"))
      } else if model.state == .failed || model.state == .stale {
        Section {
          Text(
            copy.text(
              model.state == .stale
                ? "SSH keys changed. Reload to continue." : "Couldn’t load SSH keys. Try again."))
          Button(copy.text("Reload")) { model.reload() }
        }
      } else if model.state == .ready {
        Section {
          if model.keys.isEmpty {
            Text(copy.text(model.hasFilters ? "No matching SSH keys" : "No SSH keys yet"))
              .foregroundStyle(.secondary)
            if !model.hasFilters {
              Button(copy.text("Add SSH key")) { model.beginCreation() }
            }
          }
          ForEach(model.keys, id: \.key.id) { row in
            Button {
              model.select(row.key.id)
            } label: {
              HStack {
                Image(systemName: "terminal").foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 4) {
                  Text(row.key.name ?? copy.text("SSH key")).font(.headline)
                  Text(row.key.type.uppercased()).font(.caption).foregroundStyle(.secondary)
                  if let path = row.sourcePath {
                    Text(path).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                  }
                  Text(row.key.fingerprint).font(.caption.monospaced()).lineLimit(1)
                    .truncationMode(.middle).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary)
              }.contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityIdentifier("sshKey_" + row.key.id)
          }
          if model.loadingMore {
            ProgressView()
          } else if model.canLoadMore {
            Button(copy.text("Load more")) { model.loadMore() }
          }
        }
      }
    }
    .airCanvas()
    .privacySensitive().accessibilityIdentifier("sshCatalog")
    .navigationTitle(copy.text("SSH keys"))
    .searchable(
      text: Binding(get: { model.query }, set: { model.search($0) }),
      placement: .navigationBarDrawer(displayMode: .always),
      prompt: Text(copy.text("Name, fingerprint or linked credential"))
    )
    .keepsToolbarDuringSearch()
    .toolbar {
      ToolbarItemGroup(placement: .primaryAction) {
        Button(action: lock) { Image(systemName: "lock") }.accessibilityLabel(
          copy.text("Lock vault"))
        Button {
          model.beginCreation()
        } label: {
          Image(systemName: "plus")
        }
        .accessibilityLabel(copy.text("Add SSH key")).accessibilityIdentifier("addSSHKey")
      }
    }
    .sheet(item: .presence({ model.creation }, close: { model.endCreation() })) {
      creation in
      SSHCreationView(model: creation, dismiss: model.endCreation)
    }
    .navigationDestination(
      isPresented: .presented({ model.selected != nil }, close: { model.closeDetail() })
    ) {
      if let detail = model.selected {
        SSHDetailView(model: detail, lock: lock)
          .navigationDestination(
            isPresented: .presented(
              { model.linkedCredential != nil }, close: { model.closeSource() })
          ) {
            if let credential = model.linkedCredential {
              CredentialDetailView(model: credential, lock: lock)
            }
          }
      }
    }
  }
}
