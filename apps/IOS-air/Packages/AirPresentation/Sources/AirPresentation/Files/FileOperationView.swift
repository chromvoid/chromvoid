import SwiftUI

struct FileOperationView: View {
  @AirLocalizedCopy private var copy
  var model: FileOperationModel
  let dismiss: () -> Void
  let lock: () -> Void

  var body: some View {
    NavigationStack {
      Group {
        if let browser = model.browser {
          FileDestinationView(model: model, folder: browser, dismiss: dismiss, lock: lock)
        } else {
          List {
            Section {
              if model.state == .reviewing {
                Text(
                  copy.text(
                    "Selected items and all folder contents will be permanently deleted."))
                Button(copy.text("Delete"), role: .destructive) { model.start() }
                  .accessibilityIdentifier("confirmSelectedDelete")
              } else {
                if model.state == .finished {
                  Text(copy.text("Operation finished"))
                    .accessibilityIdentifier("fileOperationFinished")
                } else {
                  ProgressView(copy.text(model.state == .stopping ? "Stopping…" : "Saving…"))
                }
                HStack {
                  Text(copy.text(model.kind == .move ? "Moved" : "Deleted"))
                  Spacer()
                  Text(verbatim: "\(model.completedCount) / \(model.items.count)")
                    .accessibilityIdentifier("fileOperationCount")
                }
                if !model.destination.isEmpty { Text(verbatim: model.destination) }
                Text(copy.text("Completed changes are kept if you stop."))
                  .foregroundStyle(.secondary)
              }
            }
            Section(copy.text("Items")) {
              ForEach(model.items) { item in
                VStack(alignment: .leading, spacing: 6) {
                  Label(item.source.name, systemImage: item.source.isDir ? "folder" : "doc")
                  if model.state != .reviewing {
                    switch item.outcome {
                    case .pending:
                      Text(copy.text(model.busy ? "Waiting" : "Not attempted"))
                        .foregroundStyle(.secondary)
                    case .running: ProgressView()
                    case .completed:
                      Label(
                        copy.text(model.kind == .move ? "Moved" : "Deleted"),
                        systemImage: "checkmark.circle")
                    case .failed(let message): Text(copy.text(message)).foregroundStyle(.red)
                    case .uncertain:
                      Text(
                        copy.text(
                          "The result is unconfirmed. Check the folders before trying again.")
                      )
                      .foregroundStyle(.secondary)
                    }
                  }
                }
                .padding(.vertical, 4)
              }
            }
          }
          .airCanvas()
          .navigationTitle(copy.text(model.title))
          .navigationBarTitleDisplayMode(.inline)
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              // toolbar-mode: Stop stands where Done does while the operation runs
              if model.busy {
                Button(copy.text("Stop"), action: model.stop).disabled(model.state == .stopping)
              } else {
                Button(copy.text(model.state == .reviewing ? "Cancel" : "Done"), action: dismiss)
                  .accessibilityIdentifier("closeFileOperation")
              }
            }
            ToolbarItem(placement: .primaryAction) {
              Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
            }
          }
        }
      }
    }
    .interactiveDismissDisabled(model.busy)
  }
}

private struct FileDestinationView: View {
  @AirLocalizedCopy private var copy
  var model: FileOperationModel
  var folder: FilesModel
  let dismiss: () -> Void
  let lock: () -> Void

  var body: some View {
    List {
      Section {
        HStack {
          Text(copy.text("Selected"))
          Spacer()
          Text(verbatim: String(model.items.count))
        }
        Text(verbatim: folder.path)
        Text(copy.text("Choose a destination. Existing items will not be replaced."))
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
              model.openFolder(item, in: folder)
            } label: {
              HStack {
                Label(item.name, systemImage: "folder")
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.secondary)
              }
            }
            .accessibilityIdentifier("moveFolder-\(item.name)")
          }
          if folder.canLoadMore {
            Button(copy.text("Load more"), action: folder.loadMore).disabled(folder.loadingMore)
          } else if model.folders(in: folder).isEmpty {
            Text(copy.text("No nested folders."))
              .foregroundStyle(.secondary)
          }
        }
      }
    }
    .airCanvas()
    .navigationTitle(folder.path == "/" ? copy.text("Move items") : folder.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button(copy.text("Cancel"), action: dismiss)
          .accessibilityIdentifier("closeFileOperation")
      }
      ToolbarItem(placement: .confirmationAction) {
        Button(copy.text("Move here")) { model.start(in: folder) }
          .accessibilityIdentifier("moveFilesHere")
      }
      ToolbarItem(placement: .bottomBar) {
        Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
      }
    }
    .navigationDestination(
      isPresented: Binding(get: { folder.child != nil }, set: { if !$0 { folder.closeChild() } })
    ) {
      if let child = folder.child {
        FileDestinationView(model: model, folder: child, dismiss: dismiss, lock: lock)
      }
    }
  }
}
