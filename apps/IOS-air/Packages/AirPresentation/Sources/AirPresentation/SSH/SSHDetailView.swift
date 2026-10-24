import SwiftUI
import UniformTypeIdentifiers

struct SSHDetailView: View {
  @AirLocalizedCopy private var copy
  var model: SSHDetailModel
  let lock: () -> Void
  @FocusState private var nameFocused: Bool
  var body: some View {
    Form {
      if let row = model.row {
        Section {
          Label(row.key.name ?? copy.text("SSH key"), systemImage: "terminal").font(.headline)
          LabeledContent(copy.text("Key type"), value: row.key.type.uppercased())
          Text(row.key.fingerprint).font(.footnote.monospaced()).textSelection(.enabled)
          if let comment = row.key.comment, !comment.isEmpty {
            Text(comment).foregroundStyle(.secondary)
          }
          if let path = row.sourcePath {
            Text(path).font(.footnote).foregroundStyle(.secondary)
          }
          if row.key.sourceEntryID != nil {
            Button(copy.text("Open linked credential")) { model.openSource() }
              .disabled(model.state != .ready).accessibilityIdentifier("openSSHSource")
          }
        }
        if model.editing {
          Section(copy.text("Edit key")) {
            TextField(
              copy.text("Name"),
              text: Binding(get: { model.name }, set: { model.changeName($0) })
            ).focused($nameFocused).accessibilityIdentifier("editSSHName")
            if row.key.sourceEntryID != nil {
              Toggle(
                copy.text("Keep credential link"),
                isOn: Binding(get: { model.keepSource }, set: { model.setKeepSource($0) }))
            }
            Button(copy.text("Save changes")) { model.save() }.accessibilityIdentifier(
              "saveSSHEdit")
            Button(copy.text("Cancel")) { model.cancelEdit() }
          }.disabled(model.state != .ready)
        } else if let kind = model.exportKind {
          Section(copy.text(kind == .privateKey ? "Export private key" : "Export public key")) {
            if kind == .privateKey {
              SecureField(
                copy.text("Export passphrase (optional)"),
                text: Binding(get: { model.passphrase }, set: { model.changePassphrase($0) })
              ).accessibilityIdentifier("sshExportPassphrase")
              Text(
                copy.text(
                  "A private key grants access to your servers. Use a passphrase to protect the exported file."
                )
              )
              .font(.footnote).foregroundStyle(.secondary)
            }
            Button(copy.text("Choose save location")) { model.export() }.accessibilityIdentifier(
              "saveSSHExport")
            Button(copy.text("Cancel")) { model.cancelExport() }
          }.disabled(model.state != .ready)
        } else {
          Section {
            Button(copy.text(model.copied ? "Copied" : "Copy public key")) {
              model.copyPublicKey()
            }.accessibilityIdentifier("copySSHPublic")
            Button(copy.text("Export public key")) { model.beginExport(.publicKey) }
            Button(copy.text("Export private key")) { model.beginExport(.privateKey) }
              .accessibilityIdentifier("exportSSHPrivate")
            Button(copy.text("Edit key")) { model.beginEdit() }.accessibilityIdentifier(
              "editSSHKey")
          }.disabled(model.state != .ready)
          Section {
            Button(copy.text("Delete SSH key"), role: .destructive) { model.requestDelete() }
              .accessibilityIdentifier("deleteSSHKey")
          }.disabled(model.state != .ready)
        }
      }
      if model.state == .working { ProgressView() }
      if let issue = model.issue {
        Text(copy.text(issue)).foregroundStyle(.red).accessibilityIdentifier("sshDetailIssue")
      }
    }
    .airCanvas()
    .privacySensitive().accessibilityIdentifier("sshDetail")
    .navigationTitle(copy.text("SSH key")).navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button(action: lock) { Image(systemName: "lock") }.accessibilityLabel(
          copy.text("Lock vault"))
      }
    }
    .alert(
      copy.text("Delete this SSH key?"),
      isPresented: .presented({ model.confirmingDelete }, close: { model.cancelDelete() })
    ) {
      Button(copy.text("Delete SSH key"), role: .destructive) { model.delete() }
        .accessibilityIdentifier("confirmDeleteSSH")
      Button(copy.text("Cancel"), role: .cancel) { model.cancelDelete() }
    } message: {
      Text(
        copy.text(
          "This removes the key from your vault. Copies already exported remain available."))
    }
    .alert(
      copy.text("Export without a passphrase?"),
      isPresented: .presented({ model.confirmingPlaintext }, close: { model.cancelPlaintext() })
    ) {
      Button(copy.text("Export unencrypted"), role: .destructive) {
        model.export(allowPlaintext: true)
      }
      Button(copy.text("Cancel"), role: .cancel) { model.cancelPlaintext() }
        .accessibilityIdentifier("cancelSSHPlaintext")
    } message: {
      Text(copy.text("Anyone with this file can use the private key."))
    }
    .fileExporter(
      isPresented: .presented({ model.presentingDocument }, close: { model.cancelExport() }),
      document: model.document, contentType: .data, defaultFilename: model.filename
    ) { model.finishExport($0) }
    .onChange(of: model.focusRevision) { nameFocused = true }
    .onDisappear { model.cancelExport() }
  }
}
