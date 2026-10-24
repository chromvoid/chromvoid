import SwiftUI
import UniformTypeIdentifiers

/// Owns the system picker presentation; the selected directory belongs to the feature model.
struct MaintenanceDirectoryField: View {
  @AirLocalizedCopy private var copy
  let directory: URL?
  let title: String
  let select: (URL) -> Void
  @State private var picking = false
  @State private var failed = false

  var body: some View {
    Section {
      Button {
        failed = false
        picking = true
      } label: {
        Label(directory?.lastPathComponent ?? copy.text(title), systemImage: "folder")
          .lineLimit(2)
      }
      .accessibilityIdentifier("maintenanceDirectory")
      if failed {
        Text(copy.text("The folder could not be opened. Choose it again from Files."))
          .foregroundStyle(.red)
      }
    } header: {
      Text(copy.text(title))
    }
    .fileImporter(isPresented: $picking, allowedContentTypes: [.folder]) { result in
      do { select(try result.get()) } catch {
        failed = (error as NSError).code != NSUserCancelledError
      }
    }
  }
}
