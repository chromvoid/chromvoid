import SwiftUI

struct StorageRestoreView: View {
  @AirLocalizedCopy private var copy
  var model: StorageRestoreModel
  let dismiss: () -> Void
  @FocusState private var passwordFocused: Bool

  var body: some View {
    NavigationStack {
      Form {
        switch model.state {
        case .editing:
          Section {
            Text(
              copy.text(
                "Choose a backup folder and enter the administrative password used to create it. The backup is checked before restoration starts."
              )
            )
            .foregroundStyle(.secondary)
            Text(
              copy.text(
                "Restore requires empty storage. Older backups may also require the original device’s administrator data."
              )
            )
            .foregroundStyle(.secondary)
          }
          MaintenanceDirectoryField(
            directory: model.directory, title: "Backup folder", select: model.selectDirectory)
          Section(copy.text("Backup administrative password")) {
            SecureField(
              copy.text("Administrative password"),
              text: Binding(
                get: { model.password }, set: { model.changePassword($0) })
            )
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .privacySensitive().focused($passwordFocused)
            .submitLabel(.go).onSubmit { model.submit() }
            .accessibilityIdentifier("restorePassword")
          }
          Section {
            Button(copy.text("Check backup")) { model.submit() }
              .accessibilityIdentifier("reviewStorageRestore")
          }
        case .review:
          if let preview = model.preview {
            Section(copy.text("Ready to restore")) {
              LabeledContent(
                copy.text("Encrypted data"),
                value: copy.byteCount(Int64(clamping: preview.byteCount)))
              Text(
                copy.text(
                  "Restore this backup into empty storage. Afterward, open your vault with its original vault password."
                )
              )
              .foregroundStyle(.secondary)
            }
            Section {
              Button(copy.text("Restore this backup")) { model.confirmRestore() }
                .accessibilityIdentifier("confirmStorageRestore")
              Button(copy.text("Choose another backup")) { model.cancel() }
            }
          }
        case .reviewing, .cancelling, .committing:
          Section {
            if model.state == .reviewing, let progress = model.progress,
              progress.completedBytes < progress.totalBytes
            {
              ProgressView(
                value: Double(progress.completedBytes), total: Double(max(progress.totalBytes, 1)))
            } else {
              ProgressView()
            }
            Text(copy.text(progressMessage))
            if model.state == .reviewing {
              Button(copy.text("Cancel"), role: .cancel) { model.cancel() }
            }
          }
        case .completed:
          Section {
            Label(copy.text("Storage restored"), systemImage: "checkmark.circle")
              .font(.headline)
            Text(copy.text("Open your vault with its original vault password."))
              .foregroundStyle(.secondary)
          }
        case .uncertain:
          Section {
            Label(
              copy.text("Check the restoration result"), systemImage: "exclamationmark.circle"
            )
            .font(.headline)
            Text(
              copy.text(
                "The result could not be confirmed. Close this screen and check the storage before attempting another restore."
              )
            )
            .foregroundStyle(.secondary)
          }
        case .revoked: EmptyView()
        }
        if let issue = model.issue {
          Section { Text(copy.text(message(issue))).foregroundStyle(.red) }
        }
      }
      .airCanvas()
      .navigationTitle(copy.text("Restore backup"))
      .navigationBarTitleDisplayMode(.inline)
      .scrollDismissesKeyboard(.interactively)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Done"), action: dismiss).disabled(working)
        }
      }
      .interactiveDismissDisabled(working || model.state == .review)
      .onChange(of: model.issue) { focusPassword(for: model.issue) }
      .onChange(of: model.state) { releasePassword(for: model.state) }
    }
  }

  private func focusPassword(for issue: StorageRestoreModel.Issue?) {
    passwordFocused = issue == .passwordRequired || issue == .invalidBackup
  }

  private func releasePassword(for state: StorageRestoreModel.State) {
    if state != .editing { passwordFocused = false }
  }
  private var working: Bool {
    model.state == .reviewing || model.state == .cancelling || model.state == .committing
  }
  private var progressMessage: String {
    switch model.state {
    case .committing: "Restoring storage…"
    case .cancelling: "Cancelling and cleaning up…"
    default: "Reading and checking backup…"
    }
  }
  private func message(_ issue: StorageRestoreModel.Issue) -> String {
    switch issue {
    case .directoryRequired: "Choose a backup folder."
    case .passwordRequired: "Enter the backup’s administrative password."
    case .invalidBackup:
      "The backup or password could not be verified. Check the folder and password."
    case .targetNotEmpty:
      "This storage already contains data. Restore requires an empty destination."
    case .failed: "The backup could not be checked. Choose the folder again and try again."
    case .cleanupFailed:
      "Backup cleanup could not finish. Close this screen and check the storage before continuing."
    }
  }
}
