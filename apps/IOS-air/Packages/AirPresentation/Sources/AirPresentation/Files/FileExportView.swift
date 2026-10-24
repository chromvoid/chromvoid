import SwiftUI
import UIKit

struct FileExportView: View {
  @AirLocalizedCopy private var copy
  var model: FileExportModel
  let dismiss: () -> Void
  let lock: () -> Void

  var body: some View {
    NavigationStack {
      List {
        if model.state != .finished {
          Section {
            Text(copy.text("Export creates a copy outside your vault."))
              .font(.headline)
            Text(
              copy.text(
                "The chosen app or location can keep this copy after you lock the vault.")
            )
            .foregroundStyle(.secondary)
          }
        }
        Section {
          ForEach(model.items) { item in
            VStack(alignment: .leading, spacing: 4) {
              Text(verbatim: item.name)
              Text(copy.text(item.outcome.rawValue)).font(.caption).foregroundStyle(.secondary)
              if let issue = item.issue {
                Text(copy.text(issue)).font(.caption).foregroundStyle(.secondary)
              }
              if item.outcome == .preparing {
                ProgressView(value: Double(item.received), total: Double(max(item.total, 1)))
              }
            }
          }
        }
        if let issue = model.issue { Text(copy.text(issue)).foregroundStyle(.secondary) }
        Section {
          switch model.state {
          case .review:
            Button(copy.text("Choose destination")) { model.prepare() }
              .disabled(!model.canPrepare)
              .accessibilityIdentifier("prepareFileExport")
          case .preparing:
            ProgressView(copy.text("Preparing…"))
          case .finishing:
            ProgressView(copy.text("Finishing…"))
          case .ready:
            if model.preparedCount > 0 {
              Button(copy.text("Share prepared files"), action: model.share)
                .accessibilityIdentifier("sharePreparedFiles")
            } else {
              Text(copy.text("No files were prepared. Close this sheet and try again."))
            }
          case .finished:
            Text(copy.text("Export finished"))
              .accessibilityIdentifier("fileExportFinished")
          case .sharing:
            EmptyView()
          case .revoked:
            Text(copy.text("Vault locked"))
          }
        }
      }
      .airCanvas()
      .navigationTitle(copy.text("Export files"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text(model.state == .finished ? "Done" : "Cancel"), action: dismiss)
            .accessibilityIdentifier("closeFileExport")
        }
        ToolbarItem(placement: .primaryAction) {
          Button(action: lock) { Label(copy.text("Lock vault"), systemImage: "lock") }
        }
      }
      .background {
        FileActivityPresenter(request: model.shareRequest) { attempt, completed, failed in
          model.finishSharing(attempt: attempt, completed: completed, failed: failed)
        }
        .allowsHitTesting(false)
      }
    }
  }
}

/// UIKit owns the activity's entire presentation and dismissal. Wrapping the activity
/// itself in another SwiftUI sheet can dismiss the export review on a fast completion.
private struct FileActivityPresenter: UIViewControllerRepresentable {
  let request: FileExportModel.ShareRequest?
  let completion: @MainActor (UUID, Bool, Bool) -> Void

  func makeUIViewController(context: Context) -> FileActivityController {
    FileActivityController()
  }

  func updateUIViewController(_ controller: FileActivityController, context: Context) {
    controller.update(request: request, completion: completion)
  }

  static func dismantleUIViewController(_ controller: FileActivityController, coordinator: ()) {
    controller.cancel()
  }
}

private final class FileActivityController: UIViewController {
  private var request: FileExportModel.ShareRequest?
  private var activity: UIActivityViewController?
  private var completion: (@MainActor (UUID, Bool, Bool) -> Void)?

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    presentActivity()
  }

  func update(
    request: FileExportModel.ShareRequest?,
    completion: @escaping @MainActor (UUID, Bool, Bool) -> Void
  ) {
    self.request = request
    self.completion = completion
    if request == nil { cancel() } else { presentActivity() }
  }

  func cancel() {
    request = nil
    activity?.completionWithItemsHandler = nil
    if let activity, activity.presentingViewController != nil { activity.dismiss(animated: false) }
    activity = nil
  }

  private func presentActivity() {
    guard let request, activity == nil, viewIfLoaded?.window != nil else { return }
    let controller = UIActivityViewController(
      activityItems: request.urls, applicationActivities: nil)
    activity = controller
    controller.completionWithItemsHandler = { [weak self] _, completed, _, error in
      let failed = error != nil
      Task { @MainActor [weak self] in
        guard let self, self.request?.id == request.id else { return }
        self.activity = nil
        self.request = nil
        self.completion?(request.id, completed, failed)
      }
    }
    if traitCollection.userInterfaceIdiom != .pad {
      controller.modalPresentationStyle = .pageSheet
    } else if let popover = controller.popoverPresentationController {
      popover.sourceView = view
      popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
      popover.permittedArrowDirections = []
    }
    present(controller, animated: true)
  }
}
