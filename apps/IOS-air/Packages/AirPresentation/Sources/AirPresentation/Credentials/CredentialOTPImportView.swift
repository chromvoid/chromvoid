import SwiftUI

struct CredentialOTPImportView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialOTPImportModel
  let dismiss: () -> Void
  var body: some View {
    NavigationStack {
      Group {
        if case .scanning(let session) = model.state {
          OTPScanner(model: model, session: session)
            .overlay(alignment: .bottom) {
              Button(copy.text("Use setup link"), action: model.useLink)
                .buttonStyle(.borderedProminent).padding()
            }
        } else {
          Form {
            if let issue = model.issue {
              Text(copy.text(issue)).foregroundStyle(.secondary).accessibilityIdentifier(
                "otpImportIssue")
            }
            if model.state == .authorizing || model.state == .parsing {
              ProgressView(copy.text("Reading setup…"))
            } else if model.state == .revoked {
              Text(copy.text("Vault locked"))
            } else {
              Section {
                Button {
                  model.scan()
                } label: {
                  Label(copy.text("Scan QR code"), systemImage: "qrcode.viewfinder")
                }
                .accessibilityIdentifier("scanOTP")
              }
              Section(copy.text("Setup link")) {
                CredentialSecretInput(
                  text: Binding(get: { model.uri }, set: { model.changeURI($0) }),
                  focusRequest: model.focusRevision > 0 ? model.focusRevision : nil,
                  revealed: false, label: copy.text("Paste an otpauth link"),
                  identifier: "otpURI", numeric: false)
                Text(
                  copy.text(
                    "The link contains your setup key. You can review the settings before saving.")
                )
                .font(.footnote).foregroundStyle(.secondary)
              }
            }
          }.accessibilityIdentifier("otpImportForm")
            .airCanvas()
        }
      }
      .privacySensitive()
      .navigationTitle(copy.text("Import one-time code"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Cancel"), action: dismiss).accessibilityIdentifier("cancelOTPImport")
        }
        // toolbar-mode: the link is being typed; the review that follows replaces this bar
        if model.state == .input {
          ToolbarItem(placement: .confirmationAction) {
            Button(copy.text("Review")) { model.review() }.accessibilityIdentifier(
              "reviewOTPImport")
          }
        }
      }
    }
  }
}
