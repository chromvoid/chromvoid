import ChromVoidBridge
import SwiftUI

struct CredentialOTPView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialOTPModel
  let dismiss: () -> Void
  @FocusState private var focused: CredentialOTPModel.Field?
  var body: some View {
    NavigationStack {
      Form {
        if let issue = model.issue {
          Text(copy.text(issue)).foregroundStyle(.secondary).accessibilityIdentifier("otpIssue")
        }
        if model.draft != nil {
          editor
        } else {
          switch model.state {
          case .loading: ProgressView(copy.text("Loading codes…"))
          case .failed:
            Text(copy.text("Couldn’t load codes."))
            Button(copy.text("Try again")) { model.reload() }
          case .revoked: Text(copy.text("Vault locked"))
          case .ready:
            if model.records.isEmpty {
              emptyState
            }
            ForEach(model.records, id: \.label) { record in recordSection(record) }
          }
        }
        if model.mutation == .saving { ProgressView(copy.text("Saving…")) }
        if model.mutation == .uncertain || (model.draft == nil && model.issue != nil) {
          Button(copy.text("Check saved state")) { model.reload() }
        }
      }
      .airCanvas()
      .accessibilityIdentifier("otpForm")
      .animation(AirMotion.layout, value: model.records.map(\.label))
      .animation(AirMotion.layout, value: model.shown)
      .animation(AirMotion.layout, value: model.draft == nil)
      .airToast(
        model.copied ? copy.text("Copied. Expires in 15 seconds on this device.") : nil,
        systemImage: "checkmark", identifier: "otpCopied"
      )
      .task(id: model.copied) {
        guard model.copied else { return }
        try? await Task.sleep(for: .seconds(3))
        if !Task.isCancelled { model.clearCopied() }
      }
      .privacySensitive()
      .navigationTitle(copy.text(model.draft == nil ? "One-time codes" : "Code settings"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text(model.draft == nil ? "Done" : "Cancel")) {
            if model.draft == nil { dismiss() } else { model.cancelEdit() }
          }.disabled(model.mutation != .idle)
        }
        ToolbarItem(placement: .confirmationAction) {
          // toolbar-mode: a code is open for editing, so Save stands where Add code does
          if model.draft != nil {
            Button(copy.text("Save")) {
              focused = nil
              model.save()
            }
            .disabled(model.mutation != .idle).accessibilityIdentifier("saveOTP")
          } else {
            Menu {
              Button(copy.text("Enter setup key")) { model.beginEdit() }
                .accessibilityIdentifier("manualOTP")
              Button(copy.text("Scan or paste setup link"), action: model.beginImport)
                .accessibilityIdentifier("importOTP")
            } label: {
              Label(copy.text("Add code"), systemImage: "plus")
            }
            .disabled(!model.canInteract).accessibilityIdentifier("addOTP")
          }
        }
      }
      .onChange(of: model.focusRevision) { focused = model.invalidField }
      .alert(
        copy.text("Delete code?"),
        isPresented: Binding(
          get: { model.deleting != nil }, set: { if !$0 { model.cancelDelete() } })
      ) {
        Button(copy.text("Delete"), role: .destructive) { model.confirmDelete() }
          .accessibilityIdentifier("confirmDeleteOTP")
        Button(copy.text("Cancel"), role: .cancel, action: model.cancelDelete)
      } message: {
        Text(
          copy.text(
            "This removes the saved setup key. Make sure you have another way to sign in."))
      }
    }
    .interactiveDismissDisabled(model.mutation != .idle)
    .sheet(item: Binding(get: { model.importer }, set: { if $0 == nil { model.endImport() } })) {
      importer in
      CredentialOTPImportView(model: importer, dismiss: model.endImport)
    }
    .onAppear { model.showAllCodes() }
    .onDisappear { model.hideCode() }
  }

  /// One record: name and settings as the header, the live code as the row, actions behind
  /// a menu and swipes.
  @ViewBuilder private func recordSection(_ record: CredentialOtpSummary) -> some View {
    Section {
      CredentialCodeRow(
        model: model, record: record, identifiers: .manager, showsLabel: false)
    } header: {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 2) {
          Text(record.label).font(.headline).foregroundStyle(.primary).textCase(nil)
          Text(meta(record)).font(.caption).foregroundStyle(.secondary).textCase(nil)
        }
        Spacer(minLength: 8)
        Menu {
          Button {
            model.beginEdit(record)
          } label: {
            Label(copy.text("Edit"), systemImage: "pencil")
          }
          .accessibilityIdentifier("editOTP_" + record.label)
          Button(role: .destructive) {
            model.requestDelete(record.label)
          } label: {
            Label(copy.text("Delete code"), systemImage: "trash")
          }
          .accessibilityIdentifier("deleteOTP_" + record.label)
        } label: {
          Image(systemName: "ellipsis.circle")
            .font(.body.weight(.medium))
            .frame(width: 44, height: 32)
            .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .disabled(!model.canInteract)
        .accessibilityLabel(copy.format("More actions: %@", record.label))
        .accessibilityIdentifier("otpActions_" + record.label)
      }
    } footer: {
      if record.otpType == "HOTP" {
        Text(
          copy.text(
            "Showing or copying keeps the same counter. Edit it when your service requires the next code."
          ))
      }
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      Button(role: .destructive) {
        model.requestDelete(record.label)
      } label: {
        Label(copy.text("Delete code"), systemImage: "trash")
      }
      Button {
        model.beginEdit(record)
      } label: {
        Label(copy.text("Edit"), systemImage: "pencil")
      }
      .tint(.orange)
    }
  }

  private var emptyState: some View {
    Section {
      VStack(alignment: .leading, spacing: 12) {
        Label(copy.text("No one-time codes"), systemImage: "number.square")
          .font(.headline)
        Text(
          copy.text(
            "Add the setup key provided by your service to generate verification codes.")
        )
        .foregroundStyle(.secondary)
      }
      .padding(.vertical, 4)
      Button(action: model.beginImport) {
        Label(copy.text("Scan or paste setup link"), systemImage: "qrcode.viewfinder")
      }
      .disabled(!model.canInteract).accessibilityIdentifier("emptyImportOTP")
      Button {
        model.beginEdit()
      } label: {
        Label(copy.text("Enter setup key"), systemImage: "keyboard")
      }
      .disabled(!model.canInteract).accessibilityIdentifier("emptyManualOTP")
    }
  }
  /// "TOTP · SHA1 · 6 digits · 30 s" or "HOTP · SHA1 · 6 digits".
  private func meta(_ record: CredentialOtpSummary) -> String {
    var parts = [
      record.otpType, record.algorithm, "\(record.digits) " + copy.text("digits"),
    ]
    if record.otpType != "HOTP" { parts.append("\(record.period) " + copy.text("s")) }
    return parts.joined(separator: " · ")
  }
  private func binding<Value>(
    _ key: WritableKeyPath<CredentialOTPModel.Draft, Value>, default fallback: Value
  ) -> Binding<Value> {
    Binding(
      get: { model.draft?[keyPath: key] ?? fallback },
      set: { value in model.changeDraft { $0[keyPath: key] = value } })
  }
  /// A mistake in the key in red; a warning in orange with how to keep the key anyway.
  private func keyFinding(_ finding: OTPSetupKey.Finding) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Label(
        copy.text(finding.message),
        systemImage: finding.isWarning ? "exclamationmark.triangle" : "xmark.octagon")
      if let hint = finding.hint { Text(copy.text(hint)).fontWeight(.medium) }
      if finding.isWarning && model.keyFinding == finding {
        Text(copy.text("Save again to keep this key.")).foregroundStyle(.secondary)
      }
    }
    .font(.footnote)
    .foregroundStyle(finding.isWarning ? Color.orange : Color.red)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier(finding.isWarning ? "otpKeyWarning" : "otpKeyIssue")
  }
  @ViewBuilder private var editor: some View {
    if let draft = model.draft, !draft.issuer.isEmpty || !draft.account.isEmpty {
      Section(copy.text("Review imported code")) {
        if !draft.issuer.isEmpty { LabeledContent(copy.text("Service"), value: draft.issuer) }
        if !draft.account.isEmpty { LabeledContent(copy.text("Account"), value: draft.account) }
      }
    }
    Section {
      TextField(copy.text("Code name"), text: binding(\.label, default: ""))
        .focused($focused, equals: .label).accessibilityIdentifier("otpName")
      CredentialSecretInput(
        text: binding(\.seed, default: ""),
        focusRequest: model.invalidField == .seed ? model.focusRevision : nil,
        revealed: false,
        label: copy.text(
          model.draft?.source == nil ? "Setup key" : "Replacement key (optional)"),
        identifier: "otpSeed", numeric: false)
      if let finding = model.keyFinding ?? model.typingKeyIssue {
        keyFinding(finding)
      }
      if model.draft?.source != nil {
        Text(copy.text("Leave the replacement key empty to keep the saved key.")).font(.footnote)
      }
    }.disabled(model.mutation != .idle)
    Section(copy.text("Code settings")) {
      Picker(copy.text("Type"), selection: binding(\.type, default: "TOTP")) {
        Text("TOTP").tag("TOTP")
        Text("HOTP").tag("HOTP")
      }
      Picker(copy.text("Algorithm"), selection: binding(\.algorithm, default: "SHA1")) {
        ForEach(["SHA1", "SHA256", "SHA512"], id: \.self) { Text($0).tag($0) }
      }
      Picker(copy.text("Key encoding"), selection: binding(\.encoding, default: "base32")) {
        ForEach(["base32", "base64", "base16", "utf-8"], id: \.self) { Text($0).tag($0) }
      }
      Picker(copy.text("Digits"), selection: binding(\.digits, default: 6)) {
        Text("6").tag(6)
        Text("8").tag(8)
      }
      if model.draft?.type == "HOTP" {
        LabeledContent(copy.text("Counter")) {
          TextField(copy.text("Counter"), text: binding(\.counter, default: "0"))
            .multilineTextAlignment(.trailing).keyboardType(.numberPad).focused(
              $focused, equals: .counter)
        }
      } else {
        LabeledContent(copy.text("Period (seconds)")) {
          TextField(copy.text("Period (seconds)"), text: binding(\.period, default: "30"))
            .multilineTextAlignment(.trailing).keyboardType(.numberPad).focused(
              $focused, equals: .period)
        }
      }
    }.disabled(model.mutation != .idle)
  }
}
