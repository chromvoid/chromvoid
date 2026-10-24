import SwiftUI

struct CredentialEditorView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialEditorModel
  let dismiss: () -> Void
  @FocusState private var focus: CredentialEditorModel.Field?
  private typealias Field = CredentialEditorModel.Field
  var body: some View {
    NavigationStack {
      ScrollViewReader { scroll in
        Form {
          if let issue = model.issue {
            Section {
              Label(copy.text(issue), systemImage: "exclamationmark.triangle").foregroundStyle(.red)
            }
            .id("editIssue").accessibilityIdentifier("credentialEditIssue")
          }
          Group {
            // A card needs no name: an empty one goes back to the name Core gives it.
            Section {
              field(
                .title, "Name",
                placeholder: model.isCard ? (model.cardTitleHint ?? copy.text("Optional")) : nil)
            }
            if model.isCard {
              // The card is the form: number, holder, expiry and code are typed on its face.
              Section {
                PaymentCardEditor(
                  brand: cardBrand, last4: model.card?.last4,
                  number: model.secretFields.contains(.cardNumber) ? binding(.cardNumber) : nil,
                  holder: binding(.cardholder), month: binding(.month), year: binding(.year),
                  code: model.secretFields.contains(.cardCode) ? binding(.cardCode) : nil,
                  focus: $focus,
                  fields: .init(
                    number: .cardNumber, holder: .cardholder, month: .month, year: .year,
                    code: .cardCode),
                  identifier: { "edit_" + $0.rawValue },
                  numberFocusRequest: model.focus == .cardNumber ? model.focusRevision : nil,
                  onNumberFocus: model.numberFocusChanged,
                  inputRevision: model.cardInputRevision
                )
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
                .id(CredentialEditorModel.Field.cardholder)
                PaymentCardNotes(
                  errors: [
                    (Field.cardholder, "Cardholder name"), (.cardNumber, "Card number"),
                    (.cardCode, "Security code"), (.month, "Expiry month"), (.year, "Expiry year"),
                  ]
                  .compactMap { field, label in
                    model.errors[field].map { (label: label, message: $0) }
                  },
                  warning: model.numberWarning)
              }
              .listSectionSeparator(.hidden)
            } else {
              Section(copy.text("Login details")) {
                field(.username, "Username")
                if model.secretFields.contains(.password) {
                  password
                  Button {
                    focus = nil
                    model.beginGenerator()
                  } label: {
                    Label(copy.text("Generate password"), systemImage: "dice")
                  }.accessibilityIdentifier("openPasswordGenerator")
                }
              }
              loginExtras
            }
            if model.secretFields.contains(.note) {
              Section(copy.text("Private note")) {
                TextField(copy.text("Private note"), text: binding(.note), axis: .vertical)
                  .lineLimit(3...8)
                  // The keyboard must not learn from a private note.
                  .autocorrectionDisabled()
                  .focused($focus, equals: .note)
                  .accessibilityIdentifier("edit_note")
                  .airInput(focused: focus == .note)
              }
            }
            Section {
              Button(action: model.beginTags) {
                HStack {
                  Label(copy.text("Tags"), systemImage: "tag")
                  Spacer()
                  Text(model.tagLabels.isEmpty ? copy.text("Choose tags") : model.tagLabels)
                    .foregroundStyle(Color.secondary).multilineTextAlignment(.trailing)
                }
              }.accessibilityIdentifier("chooseEntryTags")
              field(.group, "Group path (optional)")
              Button(copy.text("Choose group"), action: model.beginGroups)
                .accessibilityIdentifier("chooseEntryGroup")
              Text(
                copy.text(
                  "Leave the group empty to save at the vault root. Use a path such as /Personal; missing groups are created with the credential."
                )
              )
              .font(.footnote).foregroundStyle(.secondary)
            }
          }
          .disabled(model.state != .editing)
        }
        .airCanvas()
        .accessibilityIdentifier("credentialEditorForm")
        .privacySensitive().scrollDismissesKeyboard(.interactively)
        .navigationTitle(copy.text("Edit credential"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(copy.text(model.needsReload ? "Close" : "Cancel")) {
              if model.isDirty { model.requestDismiss() } else { dismiss() }
            }.disabled(model.state == .saving).accessibilityIdentifier("cancelCredentialEdit")
          }
          ToolbarItem(placement: .confirmationAction) {
            // The spinner sits over the label instead of replacing it: a toolbar item that
            // changes width makes the whole toolbar blink as it relays out.
            Button(action: model.save) {
              Text(copy.text("Save"))
                .opacity(model.state == .saving ? 0 : 1)
                .overlay {
                  if model.state == .saving {
                    ProgressView().accessibilityLabel(copy.text("Saving credential…"))
                  }
                }
            }.disabled(model.state != .editing).accessibilityIdentifier("saveCredentialEdit")
          }
        }
        .onChange(of: model.issue) { _, issue in
          if issue != nil { scroll.scrollTo("editIssue", anchor: .top) }
        }
        .onChange(of: model.focusRevision) {
          focus = model.focus
          if let field = model.focus { scroll.scrollTo(field, anchor: .center) }
        }
        .alert(
          copy.text("Discard this draft?"),
          isPresented: .presented({ model.confirmingDiscard }, close: { model.cancelDiscard() })
        ) {
          Button(copy.text("Discard draft"), role: .destructive, action: dismiss)
          Button(copy.text("Keep editing"), role: .cancel, action: model.cancelDiscard)
        } message: {
          Text(copy.text("Unsaved fields will be cleared from this form."))
        }
      }
    }
    .sheet(item: .presence({ model.groupBrowser }, close: { model.endGroups() })) { groups in
      GroupPickerView(model: groups, dismiss: model.endGroups)
    }
    .sheet(item: .presence({ model.tagBrowser }, close: { model.endTags() })) {
      tags in CredentialTagsView(model: tags, dismiss: model.endTags)
    }
    .sheet(item: .presence({ model.websiteEditor }, close: { model.endWebsites() })) {
      editor in WebsiteEditorView(model: editor, dismiss: model.endWebsites)
    }
    .sheet(item: .presence({ model.otpManager }, close: { model.endOTP() })) {
      manager in CredentialOTPView(model: manager, dismiss: model.endOTP)
    }
    .sheet(item: .presence({ model.generator }, close: { model.endGenerator() })) {
      generator in PasswordGeneratorView(model: generator, dismiss: model.endGenerator)
    }
    .interactiveDismissDisabled(model.isDirty || model.state == .saving)
  }
  /// Websites and one-time codes of a login. Each opens its own editor, which saves when it is
  /// done; the footer says so, since Cancel here does not take those back.
  private var loginExtras: some View {
    Section {
      ForEach(Array(model.websites.enumerated()), id: \.offset) { _, website in
        Text(website).lineLimit(1).truncationMode(.middle).foregroundStyle(.secondary)
      }
      Button {
        focus = nil
        model.beginWebsites()
      } label: {
        Label(
          copy.text(model.websites.isEmpty ? "Add website" : "Edit websites"),
          systemImage: model.websites.isEmpty ? "plus.circle" : "globe")
      }
      .disabled(model.refreshing).accessibilityIdentifier("openWebsites")
      Button {
        focus = nil
        model.beginOTP()
      } label: {
        Label(copy.text("One-time codes"), systemImage: "number.square")
      }
      .disabled(model.refreshing).accessibilityIdentifier("openOTP")
    } header: {
      Text(copy.text("Websites and codes"))
    } footer: {
      Text(copy.text("Websites and codes are saved as soon as you finish them."))
    }
  }
  /// The network follows the number as it is retyped; the stored one until then.
  private var cardBrand: PaymentCardBrand? { PaymentCardBrand(network: model.cardFormat.network) }
  /// The password stays dots until the eye, as it does on the page and in the creation form.
  private var password: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(copy.text("Password")).font(.caption).foregroundStyle(.secondary)
      HStack(alignment: .firstTextBaseline) {
        CredentialSecretInput(
          text: binding(.password), focusRequest: nil, revealed: model.revealed,
          label: copy.text("Password"), identifier: "edit_password", numeric: false
        )
        .airInput(tall: true)
        Button(action: model.toggleVisibility) {
          Image(systemName: model.revealed ? "eye.slash" : "eye")
            .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(copy.text(model.revealed ? "Hide value" : "Show value"))
        .accessibilityIdentifier("reveal_password")
      }
    }
    .id(Field.password)
  }
  private func binding(_ field: CredentialEditorModel.Field) -> Binding<String> {
    Binding(get: { model.value(field) }, set: { model.change(field, to: $0) })
  }
  private func field(
    _ field: CredentialEditorModel.Field, _ label: String, placeholder: String? = nil
  ) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(copy.text(label)).font(.caption).foregroundStyle(.secondary)
      TextField(placeholder ?? copy.text(label), text: binding(field))
        .accessibilityLabel(copy.text(label))
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .focused($focus, equals: field).accessibilityIdentifier("edit_" + field.rawValue)
        .airInput(focused: focus == field)
      if let error = model.errors[field] {
        Text(copy.text(error)).font(.footnote).foregroundStyle(.red)
      }
    }.id(field)
  }
}
