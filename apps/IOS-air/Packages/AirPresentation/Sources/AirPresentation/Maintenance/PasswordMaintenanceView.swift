import SwiftUI

struct PasswordMaintenanceView: View {
  /// The button the keyboard must not cover.
  private static let submitAnchor = "passwordMaintenanceSubmit"
  @AirLocalizedCopy private var copy
  var model: PasswordMaintenanceModel
  let dismiss: () -> Void

  var body: some View {
    NavigationStack {
      ScrollViewReader { scroll in
        Form {
          switch model.state {
          case .editing:
            Section {
              Text(
                copy.text(
                  model.kind == .vault
                    ? "Change the password for the vault that is currently open."
                    : "Change the password that protects administrative actions on this device.")
              )
              .foregroundStyle(.secondary)
            }
            Section(copy.text("Current password")) {
              password(
                .current, label: "Current password", identifier: "maintenanceCurrentPassword")
            }
            Section(copy.text("New password")) {
              password(.newPassword, label: "New password", identifier: "maintenanceNewPassword")
              password(
                .confirmation, label: "Repeat new password", identifier: "maintenanceRepeatPassword"
              )
            }
            Section {
              Button(copy.text("Change password")) { model.submit() }
                .accessibilityIdentifier("submitPasswordMaintenance")
                .id(Self.submitAnchor)
            } footer: {
              Text(
                copy.text(
                  model.kind == .vault
                    ? "Make a new backup to keep your recovery copy up to date."
                    : "Existing backups keep their original administrative password. Make a new backup after changing it."
                ))
            }
          case .working:
            Section {
              ProgressView(copy.text("Changing password…"))
              Text(copy.text("Keep the app open until the operation finishes."))
                .foregroundStyle(.secondary)
            }
          case .completed:
            Section {
              Label(copy.text("Password changed"), systemImage: "checkmark.circle")
                .font(.headline)
              if model.backupRecommended {
                Text(copy.text("Make a new backup to keep your recovery copy up to date."))
                  .foregroundStyle(.secondary)
              }
            }
          case .uncertain:
            Section {
              Label(
                copy.text("Check access before trying again"),
                systemImage: "exclamationmark.circle"
              )
              .font(.headline)
              Text(
                copy.text(
                  "The password change could not be confirmed. Close this screen and check access before attempting another change."
                )
              )
              .foregroundStyle(.secondary)
            }
          case .revoked: EmptyView()
          }
          if let issue = model.issue {
            Section { Text(copy.text(message(issue))).foregroundStyle(.red) }
          }
        }
        .airCanvas()
        .navigationTitle(
          copy.text(model.kind == .vault ? "Vault password" : "Administrative password")
        )
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .keepsSubmitVisible(Self.submitAnchor, in: scroll)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(copy.text("Done"), action: dismiss).disabled(model.state == .working)
          }
        }
        .interactiveDismissDisabled(model.state == .working)
      }
    }
  }

  private func password(_ field: PasswordMaintenanceModel.Field, label: String, identifier: String)
    -> some View
  {
    CredentialSecretInput(
      text: Binding(
        get: {
          switch field {
          case .current: model.currentPassword
          case .newPassword: model.newPassword
          case .confirmation: model.confirmation
          }
        }, set: { model.change(field, value: $0) }),
      focusRequest: model.focus == field ? model.focusRevision : nil, revealed: false,
      label: copy.text(label), identifier: identifier, numeric: false
    )
    .privacySensitive()
  }

  private func message(_ issue: PasswordMaintenanceModel.Issue) -> String {
    switch issue {
    case .currentRequired: "Enter your current password."
    case .newRequired: "Enter a new password."
    case .mismatch: "The new passwords don’t match."
    case .samePassword: "Choose a password different from the current one."
    case .reauthentication: "The current password could not be verified. Try again."
    case .policy: "The new password does not meet the requirements. Choose another password."
    case .cancelled: "The password change was cancelled. You can try again."
    }
  }
}
