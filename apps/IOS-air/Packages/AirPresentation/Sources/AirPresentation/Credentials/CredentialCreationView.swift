import SwiftUI

struct CredentialCreationView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialCreationModel
  let dismiss: () -> Void
  @FocusState private var focus: CredentialCreationModel.Field?

  var body: some View {
    NavigationStack {
      ScrollViewReader { scroll in
        Form {
          if let issue = model.issue {
            Section {
              Label(copy.text(issue), systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red).accessibilityIdentifier("credentialSaveIssue")
            }
            .id("credentialIssue")
          }

          Section {
            Picker(
              copy.text("Credential type"),
              selection: Binding(
                get: { model.kind }, set: { model.selectKind($0) })
            ) {
              Text(copy.text("Login")).tag(CredentialCreationModel.Kind.login)
              Text(copy.text("Payment card")).tag(CredentialCreationModel.Kind.paymentCard)
            }
            // A card needs no name: an empty one shows the name Core will give it.
            field(
              .title, label: "Name",
              placeholder: model.kind == .paymentCard
                ? (model.cardTitleHint ?? copy.text("Optional")) : nil)
          }
          if model.kind == .login {
            Section(copy.text("Login details")) {
              field(.username, label: "Username")
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
              field(.password, label: "Password", secure: true)
              Button {
                focus = nil
                model.beginGenerator()
              } label: {
                Label(copy.text("Generate password"), systemImage: "dice")
              }.accessibilityIdentifier("openPasswordGenerator")
              Button {
                focus = nil
                model.beginWebsites()
              } label: {
                HStack {
                  Label(copy.text("Websites"), systemImage: "globe")
                  Spacer()
                  Text(String(model.websites.count)).foregroundStyle(.secondary)
                }
              }.accessibilityIdentifier("openWebsites")
            }
          } else {
            // The card is the form: every card value is typed on its face, in the clear.
            Section {
              PaymentCardEditor(
                brand: model.cardBrand, number: binding(.cardNumber), holder: binding(.cardholder),
                month: binding(.month), year: binding(.year), code: binding(.cardCode),
                focus: $focus,
                fields: .init(
                  number: .cardNumber, holder: .cardholder, month: .month, year: .year,
                  code: .cardCode),
                identifier: { "credential_" + $0.rawValue },
                numberFocusRequest: model.focus == .cardNumber ? model.focusRevision : nil,
                onNumberFocus: model.numberFocusChanged,
                inputRevision: model.cardInputRevision
              )
              .frame(maxWidth: .infinity)
              .listRowBackground(Color.clear)
              .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
              .id(CredentialCreationModel.Field.cardNumber)
              cardErrors
            } footer: {
              if let brand = model.cardBrand {
                Text(brand.name).accessibilityIdentifier("cardBrandHint")
              }
            }
            .listSectionSeparator(.hidden)
          }
          Section(copy.text("More details")) {
            field(.note, label: "Private note", multiline: true)
            Button(action: model.beginTags) {
              HStack {
                Label(copy.text("Tags"), systemImage: "tag")
                Spacer()
                Text(model.tagLabels.isEmpty ? copy.text("Choose tags") : model.tagLabels)
                  .foregroundStyle(Color.secondary).multilineTextAlignment(.trailing)
              }
            }.accessibilityIdentifier("chooseEntryTags")
            field(.group, label: "Group path (optional)")
              .textInputAutocapitalization(.never).autocorrectionDisabled()
            Button(copy.text("Choose group")) {
              focus = nil
              model.beginGroups()
            }.accessibilityIdentifier("chooseEntryGroup")
            Text(
              copy.text(
                "Leave the group empty to save at the vault root. Use a path such as /Personal; missing groups are created with the credential."
              )
            )
            .font(.footnote).foregroundStyle(.secondary)
          }
        }
        .airCanvas()
        .accessibilityIdentifier("credentialCreationForm")
        .onChange(of: model.issue) { _, issue in
          if issue != nil { scroll.scrollTo("credentialIssue", anchor: .top) }
        }
        .disabled(model.state != .editing)
        .privacySensitive()
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(copy.text("New credential"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(copy.text(model.state == .uncertain ? "Close" : "Cancel")) {
              if model.isDirty { model.requestDismiss() } else { dismiss() }
            }
            .disabled(model.state == .saving)
            .accessibilityIdentifier("cancelCredentialCreation")
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
            }
            .disabled(model.state != .editing)
            .accessibilityIdentifier("saveCredential")
          }
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
    .sheet(item: .presence({ model.generator }, close: { model.endGenerator() })) {
      generator in PasswordGeneratorView(model: generator, dismiss: model.endGenerator)
    }
    .sheet(
      item: .presence({ model.websiteEditor }, close: { model.endWebsites() })
    ) {
      editor in WebsiteEditorView(model: editor, dismiss: model.endWebsites)
    }
    .interactiveDismissDisabled(model.isDirty || model.state == .saving)
  }

  /// Validation of the card fields, under the card, since the fields carry no room for it.
  private var cardErrors: some View {
    let labels: [(CredentialCreationModel.Field, String)] = [
      (.cardholder, "Cardholder name"), (.cardNumber, "Card number"),
      (.cardCode, "Security code"), (.month, "Expiry month"), (.year, "Expiry year"),
    ]
    return PaymentCardNotes(
      errors: labels.compactMap { field, label in
        model.errors[field].map { (label: label, message: $0) }
      },
      warning: model.numberWarning)
  }

  @ViewBuilder
  private func field(
    _ field: CredentialCreationModel.Field, label: String, secure: Bool = false,
    multiline: Bool = false, placeholder: String? = nil
  ) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(copy.text(label)).font(.caption).foregroundStyle(.secondary)
      HStack(alignment: .firstTextBaseline) {
        if secure {
          CredentialSecretInput(
            text: binding(field),
            focusRequest: model.focus == field ? model.focusRevision : nil,
            revealed: model.revealed.contains(field), label: copy.text(label),
            identifier: "credential_" + field.rawValue, numeric: field != .password
          )
          .airInput(tall: true)
        } else {
          TextField(
            placeholder ?? copy.text(label), text: binding(field),
            axis: multiline ? .vertical : .horizontal
          )
          .accessibilityLabel(copy.text(label))
          .lineLimit(multiline ? 3...8 : 1...1)
          // The keyboard must not learn from a private note.
          .autocorrectionDisabled(field == .note)
          .focused($focus, equals: field)
          .accessibilityIdentifier("credential_" + field.rawValue)
          .airInput(focused: focus == field)
        }
        if secure {
          Button {
            model.toggleVisibility(field)
          } label: {
            Image(systemName: model.revealed.contains(field) ? "eye.slash" : "eye")
              .frame(minWidth: 44, minHeight: 44)
          }
          .buttonStyle(.borderless)
          .accessibilityLabel(
            copy.text(model.revealed.contains(field) ? "Hide value" : "Show value")
          )
          .accessibilityIdentifier("reveal_" + field.rawValue)
        }
      }
      if let error = model.errors[field] {
        Text(copy.text(error)).foregroundStyle(.red).font(.footnote)
      }
    }
    .id(field)
  }

  private func binding(_ field: CredentialCreationModel.Field) -> Binding<String> {
    Binding(get: { model.value(field) }, set: { model.change(field, to: $0) })
  }
}
