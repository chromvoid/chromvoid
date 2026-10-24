import ChromVoidBridge
import SwiftUI

struct CredentialTagsView: View {
  @AirLocalizedCopy private var copy
  var model: CredentialTagsModel
  let dismiss: () -> Void
  @FocusState private var nameFocused: Bool

  var body: some View {
    NavigationStack {
      Form {
        if let issue = model.issue {
          Section {
            Label(copy.text(issue), systemImage: "exclamationmark.triangle").foregroundStyle(.red)
          }
          .accessibilityIdentifier("tagIssue")
        }
        if model.mutation == .saving {
          Section { ProgressView(copy.text("Saving tag…")) }
        } else if model.mutation == .uncertain || model.state == .failed {
          Section {
            Text(copy.text("Tags could not be loaded. Try again.")).foregroundStyle(.secondary)
            Button(copy.text("Reload tags")) { model.reload() }.accessibilityIdentifier(
              "reloadTags")
          }
        } else if model.state == .loading {
          Section { ProgressView(copy.text("Loading tags…")) }
        } else if model.edit != nil {
          Section(copy.text("Tag details")) {
            TextField(
              copy.text("Tag name"),
              text: Binding(get: { model.name }, set: { model.changeName($0) })
            )
            .focused($nameFocused).accessibilityIdentifier("tagName")
            Picker(
              copy.text("Color"),
              selection: Binding(get: { model.color }, set: { model.changeColor($0) })
            ) {
              ForEach(CredentialTagsModel.Color.allCases, id: \.self) { color in
                Label(copy.text(color.label), systemImage: "circle.fill")
                  .foregroundStyle(tagColor(color.rawValue)).tag(color)
              }
            }.pickerStyle(.menu).accessibilityIdentifier("tagColor")
            Button(copy.text("Save")) { model.save() }.accessibilityIdentifier("saveTag")
          }
        } else if model.state == .ready {
          if model.tags.isEmpty {
            Section {
              Label(copy.text("No tags yet"), systemImage: "tag").font(.headline)
              Text(copy.text("Create tags to organize your credentials.")).foregroundStyle(
                .secondary)
            }.accessibilityIdentifier("emptyTags")
          } else {
            Section {
              ForEach(model.tags, id: \.key) { tag in
                HStack {
                  Button {
                    model.choose(tag)
                  } label: {
                    HStack {
                      Image(systemName: "tag.fill").foregroundStyle(tagColor(tag.colorID))
                      Text(tag.label).foregroundStyle(.primary)
                      Spacer()
                      if model.isAssignment {
                        if model.selection.contains(where: { $0.key == tag.key }) {
                          Image(systemName: "checkmark")
                        }
                      } else {
                        Text(String(tag.count)).foregroundStyle(Color.secondary)
                      }
                    }.frame(minHeight: 44).contentShape(Rectangle())
                  }.buttonStyle(.borderless).accessibilityIdentifier("chooseTag_" + tag.key)
                  if !model.isAssignment {
                    Menu {
                      Button(copy.text("Edit tag")) { model.beginEdit(tag) }
                      Button(copy.text("Delete tag"), role: .destructive) {
                        model.requestDelete(tag)
                      }
                    } label: {
                      Image(systemName: "ellipsis").frame(minWidth: 44, minHeight: 44)
                    }.buttonStyle(.borderless).accessibilityLabel(copy.text("Tag actions"))
                      .accessibilityIdentifier("tagActions_" + tag.key)
                  }
                }
              }
              if model.loadingMore {
                ProgressView()
              } else if model.canLoadMore {
                Button(copy.text("Load more"), action: model.loadMore)
              }
            } footer: {
              Text(
                copy.text(
                  model.isAssignment
                    ? "Choose tags, then tap Done to apply to this draft."
                    : "Choose a tag to filter credentials."))
            }
          }
        }
      }
      .airCanvas()
      .accessibilityIdentifier("credentialTagsForm").privacySensitive()
      .scrollDismissesKeyboard(.interactively)
      .navigationTitle(copy.text("Tags")).navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text(model.edit == nil && !model.isAssignment ? "Done" : "Cancel")) {
            if model.edit != nil && model.mutation == .idle {
              model.cancelEdit()
            } else {
              dismiss()
            }
          }.disabled(model.mutation == .saving).accessibilityIdentifier("closeTags")
        }
        // Both hold their place while the tags load; appearing afterwards, they would push
        // the title sideways.
        // toolbar-mode: fixed for the screen: assigning tags to an entry, not managing them
        if model.isAssignment {
          ToolbarItem(placement: .confirmationAction) {
            Button(copy.text("Done"), action: model.applySelection)
              .disabled(!model.canChoose)
              .animation(AirMotion.feedback, value: model.canChoose)
              .accessibilityIdentifier("applyTags")
          }
        }
        ToolbarItem(placement: .primaryAction) {
          Button {
            model.beginEdit()
          } label: {
            Label(copy.text("New tag"), systemImage: "plus")
          }
          .disabled(!model.canChoose)
          .animation(AirMotion.feedback, value: model.canChoose)
          .accessibilityIdentifier("addTag")
        }
      }
      .onChange(of: model.focusRevision) { nameFocused = model.edit != nil }
      .alert(
        copy.text("Delete this tag?"),
        isPresented: Binding(
          get: { model.confirmingDelete },
          set: { if !$0 { model.cancelDelete() } })
      ) {
        Button(copy.text("Delete tag"), role: .destructive) { model.confirmDelete() }
          .accessibilityIdentifier("confirmDeleteTag")
        Button(copy.text("Cancel"), role: .cancel, action: model.cancelDelete)
      } message: {
        Text(
          copy.text(
            "The tag will be removed from all credentials. Credentials and secrets will be kept."))
      }
    }.interactiveDismissDisabled(model.mutation == .saving)
  }
  private func tagColor(_ id: String) -> Color {
    switch CredentialTagsModel.Color(rawValue: id) {
    case .violet: .purple
    case .green: .green
    case .blue: .blue
    case .pink: .pink
    case .amber: .yellow
    case .orange: .orange
    case .cyan: .cyan
    case nil: .secondary
    }
  }
}
