import SwiftUI
import UniformTypeIdentifiers

struct CredentialImportView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialImportModel
  let dismiss: () -> Void
  let lock: () -> Void

  var body: some View {
    NavigationStack {
      Form {
        if model.state == .choosing || model.state == .failed {
          Section {
            Label(
              copy.text("Bring your credentials with you"), systemImage: "square.and.arrow.down"
            )
            .font(.headline)
            Text(
              copy.text(
                "Choose a ChromVoid JSON, Bitwarden JSON, CSV, 1Password 1PUX, or KeePass KDBX file. Review it before anything is saved."
              )
            )
            .foregroundStyle(.secondary)
          }
          Section(copy.text("Import mode")) {
            Picker(
              copy.text("Import mode"),
              selection: Binding(get: { model.replacing }, set: { model.setReplacing($0) })
            ) {
              Text(copy.text("Merge with this vault")).tag(false)
              Text(copy.text("Replace all credentials")).tag(true)
            }
            .accessibilityIdentifier("credentialImportMode")
            Text(
              copy.text(
                model.replacing
                  ? "Existing credentials, groups and SSH keys will be replaced. Files and wallets are kept."
                  : "Add new credentials and update matching entries. Other credentials are kept."
              )
            )
            .foregroundStyle(.secondary)
          }
        }
        if !model.filename.isEmpty {
          Section(copy.text("Selected file")) {
            Label(model.filename, systemImage: "doc.text").lineLimit(2)
          }
        }
        if model.state == .password {
          Section(copy.text("KeePass database password")) {
            CredentialSecretInput(
              text: Binding(get: { model.sourcePassword }, set: { model.setSourcePassword($0) }),
              focusRequest: 0, revealed: false,
              label: copy.text("KeePass database password"),
              identifier: "credentialImportPassword", numeric: false
            )
            .privacySensitive()
            Text(
              copy.text(
                "Enter the password for this KeePass file. Key files and hardware keys are not supported."
              )
            )
            .foregroundStyle(.secondary)
          }
        }
        if let preview = model.preview, model.state != .uncertain {
          Section(copy.text(model.state == .finished ? "Imported" : "Ready to import")) {
            count("Credentials", preview.entryCount)
            if let created = preview.createdEntryCount, let updated = preview.updatedEntryCount {
              count("New credentials", created)
              count("Updated credentials", updated)
            }
            count("Groups", preview.folderCount)
            count("SSH keys", preview.sshKeyCount)
          }
          if model.state != .finished {
            Section {
              Text(
                copy.text(
                  model.reviewExplanation
                ))
              if preview.sshKeyCount > 0 {
                Text(
                  copy.text(
                    "SSH key metadata does not contain private keys. Import private keys separately from SSH keys."
                  ))
              }
            }.foregroundStyle(.secondary)
          }
        }
        if !model.warnings.isEmpty {
          Section(copy.text("Import notes")) {
            ForEach(model.warnings) { warning in
              HStack(alignment: .top) {
                Text(copy.text(warning.message))
                Spacer()
                Text(warning.count, format: .number).monospacedDigit()
              }
              .accessibilityIdentifier("credentialImportWarning_" + warning.id)
            }
          }
        }
        Section {
          if let issue = model.issue {
            Text(copy.text(issue)).accessibilityIdentifier("credentialImportIssue")
          }
          switch model.state {
          case .choosing, .failed:
            Button(copy.text("Choose file"), action: model.chooseFile)
              .accessibilityIdentifier("chooseCredentialImportFile")
          case .preparing:
            ProgressView(copy.text("Checking the file…"))
          case .password:
            Button(copy.text("Open database")) { model.submitPassword() }
              .accessibilityIdentifier("openCredentialImportDatabase")
            Button(copy.text("Choose another file"), action: model.chooseFile)
          case .review, .confirming:
            Button(
              copy.text(model.replacing ? "Replace all credentials" : "Import credentials"),
              role: model.replacing ? .destructive : nil
            ) { model.requestImport() }
            .accessibilityIdentifier("confirmCredentialImport")
            Button(copy.text("Choose another file"), action: model.chooseFile)
          case .committing:
            ProgressView(copy.text("Importing credentials…"))
          case .finished:
            Label(copy.text("Credentials imported"), systemImage: "checkmark.circle")
              .accessibilityIdentifier("credentialImportFinished")
          case .uncertain: EmptyView()
          case .revoked: Text(copy.text("Vault locked"))
          }
        }
      }
      .airCanvas()
      .accessibilityIdentifier("credentialImportForm")
      .navigationTitle(copy.text("Import credentials"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(
            copy.text(model.state == .finished || model.state == .uncertain ? "Done" : "Cancel"),
            action: dismiss
          )
          .disabled(model.state == .committing).accessibilityIdentifier("closeCredentialImport")
        }
        ToolbarItem(placement: .primaryAction) {
          Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
        }
      }
      .fileImporter(
        isPresented: Binding(
          get: { model.pickerPresented }, set: { if !$0 { model.cancelPicker() } }),
        allowedContentTypes: [
          .json, .commaSeparatedText, .tabSeparatedText,
          UTType(filenameExtension: "1pux", conformingTo: .data)
            ?? UTType(importedAs: "com.chromvoid.iosair.import.1pux", conformingTo: .data),
          UTType(filenameExtension: "kdbx", conformingTo: .data)
            ?? UTType(importedAs: "com.chromvoid.iosair.import.kdbx", conformingTo: .data),
        ]
      ) {
        model.receiveFile($0)
      }
      .alert(
        copy.text("Replace all credentials?"),
        isPresented: Binding(
          get: { model.state == .confirming }, set: { if !$0 { model.cancelConfirmation() } })
      ) {
        Button(copy.text("Replace all"), role: .destructive) { model.confirmReplacement() }
          .accessibilityIdentifier("replaceCredentialImport")
        Button(copy.text("Cancel"), role: .cancel, action: model.cancelConfirmation)
      } message: {
        Text(
          copy.text(
            "Existing credentials will be replaced with this file. This action cannot be undone."))
      }
    }
    .interactiveDismissDisabled(model.state == .committing)
  }
  private func count(_ label: String, _ value: Int) -> some View {
    HStack {
      Text(copy.text(label))
      Spacer()
      Text(value, format: .number).monospacedDigit()
        .accessibilityIdentifier("credentialImportCount_" + label)
    }
  }
}
