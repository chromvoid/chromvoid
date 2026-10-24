import SwiftUI

struct StorageBackupView: View {
  @AirLocalizedCopy private var copy
  var model: StorageBackupModel
  let dismiss: () -> Void
  @FocusState private var passwordFocused: Bool

  var body: some View {
    NavigationStack {
      Form {
        if model.state == .completed {
          Section {
            Label(copy.text("Backup saved"), systemImage: "checkmark.circle")
              .font(.headline)
            if let directory = model.savedDirectory {
              Text(directory.lastPathComponent).textSelection(.enabled)
            }
            Text(
              copy.text(
                "Keep this folder together. You’ll need your administrative password to restore it."
              )
            )
            .foregroundStyle(.secondary)
          }
        } else {
          Section {
            Text(
              copy.text(
                "Save an encrypted copy of this device’s storage to a folder you choose.")
            )
            .foregroundStyle(.secondary)
          }
          MaintenanceDirectoryField(
            directory: model.directory, title: "Backup destination", select: model.selectDirectory
          )
          .disabled(model.state != .editing)
          if model.state == .editing {
            Section(copy.text("Administrative password")) {
              SecureField(
                copy.text("Administrative password"),
                text: Binding(
                  get: { model.password }, set: { model.changePassword($0) })
              )
              .textInputAutocapitalization(.never).autocorrectionDisabled()
              .privacySensitive().focused($passwordFocused)
              .submitLabel(.go).onSubmit { model.submit() }
              .accessibilityIdentifier("backupPassword")
            }
          }
          if model.state == .working || model.state == .cancelling {
            Section {
              if let progress = model.progress {
                ProgressView(
                  value: Double(progress.completedBytes), total: Double(max(progress.totalBytes, 1))
                )
                Text(
                  copy.byteCount(Int64(clamping: progress.completedBytes))
                )
                .foregroundStyle(.secondary)
              } else {
                ProgressView()
              }
              Text(
                copy.text(
                  model.state == .cancelling ? "Cancelling and cleaning up…" : "Saving backup…"))
              if model.state == .working {
                Button(copy.text("Cancel"), role: .cancel, action: model.cancel)
              }
            }
          }
        }
        if let issue = model.issue {
          Section {
            Text(copy.text(message(issue))).foregroundStyle(.red)
            if case .cleanupFailed(let folder) = issue { Text(folder).textSelection(.enabled) }
          }
        }
        if model.state == .editing {
          Section {
            Button(copy.text("Save backup")) { model.submit() }
              .accessibilityIdentifier("saveStorageBackup")
          }
        }
      }
      .airCanvas()
      .navigationTitle(copy.text("Back up storage"))
      .navigationBarTitleDisplayMode(.inline)
      .scrollDismissesKeyboard(.interactively)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Done"), action: dismiss).disabled(working)
        }
      }
      .interactiveDismissDisabled(working)
      .onChange(of: model.issue) { focusPassword(for: model.issue) }
      .onChange(of: model.state) { releasePassword(for: model.state) }
    }
  }

  private func focusPassword(for issue: StorageBackupModel.Issue?) {
    passwordFocused = issue == .passwordRequired || issue == .reauthentication
  }

  private func releasePassword(for state: StorageBackupModel.State) {
    if state != .editing { passwordFocused = false }
  }

  private var working: Bool { model.state == .working || model.state == .cancelling }
  private func message(_ issue: StorageBackupModel.Issue) -> String {
    switch issue {
    case .directoryRequired: "Choose a destination folder."
    case .passwordRequired: "Enter the administrative password."
    case .reauthentication: "The administrative password could not be verified. Try again."
    case .failed:
      "The backup could not be saved. Check the destination and available space, then try again."
    case .cleanupFailed:
      "An unfinished backup folder could not be removed. Check the destination before trying again."
    }
  }
}
