import SwiftUI

struct NoteCreationView: View {
  @AirLocalizedCopy private var copy
  var model: NoteCreationModel
  let dismiss: () -> Void
  let lock: () -> Void
  @FocusState private var nameFocused: Bool

  var body: some View {
    NavigationStack {
      Form {
        Section(copy.text("Name")) {
          TextField(
            copy.text("Note name"),
            text: Binding(get: { model.name }, set: { model.setName($0) })
          )
          .focused($nameFocused)
          .autocorrectionDisabled()
          .accessibilityIdentifier("noteName")
          if let issue = model.issue { Text(copy.text(issue)).foregroundStyle(.red) }
          Text(copy.text("Saved as a Markdown file in this folder."))
            .foregroundStyle(.secondary)
          Text(verbatim: model.parent).foregroundStyle(.secondary)
        }
        Section(copy.text("Text")) {
          TextEditor(text: Binding(get: { model.text }, set: { model.setText($0) }))
            .frame(minHeight: 220)
            .accessibilityLabel(copy.text("Note text"))
            .accessibilityIdentifier("noteText")
        }
        if model.busy { ProgressView(copy.text("Saving…")) }
      }
      .airCanvas()
      .disabled(model.state != .editing)
      .navigationTitle(copy.text("New note"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text(model.state == .uncertain ? "Close" : "Cancel")) {
            if model.isDirty && model.state == .editing {
              model.requestDismiss()
            } else {
              dismiss()
            }
          }
          .disabled(model.busy)
          .accessibilityIdentifier("cancelNote")
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(copy.text("Save")) { model.save() }
            .disabled(model.state != .editing)
            .accessibilityIdentifier("saveNote")
        }
        ToolbarItem(placement: .bottomBar) {
          Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
        }
      }
      .onAppear { nameFocused = true }
      .onChange(of: model.validationRevision) { nameFocused = true }
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
    .interactiveDismissDisabled(model.busy || model.isDirty)
  }
}
