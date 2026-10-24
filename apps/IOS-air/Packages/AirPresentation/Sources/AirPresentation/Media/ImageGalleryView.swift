import SwiftUI

struct ImageGalleryView: View {
  @AirLocalizedCopy private var copy
  var model: ImageGalleryModel
  let dismiss: () -> Void
  @State private var infoPresented = false

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        GalleryPager(
          items: model.items,
          selection: Binding(get: { model.selectedID }, set: { model.select($0) })
        ) { item in
          Group {
            if let preview = model.previews[item.id] {
              ImagePreviewContent(model: preview, active: item.id == model.selectedID)
            } else {
              ProgressView(copy.text("Loading image…"))
            }
          }
        }
        if let issue = model.issue {
          Text(copy.text(issue)).font(.callout).padding()
        }
        HStack {
          Button(action: model.previous) { Image(systemName: "chevron.left") }
            .accessibilityLabel(copy.text("Previous image"))
            .accessibilityIdentifier("previousImage")
            .disabled(!model.canGoBack)
          Spacer()
          if model.loadingMore {
            ProgressView()
          } else if let index = model.currentIndex {
            Text("\(index + 1) / \(model.items.count)\(model.hasMore ? "+" : "")").monospacedDigit()
          }
          Spacer()
          Button {
            model.next()
          } label: {
            Image(systemName: "chevron.right")
          }
          .accessibilityLabel(copy.text("Next image"))
          .accessibilityIdentifier("nextImage")
          .disabled(!model.canGoForward)
        }
        .buttonStyle(.bordered).controlSize(.large).padding()
      }
      .navigationTitle(model.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Done"), action: dismiss)
            .accessibilityIdentifier("closeImagePreview")
        }
        ToolbarItem(placement: .primaryAction) {
          ImageInfoToolbar(preview: model.previews[model.selectedID], infoPresented: $infoPresented)
        }
      }
    }
    .task(id: model.selectedID) { await model.prefetchNext()?.value }
    .onDisappear { model.revoke() }
  }
}
