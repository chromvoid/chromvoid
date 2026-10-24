import SwiftUI

struct AttachmentFolderSetting: View {
  var files: FilesModel
  var preferences: FilePreferences
  let lock: () -> Void
  @AirLocalizedCopy private var copy

  var body: some View {
    Button(action: files.chooseAttachmentFolder) {
      LabeledContent(copy.text("Markdown attachments"), value: preferences.attachmentFolder)
    }
    .accessibilityIdentifier("attachmentFolderSetting")
    .sheet(
      item: .presence({ files.attachmentFolderPicker }, close: { files.dismissAttachmentFolder() })
    ) { picker in
      NavigationStack {
        AttachmentFolderView(
          model: picker, folder: picker.browser, dismiss: files.dismissAttachmentFolder, lock: lock)
      }
    }
  }
}

private struct AttachmentFolderView: View {
  var model: AttachmentFolderModel
  var folder: FilesModel
  let dismiss: () -> Void
  let lock: () -> Void
  @AirLocalizedCopy private var copy

  var body: some View {
    List {
      Section {
        Text(verbatim: folder.path)
        Text(copy.text("New Markdown images will be saved in the selected folder."))
          .foregroundStyle(.secondary)
        if let issue = model.issue { Text(copy.text(issue)).foregroundStyle(.red) }
      }
      if folder.state == .loading {
        ProgressView(copy.text("Loading files…"))
      } else if let issue = folder.issue {
        Text(copy.text(issue)).foregroundStyle(.secondary)
        Button(copy.text("Refresh")) { folder.reload() }
      } else {
        Section(copy.text("Folders")) {
          ForEach(model.folders(in: folder), id: \.nodeID) { item in
            Button {
              model.open(item, in: folder)
            } label: {
              HStack {
                Label(item.name, systemImage: "folder")
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.secondary)
              }
            }
          }
          if folder.canLoadMore {
            Button(copy.text("Load more"), action: folder.loadMore).disabled(folder.loadingMore)
          } else if model.folders(in: folder).isEmpty {
            Text(copy.text("No nested folders.")).foregroundStyle(.secondary)
          }
        }
      }
    }
    .airCanvas()
    .navigationTitle(copy.text("Markdown attachments"))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button(copy.text("Cancel"), action: dismiss)
      }
      ToolbarItem(placement: .confirmationAction) {
        Button(copy.text("Use this folder")) { model.select(folder) }
          .accessibilityIdentifier("selectAttachmentFolder")
      }
      ToolbarItemGroup(placement: .bottomBar) {
        Button(action: folder.createFolder) {
          Label(copy.text("New folder"), systemImage: "folder.badge.plus")
        }
        .disabled(folder.state != .ready || folder.saving)
        Spacer()
        Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
      }
    }
    .sheet(
      isPresented: .presented({ folder.edit != nil }, close: { folder.dismissEdit() })
    ) {
      FileNameEditor(model: folder)
    }
    .navigationDestination(
      isPresented: .presented({ folder.child != nil }, close: { folder.closeChild() })
    ) {
      if let child = folder.child {
        AttachmentFolderView(model: model, folder: child, dismiss: dismiss, lock: lock)
      }
    }
  }
}
