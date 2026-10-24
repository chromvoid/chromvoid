import SwiftUI

struct CredentialClearView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialClearModel
  let dismiss: () -> Void
  let lock: () -> Void

  var body: some View {
    NavigationStack {
      Form {
        if model.state != .finished {
          Section {
            Label(copy.text("Clear all credentials"), systemImage: "trash")
              .font(.headline)
            Text(
              copy.text(
                "Deletes all logins, payment cards, one-time codes, SSH keys, groups and tags in this vault. Files and wallets are kept."
              ))
            Text(
              copy.text(
                "This action cannot be undone. Export anything you want to keep before continuing.")
            )
            .foregroundStyle(.secondary)
          }
        }
        Section {
          switch model.state {
          case .ready, .confirming:
            Button(
              copy.text("Clear all credentials"), role: .destructive, action: model.requestClear
            )
            .accessibilityIdentifier("requestClearCredentials")
          case .clearing:
            ProgressView(copy.text("Clearing credentials…"))
          case .finished:
            Label(copy.text("All credentials cleared"), systemImage: "checkmark.circle")
              .accessibilityIdentifier("credentialsCleared")
            Text(copy.text("Files and wallets are kept."))
          case .denied:
            Text(copy.text("Access denied. Credentials were not cleared."))
          case .uncertain:
            Text(
              copy.text(
                "The clear result could not be confirmed. Close this screen and check the vault before trying again."
              ))
          case .revoked:
            Text(copy.text("Vault locked"))
          }
        }
      }
      .airCanvas()
      .navigationTitle(copy.text("Clear credentials"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(
            copy.text(model.state == .ready || model.state == .confirming ? "Cancel" : "Done"),
            action: dismiss
          )
          .disabled(model.state == .clearing).accessibilityIdentifier("closeCredentialClear")
        }
        ToolbarItem(placement: .primaryAction) {
          Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
        }
      }
      .alert(
        copy.text("Clear all credentials?"),
        isPresented: Binding(
          get: { model.state == .confirming }, set: { if !$0 { model.cancelClear() } })
      ) {
        Button(copy.text("Clear all"), role: .destructive) { model.confirmClear() }
          .accessibilityIdentifier("confirmClearCredentials")
        Button(copy.text("Cancel"), role: .cancel, action: model.cancelClear)
          .accessibilityIdentifier("cancelClearCredentials")
      } message: {
        Text(
          copy.text(
            "All credentials and their protected fields will be permanently deleted from this vault."
          ))
      }
    }
    .interactiveDismissDisabled(model.state == .clearing)
  }
}
