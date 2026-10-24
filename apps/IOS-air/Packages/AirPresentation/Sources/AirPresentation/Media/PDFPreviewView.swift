import Observation
import PDFKit
import SwiftUI

struct PDFPreviewView: View {
  @AirLocalizedCopy private var copy
  @Bindable var model: PDFPreviewModel
  let dismiss: () -> Void
  let lock: () -> Void
  @Environment(\.openURL) private var openURL
  @State private var findRequest = 0
  @FocusState private var passwordFocused: Bool

  var body: some View {
    NavigationStack {
      Group {
        if model.document != nil {
          NativePDFView(model: model, findRequest: findRequest) { url in openURL(url) }
            .accessibilityIdentifier("pdfPreview")
            .safeAreaInset(edge: .bottom) { pageControls }
        } else if model.state == .passwordRequired {
          Form {
            Text(copy.text("Enter the password for this PDF."))
            SecureField(copy.text("Password"), text: $model.password)
              .focused($passwordFocused)
              .onSubmit { model.load() }
              .accessibilityIdentifier("pdfPassword")
            if let issue = model.issue { Text(copy.text(issue)).foregroundStyle(.red) }
            Button(copy.text("Open PDF")) { model.load() }
              .accessibilityIdentifier("unlockPDF")
          }
          .airCanvas()
        } else if let issue = model.issue {
          VStack(spacing: 16) {
            Image(systemName: "doc.questionmark").font(.largeTitle).foregroundStyle(.secondary)
            Text(copy.text(issue)).multilineTextAlignment(.center)
            Button(copy.text("Try again")) { model.load() }
          }.padding()
        } else {
          ProgressView(copy.text("Loading PDF…"))
        }
      }
      .navigationTitle(model.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Done"), action: dismiss).accessibilityIdentifier("closePDFPreview")
        }
        ToolbarItemGroup(placement: .primaryAction) {
          // Find holds its place while the document loads; added afterwards, it would push
          // the lock sideways as it appeared.
          Button {
            findRequest += 1
          } label: {
            Image(systemName: "magnifyingglass")
          }
          .disabled(model.state != .ready)
          .animation(AirMotion.feedback, value: model.state == .ready)
          .accessibilityLabel(copy.text("Find in PDF"))
          Button(action: lock) { Image(systemName: "lock") }
            .accessibilityLabel(copy.text("Lock vault"))
            .accessibilityIdentifier("lockPDFPreview")
        }
      }
      .alert(
        copy.text("PDF link"),
        isPresented: Binding(
          get: { model.state == .ready && model.issue != nil },
          set: { if !$0 { model.clearIssue() } })
      ) {
        Button(copy.text("OK"), role: .cancel) { model.clearIssue() }
      } message: {
        Text(copy.text(model.issue ?? ""))
      }
    }
    .privacySensitive()
    .task { await model.load()?.value }
    .onChange(of: model.state) { _, state in passwordFocused = state == .passwordRequired }
    .onDisappear { model.revoke() }
  }

  private var pageControls: some View {
    HStack {
      Button {
        model.goToPage(model.pageIndex - 1)
      } label: {
        Image(systemName: "chevron.left")
      }
      .disabled(model.pageIndex == 0)
      .accessibilityLabel(copy.text("Previous page"))
      if model.pageCount > 1 {
        Slider(
          value: Binding(
            get: { Double(model.pageIndex) }, set: { model.goToPage(Int($0)) }),
          in: 0...Double(model.pageCount - 1), step: 1
        ).accessibilityLabel(copy.text("Page"))
      }
      Text(verbatim: "\(model.pageIndex + 1) / \(model.pageCount)")
        .monospacedDigit().accessibilityIdentifier("pdfPageCount")
      Button {
        model.goToPage(model.pageIndex + 1)
      } label: {
        Image(systemName: "chevron.right")
      }
      .disabled(model.pageIndex + 1 >= model.pageCount)
      .accessibilityLabel(copy.text("Next page"))
    }.padding().background(.bar)
  }
}

struct NativePDFView: UIViewRepresentable {
  var model: PDFPreviewModel
  let findRequest: Int
  let openURL: (URL) -> Void

  func makeCoordinator() -> Coordinator { Coordinator(model: model, openURL: openURL) }

  func makeUIView(context: Context) -> PDFView {
    let view = PDFView()
    view.displayMode = .singlePageContinuous
    view.displayDirection = .vertical
    view.autoScales = true
    view.isFindInteractionEnabled = true
    view.delegate = context.coordinator
    context.coordinator.observe(view)
    return view
  }

  func updateUIView(_ view: PDFView, context: Context) {
    if view.document !== model.document { view.document = model.document }
    if let document = model.document, let page = document.page(at: model.pageIndex),
      view.currentPage !== page
    {
      view.go(to: page)
    }
    if context.coordinator.findRequest != findRequest {
      context.coordinator.findRequest = findRequest
      view.findInteraction.presentFindNavigator(showingReplace: false)
    }
  }

  static func dismantleUIView(_ view: PDFView, coordinator: Coordinator) {
    view.findInteraction.dismissFindNavigator()
    view.document?.cancelFindString()
    view.clearSelection()
    view.document = nil
    view.delegate = nil
    NotificationCenter.default.removeObserver(coordinator)
  }

  @MainActor
  final class Coordinator: NSObject, PDFViewDelegate {
    let model: PDFPreviewModel
    let openURL: (URL) -> Void
    var findRequest = 0
    private weak var view: PDFView?

    init(model: PDFPreviewModel, openURL: @escaping (URL) -> Void) {
      self.model = model
      self.openURL = openURL
    }

    func observe(_ view: PDFView) {
      self.view = view
      NotificationCenter.default.addObserver(
        self, selector: #selector(pageChanged(_:)), name: .PDFViewPageChanged, object: view)
      // Mirrors the former `$state` subscription: the current value is checked once, then the
      // model calls back synchronously when it is revoked.
      if !clearIfRevoked() {
        model.onRevoke = { [weak self] in _ = self?.clearIfRevoked() }
      }
    }

    /// Empties the PDFKit view once the model is revoked; true when that has happened.
    private func clearIfRevoked() -> Bool {
      guard model.state == .revoked else { return false }
      if let view {
        view.findInteraction.dismissFindNavigator()
        view.clearSelection()
        view.document = nil
      }
      return true
    }

    @objc private func pageChanged(_ notification: Notification) {
      guard let view = notification.object as? PDFView,
        let page = view.currentPage, let document = model.document, view.document === document
      else { return }
      model.goToPage(document.index(for: page))
    }

    nonisolated func pdfViewWillClick(onLink sender: PDFView, with url: URL) {
      Task { @MainActor [weak self] in
        guard let self, let allowed = self.model.externalLink(url) else { return }
        self.openURL(allowed)
      }
    }

    nonisolated func pdfViewOpenPDF(_ sender: PDFView, forRemoteGoTo action: PDFActionRemoteGoTo) {
      Task { @MainActor [weak self] in self?.model.unsupportedLink() }
    }
  }
}
