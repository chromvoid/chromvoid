import SwiftUI

struct ImagePreviewView: View {
  @AirLocalizedCopy private var copy
  var model: ImagePreviewModel
  let dismiss: () -> Void
  @State private var infoPresented = false

  var body: some View {
    NavigationStack {
      ImagePreviewContent(model: model)
        .navigationTitle(model.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(copy.text("Done"), action: dismiss)
              .accessibilityIdentifier("closeImagePreview")
          }
          ToolbarItem(placement: .primaryAction) {
            ImageInfoToolbar(preview: model, infoPresented: $infoPresented)
          }
        }
    }
    .onDisappear { model.revoke() }
  }
}

/// Info opens the image record. Viewing needs no vault controls; locking lives on the
/// screens that own the session.
struct ImageInfoToolbar: View {
  @AirLocalizedCopy private var copy
  let preview: ImagePreviewModel?
  @Binding var infoPresented: Bool

  var body: some View {
    Button {
      infoPresented = true
    } label: {
      Image(systemName: "info.circle")
    }
    .accessibilityLabel(copy.text("Image information"))
    .accessibilityIdentifier("imageInfo")
    .disabled(preview == nil)
    .sheet(isPresented: $infoPresented) {
      if let preview { ImageInfoView(model: preview) { infoPresented = false } }
    }
  }
}

struct ImagePreviewContent: View {
  @AirLocalizedCopy private var copy
  var model: ImagePreviewModel
  /// A gallery page that is only pre-built beside the visible one does not start its own read.
  var active = true

  var body: some View {
    VStack(spacing: 12) {
      if let image = model.image {
        ZoomableImageView(image: image, identity: model.id, name: model.name)
        ImageAnimationControls(model: model)
      } else if model.state == .loading {
        loading
      } else if let issue = model.issue {
        Image(systemName: "photo").font(.largeTitle).foregroundStyle(.secondary)
        Text(copy.text(issue)).multilineTextAlignment(.center)
        Button(copy.text("Try again")) { model.load() }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding()
    // A short fade only: a spring here fights the gallery pager's own page animation.
    .animation(.easeOut(duration: 0.2), value: model.state)
    .task(id: active) {
      if active { await model.load()?.value }
    }
    .onDisappear { model.pause() }
  }

  /// The camera's own thumbnail stands in, softened, until the full read lands; other files keep
  /// the plain progress state.
  @ViewBuilder private var loading: some View {
    if let placeholder = model.placeholder {
      Image(decorative: placeholder, scale: 1)
        .resizable()
        .scaledToFit()
        .blur(radius: 14)
        .clipped()
        .overlay { ProgressView() }
        .transition(.opacity)
        .accessibilityLabel(copy.text("Loading image…"))
    } else {
      ProgressView(copy.text("Loading image…"))
    }
  }
}
