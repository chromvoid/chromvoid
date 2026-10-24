import ChromVoidBridge
import SwiftUI

struct FilesView: View {
  @AirLocalizedCopy private var copy
  var model: FilesModel
  let lock: () -> Void

  var body: some View {
    browser
      .sheet(
        item: .presence({ model.importing }, close: { model.dismissImport() })
      ) { importing in
        FileImportView(model: importing, dismiss: model.dismissImport, lock: lock)
      }
      .sheet(
        item: .presence({ model.operation }, close: { model.dismissOperation() })
      ) { operation in
        FileOperationView(model: operation, dismiss: model.dismissOperation, lock: lock)
      }
      .sheet(
        item: .presence({ model.creatingNote }, close: { model.dismissNote() })
      ) { note in
        NoteCreationView(model: note, dismiss: model.dismissNote, lock: lock)
      }
      .accessibilityIdentifier("filesBrowser")
      .sheet(
        item: .presence({ model.exporting }, close: { model.dismissExport() })
      ) {
        exporting in
        FileExportView(model: exporting, dismiss: model.dismissExport, lock: lock)
      }
      .sheet(
        item: .presence({ model.document }, close: { model.dismissDocument() })
      ) {
        document in
        DocumentView(model: document, dismiss: model.dismissDocument, lock: lock)
      }
      .sheet(
        item: .presence({ model.imagePreview }, close: { model.dismissImagePreview() })
      ) { preview in
        ImageGalleryView(model: preview, dismiss: model.dismissImagePreview)
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
  }

  private var browser: some View {
    rows
      .overlay { if model.saving { ProgressView(copy.text("Saving…")) } }
      .navigationTitle(model.path == "/" ? copy.text("Files") : model.title)
      .searchable(
        text: Binding(get: { model.query }, set: { model.setQuery($0) }),
        placement: .navigationBarDrawer(displayMode: .always),
        prompt: copy.text(
          model.notesOnly ? "Search notes in this folder and subfolders" : "Search this folder")
      )
      .keepsToolbarDuringSearch()
      .refreshable { await model.reload()?.value }
      .toolbar(model.selecting ? .hidden : .automatic, for: .tabBar)
      .toolbar {
        ToolbarItem(id: "files-lock-\(model.id)", placement: .primaryAction) {
          Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
            .accessibilityIdentifier("lockVault")
        }
        ToolbarItem(id: "files-sort-\(model.id)", placement: .primaryAction) {
          Menu {
            Button(copy.text("Select"), action: model.beginSelection)
              .accessibilityIdentifier("selectFiles")
            Picker(
              copy.text("Sort by"),
              selection: Binding(get: { model.sort }, set: { model.setSort($0) })
            ) {
              ForEach(FilesModel.Sort.allCases, id: \.self) { value in
                Text(copy.text(value.rawValue)).tag(value)
              }
            }
            Toggle(
              copy.text("Descending"),
              isOn: Binding(get: { model.descending }, set: { model.setDescending($0) }))
            Toggle(
              copy.text("Show hidden files"),
              isOn: Binding(get: { model.includeHidden }, set: { model.setIncludeHidden($0) }))
          } label: {
            Label(copy.text("Sort and filter"), systemImage: "line.3.horizontal.decrease")
          }
          .accessibilityIdentifier("fileSortFilter")
        }
        ToolbarItem(id: "files-create-\(model.id)", placement: .primaryAction) {
          // toolbar-mode: selection is a mode the person turns on
          if model.selecting {
            Button(copy.text("Done"), action: model.endSelection)
              .accessibilityIdentifier("finishFileSelection")
          } else {
            Menu {
              Button(copy.text("New note"), action: model.createNote)
                .accessibilityIdentifier("newNote")
              Button(copy.text("Import files"), action: model.importFiles)
                .accessibilityIdentifier("importFiles")
              Button(copy.text("New folder"), action: model.createFolder)
                .accessibilityIdentifier("newFileFolder")
            } label: {
              Label(copy.text("Add"), systemImage: "plus")
            }
            .accessibilityIdentifier("addFile")
            .disabled(model.saving)
          }
        }
        // toolbar-mode: selection is a mode the person turns on
        if model.selecting {
          ToolbarItemGroup(placement: .bottomBar) {
            Button {
              model.operate(.move)
            } label: {
              Label(copy.text("Move"), systemImage: "folder")
            }
            .disabled(model.selected.isEmpty)
            .accessibilityIdentifier("moveSelectedFiles")
            Button {
              model.exportFiles()
            } label: {
              Label(copy.text("Export"), systemImage: "square.and.arrow.up")
            }
            .disabled(model.selected.isEmpty)
            .accessibilityIdentifier("exportSelectedFiles")
            Spacer()
            Text(verbatim: copy.format("Selected: %@", copy.count(model.selected.count)))
              .fixedSize()
              .accessibilityIdentifier("fileSelectionCount")
            Spacer()
            Button(role: .destructive) {
              model.operate(.delete)
            } label: {
              Label(copy.text("Delete"), systemImage: "trash")
            }
            .disabled(model.selected.isEmpty)
            .accessibilityIdentifier("deleteSelectedFiles")
          }
        }
      }
      .navigationDestination(
        isPresented: .presented({ model.child != nil }, close: { model.closeChild() })
      ) {
        if let child = model.child { FilesView(model: child, lock: lock) }
      }
      .sheet(
        isPresented: .presented({ model.edit != nil }, close: { model.dismissEdit() })
      ) {
        FileNameEditor(model: model)
      }
      .alert(
        copy.text("Delete this item?"),
        isPresented: .presented({ model.deleting != nil }, close: { model.dismissDelete() })
      ) {
        Button(copy.text("Delete"), role: .destructive, action: model.deleteConfirmed)
          .accessibilityIdentifier("confirmFileDelete")
        Button(copy.text("Cancel"), role: .cancel, action: model.dismissDelete)
      } message: {
        if let item = model.deleting {
          Text(
            verbatim: item.name + "\n\n"
              + copy.text(
                item.isDir
                  ? "The folder and all its contents will be permanently deleted."
                  : "This file will be permanently deleted."))
        }
      }
      .sheet(
        isPresented: .presented({ model.info != nil }, close: { model.dismissInfo() })
      ) {
        if let info = model.info {
          NavigationStack {
            Form {
              Section(copy.text("Name")) { Text(verbatim: info.name) }
              Section(copy.text("Location")) { Text(verbatim: model.path) }
              Section(copy.text("Size")) {
                Text(
                  verbatim: copy.byteCount(Int64(info.size)))
              }
              if let mime = info.mimeType {
                Section(copy.text("Type")) { Text(verbatim: mime) }
              }
            }
            .airCanvas()
            .navigationTitle(copy.text("File information"))
            .toolbar {
              ToolbarItem(placement: .confirmationAction) {
                Button(copy.text("Done"), action: model.dismissInfo)
              }
            }
          }
        }
      }
  }

  private var rows: some View {
    List {
      Section {
        Picker(
          copy.text("Show"),
          selection: Binding(get: { model.notesOnly }, set: { model.setNotesOnly($0) })
        ) {
          Text(copy.text("All files")).tag(false)
          Text(copy.text("Notes")).tag(true)
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("fileProjection")
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
      }
      if let issue = model.issue, model.edit == nil {
        Section {
          Text(copy.text(issue)).foregroundStyle(.secondary)
          Button(copy.text("Refresh")) { model.reload() }
        }
      }
      if model.state == .loading {
        ProgressView(copy.text("Loading files…"))
      } else if model.items.isEmpty && model.state == .ready {
        Section {
          Label(
            copy.text(
              model.query.isEmpty
                ? (model.notesOnly ? "No notes in this folder" : "This folder is empty")
                : "No matching files"),
            systemImage: model.query.isEmpty ? "folder" : "magnifyingglass"
          )
          .font(.headline)
          Text(
            copy.text(
              model.query.isEmpty
                ? (model.notesOnly
                  ? "Create a note or import a Markdown file."
                  : "Create a folder to organize your files.") : "Try another search.")
          )
          .foregroundStyle(.secondary)
          if model.query.isEmpty {
            if model.notesOnly {
              Button(copy.text("New note"), action: model.createNote)
            } else {
              Button(copy.text("New folder"), action: model.createFolder)
            }
          }
        }
      } else {
        Section {
          ForEach(model.items, id: \.nodeID) { item in
            Button {
              model.open(item)
            } label: {
              HStack(spacing: 12) {
                if model.selecting {
                  Image(
                    systemName: model.selected[item.nodeID] == nil
                      ? "circle" : "checkmark.circle.fill"
                  )
                  .foregroundStyle(.tint)
                }
                Image(systemName: item.isDir ? "folder" : "doc")
                  .font(.title2)
                  .foregroundStyle(.tint)
                  .frame(width: 32)
                VStack(alignment: .leading, spacing: 4) {
                  Text(verbatim: item.name).foregroundStyle(.primary)
                  if model.notesOnly, let parent = item.parentPath {
                    Text(verbatim: parent).font(.caption).foregroundStyle(.secondary)
                  }
                  if !item.isDir, let size = item.size {
                    Text(
                      verbatim: copy.byteCount(Int64(size))
                    )
                    .font(.caption).foregroundStyle(.secondary)
                  }
                }
                Spacer(minLength: 8)
                if !model.selecting {
                  Image(
                    systemName: item.isDir || DocumentModel.supports(item)
                      ? "chevron.right" : "info.circle"
                  )
                  .font(.caption).foregroundStyle(.secondary)
                }
              }
              .padding(.vertical, 4)
              .contentShape(Rectangle())
            }
            // Plain, so the name and size keep their label colours; only the symbols are tinted.
            .buttonStyle(.plain)
            .contextMenu {
              Button(copy.text("Rename")) { model.rename(item) }
              Button(copy.text("Move")) { model.operate(.move, item: item) }
              if !item.isDir {
                Button(copy.text("Export")) { model.exportFiles(item) }
                  .accessibilityIdentifier("exportFile")
                Button(copy.text("File information")) { model.showInfo(item) }
              }
              Button(copy.text("Delete"), role: .destructive) { model.requestDelete(item) }
            }
            .accessibilityValue(model.selected[item.nodeID] == nil ? "" : copy.text("Selected"))
            .accessibilityIdentifier("fileRow-\(item.name)")
          }
          if model.loadingMore {
            ProgressView()
          } else if model.canLoadMore {
            Button(copy.text("Load more"), action: model.loadMore)
          }
        } footer: {
          HStack {
            Text(copy.text("Items"))
            Spacer()
            Text(verbatim: String(model.total))
          }
        }
      }
    }
    .airCanvas()
  }
}
