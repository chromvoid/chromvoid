import SwiftUI

struct WebsiteEditorView: View {
  @AirLocalizedCopy private var copy
  var model: WebsiteEditorModel
  let dismiss: () -> Void
  @FocusState private var focus: UUID?

  var body: some View {
    NavigationStack {
      ScrollViewReader { scroll in
        Form {
          if let issue = model.issue {
            Section { Text(copy.text(issue)).foregroundStyle(.red) }.id("websiteIssue")
              .accessibilityIdentifier("websiteIssue")
          }
          if model.state == .loading {
            ProgressView(copy.text("Loading website rules…"))
          } else if model.state == .failed {
            Button(copy.text("Try again")) { model.load() }
          } else {
            Section {
              ForEach(Array(model.rows.enumerated()), id: \.element.id) { index, row in
                VStack(alignment: .leading, spacing: 8) {
                  TextField(
                    copy.text("Website or pattern"),
                    text: Binding(
                      get: { row.value }, set: { model.change(row.id, value: $0) }), axis: .vertical
                  )
                  .textInputAutocapitalization(.never).autocorrectionDisabled()
                  .keyboardType(row.mode == "regex" ? .default : .URL)
                  .focused($focus, equals: row.id)
                  .accessibilityIdentifier("websiteValue_\(index)")
                  Picker(
                    copy.text("Match"),
                    selection: Binding(
                      get: { row.mode }, set: { model.change(row.id, mode: $0) })
                  ) {
                    ForEach(WebsiteEditorModel.modes, id: \.self) { mode in
                      Text(copy.text(WebsiteEditorModel.modeLabel(mode))).tag(mode)
                    }
                    if !WebsiteEditorModel.modes.contains(row.mode) {
                      Text(copy.format("Imported matching mode: %@", row.mode)).tag(row.mode)
                    }
                  }.accessibilityIdentifier("websiteMode_\(index)")
                  if let error = model.errors[row.id] {
                    Text(copy.text(error)).font(.footnote).foregroundStyle(.red)
                      .accessibilityIdentifier("websiteError_\(index)")
                  }
                  Button(copy.text("Remove website"), role: .destructive) {
                    model.remove(row.id)
                  }
                  .buttonStyle(.borderless).accessibilityIdentifier("removeWebsite_\(index)")
                }.id(row.id)
              }
              .onMove { model.move(from: $0, to: $1) }
              Button {
                model.add()
              } label: {
                Label(copy.text("Add website"), systemImage: "plus")
              }.accessibilityIdentifier("addWebsite")
            } footer: {
              Text(copy.text("Choose where this login is suggested. Blank rows are ignored."))
            }
            .disabled(model.state != .editing)
          }
        }
        .airCanvas()
        .accessibilityIdentifier("websiteEditorForm")
        .privacySensitive().scrollDismissesKeyboard(.interactively)
        .navigationTitle(copy.text("Websites"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(copy.text(model.state == .needsReload ? "Close" : "Cancel")) {
              if model.isDirty && model.state != .needsReload {
                model.requestDismiss()
              } else {
                dismiss()
              }
            }.disabled(model.state == .saving).accessibilityIdentifier("cancelWebsites")
          }
          ToolbarItem(placement: .confirmationAction) {
            Button {
              focus = nil
              model.save()
            } label: {
              if model.state == .saving {
                ProgressView()
              } else {
                Text(copy.text(model.entryID == nil ? "Apply" : "Save"))
              }
            }.disabled(model.state != .editing).accessibilityIdentifier("saveWebsites")
          }
          ToolbarItem(placement: .bottomBar) {
            EditButton().disabled(model.state != .editing || model.rows.count < 2)
              .accessibilityIdentifier("reorderWebsites")
          }
        }
        .onChange(of: model.focusRevision) {
          focus = model.focus
          if let id = model.focus { scroll.scrollTo(id, anchor: .center) }
        }
        .onChange(of: model.issue) { _, issue in
          if issue != nil { scroll.scrollTo("websiteIssue", anchor: .top) }
        }
        .alert(
          copy.text("Discard this draft?"),
          isPresented: Binding(
            get: { model.confirmingDiscard }, set: { if !$0 { model.cancelDiscard() } })
        ) {
          Button(copy.text("Discard draft"), role: .destructive, action: dismiss)
          Button(copy.text("Keep editing"), role: .cancel, action: model.cancelDiscard)
        } message: {
          Text(copy.text("Unsaved fields will be cleared from this form."))
        }
      }
    }
    .task { await model.load()?.value }
    .interactiveDismissDisabled(model.isDirty || model.state == .saving)
  }
}
