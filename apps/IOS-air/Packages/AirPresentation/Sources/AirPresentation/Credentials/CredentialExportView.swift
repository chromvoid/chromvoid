import SwiftUI

struct CredentialExportView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialExportModel
  let dismiss: () -> Void
  let lock: () -> Void

  var body: some View {
    let attempt = model.attemptID
    NavigationStack {
      Form {
        if model.state != .finished {
          Section {
            Label(
              copy.text("Save a copy of your credentials"), systemImage: "square.and.arrow.up"
            )
            .font(.headline)
            Text(
              copy.text(
                "This JSON file is not encrypted. It includes passwords, notes and one-time code secrets. Anyone with the file can read them."
              ))
            Text(copy.text("SSH private keys, files and wallets are not included."))
              .foregroundStyle(.secondary)
          }
        }
        Section {
          if let issue = model.issue {
            Text(copy.text(issue)).accessibilityIdentifier("credentialExportIssue")
          }
          switch model.state {
          case .ready, .failed:
            Button(copy.text("Choose save location")) { model.chooseDestination() }
              .accessibilityIdentifier("chooseCredentialExportDestination")
          case .preparing:
            ProgressView(copy.text("Preparing the export…"))
          case .choosingDestination:
            Text(copy.text("Choose a location in Files."))
          case .finished:
            Label(copy.text("Export saved"), systemImage: "checkmark.circle")
              .accessibilityIdentifier("credentialExportFinished")
            Text(model.savedFilename).foregroundStyle(.secondary)
          case .revoked:
            Text(copy.text("Vault locked"))
          }
        }
      }
      .airCanvas()
      .navigationTitle(copy.text("Export credentials"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text(model.state == .finished ? "Done" : "Cancel"), action: dismiss)
            .accessibilityIdentifier("closeCredentialExport")
        }
        ToolbarItem(placement: .primaryAction) {
          Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
        }
      }
      .fileExporter(
        isPresented: Binding(
          get: { model.exporterPresented }, set: { if !$0 { model.dismissExporter() } }),
        document: model.document, contentType: .json, defaultFilename: "ChromVoid-credentials.json"
      ) { model.finishExport($0, attempt: attempt) }
    }
  }
}
