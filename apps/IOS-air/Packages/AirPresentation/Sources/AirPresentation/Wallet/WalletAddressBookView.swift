import SwiftUI

struct WalletAddressBookView: View {
  @AirLocalizedCopy private var copy
  var model: WalletAddressBookModel
  let dismiss: () -> Void

  var body: some View {
    NavigationStack {
      List {
        if model.mutation == .working { ProgressView(copy.text("Saving…")) }
        if let issue = model.issue, model.draft == nil {
          Section {
            Text(copy.text(issue.copy))
            if model.mutation == .uncertain {
              Button(copy.text("I have checked the updated contacts")) {
                model.acknowledgeReconciliation()
              }.disabled(model.state != .ready)
            }
          }
        }
        switch model.state {
        case .loading: ProgressView(copy.text("Loading contacts…"))
        case .failed:
          Text(copy.text("Couldn’t load contacts. Try again."))
          Button(copy.text("Try again")) { model.reload() }
        case .revoked: Text(copy.text("Vault locked"))
        case .ready:
          if model.entries.isEmpty {
            Section {
              Label(copy.text("No saved contacts"), systemImage: "person.crop.rectangle.stack")
              Text(copy.text("Save a name, network and address to find recipients later."))
                .foregroundStyle(.secondary)
            }
          }
          ForEach(model.entries, id: \.entryID) { entry in
            Button {
              model.edit(entry.entryID)
            } label: {
              VStack(alignment: .leading, spacing: 4) {
                Text(entry.label).foregroundStyle(.primary)
                Text(entry.network).font(.subheadline).foregroundStyle(.secondary)
                Text(entry.address).font(.caption.monospaced()).foregroundStyle(.secondary)
                  .lineLimit(2).truncationMode(.middle)
                if model.copiedID == entry.entryID {
                  Text(copy.text("Address copied")).font(.caption).foregroundStyle(.secondary)
                }
              }
            }
            .disabled(model.mutation != .idle)
            .contextMenu {
              Button {
                model.copyAddress(entry.entryID)
              } label: {
                Label(copy.text("Copy address"), systemImage: "doc.on.doc")
              }
              Button {
                model.edit(entry.entryID)
              } label: {
                Label(copy.text("Edit"), systemImage: "pencil")
              }
              Button(role: .destructive) {
                model.requestDeletion(entry.entryID)
              } label: {
                Label(copy.text("Delete contact"), systemImage: "trash")
              }
            }
            .swipeActions {
              Button(copy.text("Delete contact"), role: .destructive) {
                model.requestDeletion(entry.entryID)
              }.disabled(model.mutation != .idle)
            }
          }
        }
      }
      .airCanvas()
      .privacySensitive()
      .navigationTitle(copy.text("Address book"))
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Done"), action: dismiss).disabled(!model.canDismiss)
        }
        ToolbarItem(placement: .primaryAction) {
          Button {
            model.add()
          } label: {
            Label(copy.text("Add contact"), systemImage: "plus")
          }.disabled(model.state != .ready || model.mutation != .idle)
        }
      }
      .refreshable { await model.reload()?.value }
      .interactiveDismissDisabled(!model.canDismiss)
      .sheet(
        isPresented: Binding(get: { model.draft != nil }, set: { if !$0 { model.closeEditor() } })
      ) {
        WalletContactEditor(model: model)
      }
      .alert(
        copy.text("Delete contact?"),
        isPresented: Binding(
          get: { model.pendingDeletion != nil }, set: { if !$0 { model.cancelDeletion() } })
      ) {
        Button(copy.text("Delete contact"), role: .destructive) { model.confirmDeletion() }
        Button(copy.text("Cancel"), role: .cancel) { model.cancelDeletion() }
      } message: {
        if let entry = model.pendingDeletion {
          Text(entry.label + "\n" + entry.network + "\n" + entry.address)
        }
      }
    }
  }
}

private struct WalletContactEditor: View {
  @AirLocalizedCopy private var copy
  var model: WalletAddressBookModel
  @FocusState private var focused: WalletAddressBookModel.Field?

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField(copy.text("Name"), text: field(.label)).focused($focused, equals: .label)
          Picker(copy.text("Network"), selection: field(.network)) {
            Text(copy.text("Choose network")).tag("")
            ForEach(model.networks, id: \.self) { Text($0).tag($0) }
            if let current = model.draft?.network, !model.networks.contains(current) {
              Text(current).tag(current)
            }
          }.focused($focused, equals: .network)
          TextField(copy.text("Address"), text: field(.address), axis: .vertical)
            .font(.body.monospaced()).textInputAutocapitalization(.never).autocorrectionDisabled()
            .focused($focused, equals: .address)
        } footer: {
          Text(copy.text("Check the address and its network before saving."))
        }
        .disabled(model.mutation == .working)
        if model.mutation == .working { ProgressView(copy.text("Saving…")) }
        if model.state == .loading { ProgressView(copy.text("Loading contacts…")) }
        if model.state == .failed {
          Text(copy.text("Couldn’t load contacts. Try again."))
          Button(copy.text("Try again")) { model.reload() }
        }
        if let issue = model.issue { Text(copy.text(issue.copy)).foregroundStyle(.red) }
      }
      .airCanvas()
      .privacySensitive()
      .navigationTitle(copy.text(model.draft?.entryID == nil ? "Add contact" : "Edit contact"))
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Cancel")) { model.closeEditor() }.disabled(
            model.mutation == .working)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(copy.text("Save")) {
            model.save()
            focused = model.invalidField
          }
          .disabled(model.mutation != .idle || model.state != .ready)
        }
      }
      .onChange(of: model.invalidField) { _, field in focused = field }
      .interactiveDismissDisabled(model.hasChanges || model.mutation == .working)
      .alert(
        copy.text("Discard changes?"),
        isPresented: Binding(
          get: { model.discardRequested }, set: { if !$0 { model.keepEditing() } })
      ) {
        Button(copy.text("Discard"), role: .destructive) { model.discard() }
        Button(copy.text("Keep editing"), role: .cancel) { model.keepEditing() }
      }
    }
  }
  private func field(_ field: WalletAddressBookModel.Field) -> Binding<String> {
    Binding(
      get: {
        switch field {
        case .label: model.draft?.label ?? ""
        case .network: model.draft?.network ?? ""
        case .address: model.draft?.address ?? ""
        }
      }, set: { model.change(field, to: $0) })
  }
}

extension WalletAddressBookModel.Issue {
  fileprivate var copy: String {
    switch self {
    case .required(.label): "Enter a contact name."
    case .required(.network): "Choose an available network."
    case .required(.address): "Enter an address."
    case .invalidAddress: "This address is not valid for the selected network."
    case .invalidInput: "Check the contact name and address. The address may already be saved."
    case .denied: "This vault does not allow this operation."
    case .unavailable: "Contacts are unavailable for this network or runtime."
    case .missing: "This contact is no longer available. Check the updated list."
    case .uncertain:
      "The change could not be confirmed. Check the updated contacts before continuing."
    }
  }
}
