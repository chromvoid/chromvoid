import SwiftUI

struct PasswordGeneratorView: View {
  @AirLocalizedCopy private var copy
  var model: PasswordGeneratorModel
  let dismiss: () -> Void
  var body: some View {
    NavigationStack {
      Form {
        if let issue = model.issue {
          Text(copy.text(issue)).foregroundStyle(.secondary).accessibilityIdentifier(
            "generatorIssue")
        }
        Section(copy.text("Password length")) {
          Stepper(value: binding(\.length), in: 4...128) {
            LabeledContent(copy.text("Characters"), value: String(model.settings.length))
          }.accessibilityIdentifier("generatorLength")
          Slider(
            value: Binding(
              get: { Double(model.settings.length) },
              set: { value in model.change { $0.length = Int(value) } }),
            in: 4...128, step: 1
          ).accessibilityLabel(copy.text("Password length"))
        }
        Section(copy.text("Character types")) {
          Toggle(copy.text("Lowercase letters (a–z)"), isOn: binding(\.lowercase))
            .accessibilityIdentifier("generatorLowercase")
          Toggle(copy.text("Uppercase letters (A–Z)"), isOn: binding(\.uppercase))
            .accessibilityIdentifier("generatorUppercase")
          Toggle(copy.text("Digits (0–9)"), isOn: binding(\.digits)).accessibilityIdentifier(
            "generatorDigits")
          Toggle(copy.text("Symbols (!@#)"), isOn: binding(\.symbols)).accessibilityIdentifier(
            "generatorSymbols")
        }
        if model.password != nil {
          Section(copy.text("Generated password")) {
            Text(model.displayValue).font(.system(.body, design: .monospaced))
              .accessibilityIdentifier("generatedPassword")
            Button(copy.text(model.revealed ? "Hide" : "Show"), action: model.toggleVisibility)
              .accessibilityIdentifier("revealGeneratedPassword")
          }
        }
        Section {
          Button {
            model.generate()
          } label: {
            Label(
              copy.text(model.password == nil ? "Generate password" : "Generate again"),
              systemImage: "arrow.clockwise")
          }.disabled(model.state != .ready).accessibilityIdentifier("generatePassword")
          if model.state == .generating { ProgressView(copy.text("Generating password…")) }
          Text(copy.text("Use this password in the form, then save the credential to keep it."))
            .font(.footnote).foregroundStyle(.secondary)
        }
      }
      .airCanvas()
      .disabled(model.state == .revoked)
      .privacySensitive()
      .accessibilityIdentifier("passwordGeneratorForm")
      .navigationTitle(copy.text("Generator"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Cancel"), action: dismiss).accessibilityIdentifier("cancelGenerator")
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(copy.text("Use"), action: model.use)
            .disabled(model.state != .ready).accessibilityIdentifier("useGeneratedPassword")
        }
      }
    }
  }
  private func binding<Value>(_ key: WritableKeyPath<PasswordGeneratorModel.Settings, Value>)
    -> Binding<Value>
  {
    Binding(
      get: { model.settings[keyPath: key] },
      set: { value in model.change { $0[keyPath: key] = value } })
  }
}
