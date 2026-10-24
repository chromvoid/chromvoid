import ChromVoidBridge
import SwiftUI

struct MarkdownInlineView: View {
  @AirLocalizedCopy private var copy
  var model: DocumentModel
  let document: MarkdownDocument
  let ids: [Int]

  var body: some View {
    LazyVStack(alignment: .leading, spacing: 8) {
      ForEach(MarkdownText.segments(document, ids, locale: copy.locale)) { segment in
        if let text = segment.text {
          Text(text).frame(maxWidth: .infinity, alignment: .leading)
        } else if let id = segment.imageID {
          MarkdownImageView(
            model: model, document: document, nodeID: id, activationID: segment.activationID)
        }
      }
    }
  }
}

private struct MarkdownImageView: View {
  @AirLocalizedCopy private var copy
  var model: DocumentModel
  let document: MarkdownDocument
  let nodeID: Int
  let activationID: Int?
  @Environment(\.openURL) private var openURL

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let image = model.inlineImages[nodeID] {
        MarkdownImageContent(model: image, label: label, open: open)
      } else {
        ProgressView(copy.text("Loading image…"))
          .frame(maxWidth: .infinity, minHeight: 120)
      }
    }
    .task(id: model.previewLoading) {
      await model.loadInlineImage(nodeID: nodeID, sourceDigest: document.sourceDigest)?.value
    }
    .onDisappear {
      model.releaseInlineImage(nodeID: nodeID, sourceDigest: document.sourceDigest)
    }
    .accessibilityIdentifier("markdownImage-\(nodeID)")
  }

  private var label: String {
    let text = MarkdownText.inline(document, document.nodes[nodeID].children, locale: copy.locale)
    return text.characters.isEmpty ? copy.text("Image") : String(text.characters)
  }

  private func open() {
    if let activationID, let url = MarkdownText.linkURL(activationID) { openURL(url) }
  }
}

private struct MarkdownImageContent: View {
  @AirLocalizedCopy private var copy
  var model: MarkdownImageModel
  let label: String
  let open: () -> Void

  var body: some View {
    if let preview = model.preview {
      MarkdownImagePreview(model: preview, label: label, open: open)
    } else if let issue = model.issue {
      VStack(alignment: .leading, spacing: 8) {
        Label(label, systemImage: "photo")
        Text(copy.text(issue)).foregroundStyle(.secondary)
        Button(copy.text("Try again")) { model.load() }
      }
    } else {
      ProgressView(copy.text("Loading image…"))
        .frame(maxWidth: .infinity, minHeight: 120)
    }
  }
}

private struct MarkdownImagePreview: View {
  @AirLocalizedCopy private var copy
  var model: ImagePreviewModel
  let label: String
  let open: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let image = model.image {
        Button(action: open) {
          Image(decorative: image, scale: 1)
            .resizable().scaledToFit()
            .frame(maxWidth: .infinity, maxHeight: 360, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        ImageAnimationControls(model: model)
      } else if let issue = model.issue {
        Label(label, systemImage: "photo")
        Text(copy.text(issue)).foregroundStyle(.secondary)
        Button(copy.text("Try again")) { model.load() }
      } else {
        ProgressView(copy.text("Loading image…"))
          .frame(maxWidth: .infinity, minHeight: 120)
      }
    }
    .privacySensitive()
  }
}
