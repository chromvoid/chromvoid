import SwiftUI

struct FileSettingsSection: View {
  var preferences: FilePreferences
  let files: FilesModel?
  let lock: () -> Void
  @AirLocalizedCopy private var copy

  var body: some View {
    Section(copy.text("Files")) {
      Toggle(
        copy.text("Show hidden files"),
        isOn: Binding(get: { preferences.showHidden }, set: { preferences.setShowHidden($0) })
      )
      .accessibilityIdentifier("defaultHiddenFilesSetting")
      Toggle(
        copy.text("Confirm before deleting files"),
        isOn: Binding(
          get: { preferences.confirmDeletion }, set: { preferences.setConfirmDeletion($0) })
      )
      .accessibilityIdentifier("confirmFileDeletionSetting")
      if let files {
        AttachmentFolderSetting(files: files, preferences: preferences, lock: lock)
      }

    }
  }
}
