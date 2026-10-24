import SwiftUI
import UniformTypeIdentifiers

struct FileImportView: View {
  @AirLocalizedCopy private var copy
  var model: FileImportModel
  let dismiss: () -> Void
  let lock: () -> Void

  var body: some View {
    NavigationStack {
      List {
        if model.state == .choosing {
          Section {
            Text(copy.text("Add documents, photos or videos to this folder."))
            Text(
              copy.text(
                "Photos are stored as they were taken. Existing files are kept, and imported files remain saved if you stop."
              )
            )
            .foregroundStyle(.secondary)
            if let issue = model.issue { Text(copy.text(issue)).foregroundStyle(.red) }
            sources
          }
        }
        Section(copy.text("Location")) { Text(verbatim: model.destination) }
        if !model.items.isEmpty {
          Section {
            if model.state == .finished {
              Label(copy.text("Import finished"), systemImage: "list.bullet")
                .accessibilityIdentifier("fileImportFinished")
            } else if model.state == .stopping {
              ProgressView(copy.text("Stopping import…"))
            }
            HStack {
              Text(copy.text("Imported"))
              Spacer()
              Text(verbatim: "\(model.importedCount) / \(model.items.count)")
                .accessibilityIdentifier("fileImportCount")
            }
            if model.state == .finished { sources }
          }
        }
        if !model.items.isEmpty {
          Section {
            ForEach(model.items) { item in
              VStack(alignment: .leading, spacing: 6) {
                Text(verbatim: item.name)
                switch item.outcome {
                case .pending:
                  Text(copy.text(model.busy ? "Waiting" : "Not imported"))
                    .foregroundStyle(.secondary)
                case .transferring:
                  if item.total > 0 {
                    ProgressView(value: Double(item.received), total: Double(item.total))
                  } else {
                    ProgressView()
                  }
                  Text(copy.text("Importing…")).foregroundStyle(.secondary)
                case .imported:
                  Label(copy.text("Imported"), systemImage: "checkmark.circle")
                case .failed(let message):
                  Text(copy.text(message)).foregroundStyle(.red)
                case .interrupted:
                  Text(copy.text("Stopped. Check the folder before importing this file again."))
                    .foregroundStyle(.secondary)
                }
              }
              .padding(.vertical, 4)
            }
          }
        }
      }
      .airCanvas()
      .navigationTitle(copy.text("Import files"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          // toolbar-mode: Stop stands where Done does while files are being imported
          if model.busy {
            Button(copy.text("Stop"), action: model.stop).disabled(model.state == .stopping)
          } else {
            Button(copy.text("Done"), action: dismiss)
              .accessibilityIdentifier("closeFileImport")
          }
        }
        ToolbarItem(placement: .primaryAction) {
          Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
        }
      }
      .fileImporter(
        isPresented: .presented({ model.pickerPresented }, close: { model.dismissPicker() }),
        allowedContentTypes: [.item], allowsMultipleSelection: true
      ) { model.receiveFiles($0) }
      .sheet(
        isPresented: .presented({ model.picker == .photos }, close: { model.dismissPicker() })
      ) {
        PhotoLibraryPicker { model.receivePhotoResults($0) }.ignoresSafeArea()
      }
      .fullScreenCover(
        isPresented: .presented({ model.picker == .camera }, close: { model.dismissPicker() })
      ) {
        CameraCapture { model.receiveCapture($0) }.ignoresSafeArea()
      }
    }
    .interactiveDismissDisabled(model.busy)
  }

  @ViewBuilder private var sources: some View {
    Button {
      model.chooseFiles()
    } label: {
      Label(copy.text("Choose files"), systemImage: "folder")
    }
    .accessibilityIdentifier("chooseImportFiles")
    Button {
      model.choosePhotos()
    } label: {
      Label(copy.text("Photo Library"), systemImage: "photo.on.rectangle")
    }
    .accessibilityIdentifier("chooseImportPhotos")
    if CameraCapture.available {
      Button {
        model.chooseCamera()
      } label: {
        Label(copy.text("Take Photo"), systemImage: "camera")
      }
      .accessibilityIdentifier("chooseImportCamera")
    }
  }
}
