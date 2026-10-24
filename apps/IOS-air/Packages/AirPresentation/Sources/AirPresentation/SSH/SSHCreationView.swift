import SwiftUI
import UniformTypeIdentifiers

struct SSHCreationView: View {
  @AirLocalizedCopy private var copy
  var model: SSHCreationModel
  let dismiss: () -> Void
  @FocusState private var focus: SSHCreationModel.Field?
  private func value(_ field: SSHCreationModel.Field) -> Binding<String> {
    Binding(get: { model.value(field) }, set: { model.change(field, to: $0) })
  }
  var body: some View {
    NavigationStack {
      Form {
        Section {
          Picker(
            copy.text("Add key"),
            selection: Binding(get: { model.mode }, set: { model.setMode($0) })
          ) {
            Text(copy.text("Generate")).tag(SSHCreationModel.Mode.generate)
            Text(copy.text("Import")).tag(SSHCreationModel.Mode.importKey)
          }.pickerStyle(.segmented).accessibilityIdentifier("sshCreationMode")
          TextField(copy.text("Name"), text: value(.name)).focused($focus, equals: .name)
            .accessibilityIdentifier("sshName")
        }
        if model.mode == .generate {
          Section {
            Picker(
              copy.text("Key type"),
              selection: Binding(get: { model.algorithm }, set: { model.setAlgorithm($0) })
            ) {
              Text("Ed25519").tag("ed25519")
              Text("RSA 4096").tag("rsa")
              Text("ECDSA P-256").tag("ecdsa")
            }
            TextField(copy.text("Comment (optional)"), text: value(.comment)).focused(
              $focus, equals: .comment)
            Text(copy.text("Ed25519 is the default. RSA generation may take longer."))
              .font(.footnote).foregroundStyle(.secondary)
          }
        } else {
          Section(copy.text("OpenSSH private key")) {
            Button(copy.text("Choose key file")) { model.beginFileImport() }
              .accessibilityIdentifier("chooseSSHFile")
            TextEditor(text: value(.privateKey)).frame(minHeight: 130).font(.footnote.monospaced())
              .autocorrectionDisabled().textInputAutocapitalization(.never)
              .focused($focus, equals: .privateKey).accessibilityLabel(copy.text("Private key"))
              .accessibilityIdentifier("sshPrivateKey")
            SecureField(copy.text("Key passphrase (if encrypted)"), text: value(.passphrase))
              .focused($focus, equals: .passphrase).accessibilityIdentifier("sshImportPassphrase")
            Text(copy.text("The passphrase opens this file. Your vault protects the saved key."))
              .font(.footnote).foregroundStyle(.secondary)
          }
        }
        if let issue = model.issue {
          Section {
            Text(copy.text(issue)).foregroundStyle(.red).accessibilityIdentifier("sshCreationIssue")
          }
        }
        if model.state == .saving || model.state == .reading {
          ProgressView(
            copy.text(model.state == .saving ? "Saving SSH key…" : "Reading key file…"))
        }
      }
      .airCanvas()
      .disabled(model.state != .editing).privacySensitive().accessibilityIdentifier("sshCreation")
      .navigationTitle(copy.text("Add SSH key")).navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Cancel")) { if model.requestClose() { dismiss() } }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(copy.text(model.mode == .generate ? "Generate" : "Import")) { model.submit() }
            .disabled(model.state != .editing).accessibilityIdentifier("saveSSHKey")
        }
      }
      .interactiveDismissDisabled(
        model.isDirty || model.state == .saving || model.state == .reading
      )
      .alert(
        copy.text(
          model.state == .saving ? "Close while saving?" : "Discard this SSH key draft?"),
        isPresented: Binding(
          get: { model.confirmingDiscard }, set: { if !$0 { model.cancelDiscard() } })
      ) {
        if model.state == .saving {
          Button(copy.text("Close"), action: dismiss)
        } else {
          Button(copy.text("Discard"), role: .destructive, action: dismiss)
        }
        Button(copy.text("Cancel"), role: .cancel) { model.cancelDiscard() }
      } message: {
        if model.state == .saving {
          Text(copy.text("The key may still be saved. Check SSH keys before trying again."))
        }
      }
      .fileImporter(
        isPresented: Binding(
          get: { model.importingFile }, set: { if !$0 { model.dismissFileImport() } }),
        allowedContentTypes: [.data]
      ) { model.importFile($0) }
      .onChange(of: model.focusRevision) { focus = model.focus }
    }
  }
}
