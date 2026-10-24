import SwiftUI
import UniformTypeIdentifiers

struct DocumentView: View {
  @AirLocalizedCopy private var copy
  var model: DocumentNavigator
  let dismiss: () -> Void
  let lock: () -> Void

  var body: some View {
    NavigationStack(path: Binding(get: { model.path }, set: { model.setPath($0) })) {
      DocumentPage(model: model.root, navigator: model, dismiss: dismiss, lock: lock, isRoot: true)
        .navigationDestination(for: UUID.self) { id in
          if let document = model.document(id: id) {
            DocumentPage(
              model: document, navigator: model, dismiss: model.pop, lock: lock, isRoot: false)
          }
        }
    }
    .sheet(
      item: .presence({ model.imagePreview }, close: { model.dismissImagePreview() })
    ) { preview in
      ImagePreviewView(model: preview, dismiss: model.dismissImagePreview)
    }
    .sheet(
      item: .presence({ model.mediaPreview }, close: { model.dismissMediaPreview() })
    ) { preview in
      MediaPreviewView(model: preview, dismiss: model.dismissMediaPreview, lock: lock)
    }
    .sheet(
      item: .presence({ model.pdfPreview }, close: { model.dismissPDFPreview() })
    ) { preview in
      PDFPreviewView(model: preview, dismiss: model.dismissPDFPreview, lock: lock)
    }
    .sheet(
      isPresented: .presented(
        { model.fileInformation != nil }, close: { model.dismissFileInformation() })
    ) {
      if let file = model.fileInformation {
        NavigationStack {
          Form {
            Text(verbatim: file.name)
            LabeledContent(copy.text("Location"), value: file.parentPath)
            LabeledContent(
              copy.text("Size"),
              value: copy.byteCount(Int64(file.size)))
            Text(copy.text("A native preview is not available for this file type."))
              .foregroundStyle(.secondary)
          }
          .airCanvas()
          .navigationTitle(copy.text("File information"))
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button(copy.text("Done"), action: model.dismissFileInformation)
            }
            ToolbarItem(placement: .confirmationAction) {
              Button(action: lock) { Image(systemName: "lock") }
                .accessibilityLabel(copy.text("Lock vault"))
            }
          }
        }
      }
    }
  }
}

private struct DocumentPage: View {
  @AirLocalizedCopy private var copy
  var model: DocumentModel
  var navigator: DocumentNavigator
  let dismiss: () -> Void
  let lock: () -> Void
  let isRoot: Bool
  @State private var showSavedVersion = false

  var body: some View {
    Group {
      VStack(alignment: .leading, spacing: 12) {
        if let issue = model.issue {
          Text(copy.text(issue)).foregroundStyle(.secondary)
            .accessibilityIdentifier("documentIssue")
        }
        if model.state == .failed {
          Button(copy.text("Try again")) { model.load() }
          Spacer()
        } else if model.state == .loading && model.name.isEmpty {
          ProgressView(copy.text("Loading document…"))
          Spacer()
        } else {
          if model.state == .conflict {
            Picker(copy.text("Document version"), selection: $showSavedVersion) {
              Text(copy.text("My draft")).tag(false)
              Text(copy.text("Saved version")).tag(true)
            }
            .pickerStyle(.segmented)
          } else {
            HStack {
              if model.isMarkdown {
                Picker(
                  copy.text("Document mode"),
                  selection: Binding(
                    get: { model.mode }, set: { model.setMode($0) })
                ) {
                  Text(copy.text("Preview")).tag(DocumentModel.Mode.preview)
                  Text(copy.text("Source")).tag(DocumentModel.Mode.source)
                }
                .pickerStyle(.segmented)
                .disabled(model.state != .editing || model.importingImage)
                .accessibilityIdentifier("documentMode")
              } else {
                Text(copy.text("Text source"))
              }
              Spacer()
              if model.saved {
                Label(copy.text("Saved"), systemImage: "checkmark")
                  .accessibilityIdentifier("documentSaved")
              } else if model.dirty {
                Text(copy.text("Unsaved changes"))
              }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
          }
          if let previewIssue = model.previewIssue {
            Text(copy.text(previewIssue)).foregroundStyle(.secondary)
              .accessibilityIdentifier("previewIssue")
          }
          if model.state == .conflict {
            ScrollView {
              Text(verbatim: showSavedVersion ? (model.conflict?.text ?? "") : model.text)
                .font(.body.monospaced())
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            // The preview stays up while the save runs: swapping to source and back would
            // lose the reading position for a tapped task box.
          } else if model.mode == .preview && [.editing, .saving].contains(model.state) {
            MarkdownPreviewView(model: model)
          } else {
            DocumentSourceEditor(model: model)
          }
          if model.state == .conflict {
            VStack(alignment: .leading, spacing: 12) {
              Button(copy.text("Use my draft")) { model.useMyDraft() }
                .buttonStyle(.borderedProminent)
              Button(copy.text("Use saved version"), action: model.useSavedVersion)
              Button(copy.text("Keep editing"), action: model.keepEditing)
            }
          } else if model.state == .uncertain {
            Button(copy.text("Compare with saved version")) { model.compareSavedVersion() }
          }
          if model.importingImage {
            ProgressView(value: model.imageProgress) { Text(copy.text("Importing images…")) }
            Button(copy.text("Cancel"), action: model.cancelImageImport)
          }
          if model.resolvingLink { ProgressView(copy.text("Opening link…")) }
          if model.busy && !model.importingImage { ProgressView(copy.text("Please wait…")) }
        }
      }
      .padding()
      .navigationTitle(model.name.isEmpty ? copy.text("Document") : model.name)
      .navigationBarTitleDisplayMode(.inline)
      .navigationBarBackButtonHidden(!isRoot)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text(isRoot ? "Done" : "Back")) { if model.requestClose() { dismiss() } }
            .disabled(model.busy)
            .accessibilityIdentifier("closeDocument")
        }
        ToolbarItemGroup(placement: .confirmationAction) {
          Button(action: lock) { Image(systemName: "lock") }
            .accessibilityLabel(copy.text("Lock vault"))
            .accessibilityIdentifier("lockDocument")
          // Insert image holds its place: the document's kind is only known once it loads,
          // and an item appearing then would push Save sideways.
          let insertable = model.isMarkdown && model.mode == .source
          Button(action: model.chooseImage) { Image(systemName: "photo.badge.plus") }
            .accessibilityLabel(copy.text("Insert image"))
            .accessibilityIdentifier("insertDocumentImage")
            .disabled(!insertable || !model.canImportImage)
            .animation(AirMotion.feedback, value: insertable)
          Button(copy.text("Save")) { model.save() }
            .disabled(model.state != .editing || model.busy || model.previewLoading)
            .accessibilityIdentifier("saveDocument")
        }
      }
      .alert(
        copy.text("Discard unsaved changes?"),
        isPresented: .presented({ model.confirmingClose }, close: { model.cancelClose() })
      ) {
        Button(copy.text("Discard changes"), role: .destructive, action: dismiss)
        Button(copy.text("Keep editing"), role: .cancel, action: model.cancelClose)
      }
    }
    .interactiveDismissDisabled(navigator.hasUnsavedChanges || model.busy)
    .fileImporter(
      isPresented: .presented(
        { model.imagePickerPresented }, close: { model.dismissImagePicker() }),
      allowedContentTypes: [.image], allowsMultipleSelection: true
    ) { model.receiveImage($0) }
    .task { await model.load()?.value }
  }
}
