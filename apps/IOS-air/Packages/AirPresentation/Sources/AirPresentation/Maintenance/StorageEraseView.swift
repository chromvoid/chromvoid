import SwiftUI

struct StorageEraseView: View {
  @AirLocalizedCopy private var copy
  var model: StorageEraseModel
  let dismiss: () -> Void
  @FocusState private var passwordFocused: Bool

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text(
            copy.text(
              "Delete all vaults, credentials, files and wallets stored in this app on this device."
            ))
          Text(
            copy.text(
              "Trusted devices and connection settings will also be removed. This cannot be undone."
            )
          )
          .foregroundStyle(.secondary)
        }
        switch model.state {
        case .initial, .reviewing:
          ProgressView(copy.text("Preparing deletion…"))
        case .ready:
          Section {
            Toggle(
              copy.text("I understand that all local data will be deleted."),
              isOn: Binding(get: { model.acknowledged }, set: { model.acknowledge($0) })
            )
            .accessibilityIdentifier("acknowledgeStorageErase")
            SecureField(
              copy.text("Administrative password"),
              text: Binding(get: { model.password }, set: { model.changePassword($0) })
            )
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .privacySensitive().focused($passwordFocused)
            .submitLabel(.go).onSubmit { model.submit() }
            .accessibilityIdentifier("erasePassword")
          }
          Section {
            Button(copy.text("Delete all local data"), role: .destructive) { model.submit() }
              .accessibilityIdentifier("confirmStorageErase")
          }
        case .committing:
          ProgressView(copy.text("Deleting local data…"))
        case .failed:
          Button(copy.text("Review deletion again")) { model.prepare() }
        case .revoked:
          Text(copy.text("This confirmation is no longer available."))
        }
        if let issue = model.issue {
          Text(copy.text(message(issue))).foregroundStyle(.red)
            .accessibilityIdentifier("storageEraseIssue")
        }
      }
      .airCanvas()
      .navigationTitle(copy.text("Delete data"))
      .navigationBarTitleDisplayMode(.inline)
      .scrollDismissesKeyboard(.interactively)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Cancel"), action: dismiss).disabled(model.state == .committing)
        }
      }
      .interactiveDismissDisabled(model.state == .committing)
      .onChange(of: model.issue) { focusPassword(for: model.issue) }
      .onChange(of: model.state) { releasePassword(for: model.state) }
    }
  }

  private func focusPassword(for issue: StorageEraseModel.Issue?) {
    passwordFocused = issue == .passwordRequired || issue == .invalidPassword
  }

  private func releasePassword(for state: StorageEraseModel.State) {
    if state != .ready { passwordFocused = false }
  }

  private func message(_ issue: StorageEraseModel.Issue) -> String {
    switch issue {
    case .acknowledgementRequired: "Confirm that you understand which data will be deleted."
    case .passwordRequired: "Enter the administrative password."
    case .invalidPassword: "The administrative password is incorrect."
    case .reviewFailed: "Deletion could not be prepared. Try again."
    case .reviewExpired: "This confirmation could not be used. Review deletion again."
    }
  }
}
