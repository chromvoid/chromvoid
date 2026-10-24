import SwiftUI

struct FileNameEditor: View {
  var model: FilesModel
  @AirLocalizedCopy private var copy
  @FocusState private var nameFocused: Bool

  var body: some View {
    NavigationStack {
      Form {
        TextField(
          copy.text("Name"), text: Binding(get: { model.name }, set: { model.setName($0) })
        )
        .focused($nameFocused)
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .accessibilityIdentifier("fileItemName")
        if let issue = model.issue { Text(copy.text(issue)).foregroundStyle(.red) }
      }
      .airCanvas()
      .navigationTitle(copy.text(model.editTitle))
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Cancel"), action: model.dismissEdit).disabled(model.saving)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(copy.text("Save"), action: model.saveName).disabled(model.saving)
            .accessibilityIdentifier("saveFileName")
        }
      }
      .onAppear { nameFocused = true }
      .onChange(of: model.validationRevision) { nameFocused = true }
    }
    .interactiveDismissDisabled(model.saving)
  }
}
