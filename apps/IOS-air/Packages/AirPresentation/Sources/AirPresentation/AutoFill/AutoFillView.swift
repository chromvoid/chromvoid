import SwiftUI

struct AutoFillView: View {
  @AirLocalizedCopy private var copy
  var model: AutoFillModel
  let dismiss: () -> Void

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Label(copy.text("AutoFill in this development build"), systemImage: "key.horizontal")
            .font(.headline)
          Text(copy.text("AutoFill integration is still in development in this build."))
            .foregroundStyle(.secondary)
          Text(
            copy.text(
              "Leaving the app locks your vault and stops provider access. Turning on AutoFill does not change this."
            ))
        }
        Section {
          if model.state == .loading {
            ProgressView(copy.text("Checking AutoFill…"))
          } else if model.state == .ready {
            statusRow(
              "System AutoFill", value: copy.text(model.systemSummary), identifier: "autoFillSystem"
            )
            statusRow(
              "Vault access", value: copy.text(model.accessSummary), identifier: "autoFillAccess")
            statusRow(
              "Password suggestions", value: identitySummary, identifier: "autoFillIdentities"
            )
          } else if model.state == .failed {
            Text(copy.text("Couldn’t check AutoFill. Try again."))
          } else {
            Text(copy.text("AutoFill status will refresh when you return to the app."))
          }
          Button(copy.text("Refresh status")) { model.reload() }
            .disabled(model.state == .loading || model.state == .suspended)
            .accessibilityIdentifier("refreshAutoFill")
        } header: {
          Text(copy.text("Current status"))
        } footer: {
          Text(
            copy.text(
              "Suggestions contain account and website metadata, never passwords or passkey secrets."
            ))
        }
        Section {
          if model.canOpenSettings {
            Button {
              model.openSettings()
            } label: {
              HStack {
                Text(copy.text("Open AutoFill Settings"))
                Spacer()
                if model.openingSettings {
                  ProgressView()
                } else {
                  Image(systemName: "arrow.up.right")
                }
              }
            }
            .disabled(model.openingSettings || model.state == .suspended)
            .accessibilityIdentifier("openAutoFillSettings")
            Text(
              copy.text(
                "In iOS Settings, allow ChromVoid Air to provide passwords and passkeys.")
            )
            .foregroundStyle(.secondary)
          } else {
            Text(
              copy.text(
                "Open Settings → Passwords → Password Options, then select ChromVoid Air under Allow Filling From."
              ))
          }
          if model.settingsFailed {
            Text(
              copy.text(
                "Couldn’t open Settings. Open the Settings app and find AutoFill & Passwords.")
            )
            .foregroundStyle(.secondary)
          }
          Text(
            copy.text(
              "If your vault is closed on return, tap Done and unlock it in ChromVoid Air.")
          )
          .foregroundStyle(.secondary)
        } header: {
          Text(copy.text("Configure in iOS"))
        }
      }
      .airCanvas()
      .navigationTitle(copy.text("AutoFill"))
      .navigationBarTitleDisplayMode(.inline)
      .accessibilityIdentifier("autoFillSetup")
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(copy.text("Done"), action: dismiss)
            .accessibilityIdentifier("closeAutoFill")
        }
      }
    }
  }

  private func statusRow(_ title: String, value: String, identifier: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(copy.text(title)).font(.subheadline).foregroundStyle(.secondary)
      Text(value).accessibilityIdentifier(identifier)
    }
    .padding(.vertical, 2)
  }
  private var identitySummary: String {
    switch model.status?.identities {
    case .synchronized(let count):
      return String(format: copy.text("Stored: %lld"), Int64(count))
    case .disabled: return copy.text("Enable AutoFill to update suggestions")
    case .updating: return copy.text("Updating suggestions…")
    case .cleared: return copy.text("No suggestions stored")
    case .failed: return copy.text("Suggestions could not be updated")
    case .unavailable, nil: return copy.text("Not available in this build")
    }
  }
}
