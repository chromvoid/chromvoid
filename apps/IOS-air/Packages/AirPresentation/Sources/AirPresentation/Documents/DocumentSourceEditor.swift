import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// UIKit supplies the iOS 16 text selection contract used for image insertion.
struct DocumentSourceEditor: UIViewRepresentable {
  var model: DocumentModel

  func makeCoordinator() -> Coordinator { Coordinator(model: model) }

  func makeUIView(context: Context) -> UITextView {
    let view = UITextView()
    view.delegate = context.coordinator
    view.pasteDelegate = context.coordinator
    view.pasteConfiguration = UIPasteConfiguration(
      acceptableTypeIdentifiers: [UTType.plainText.identifier, UTType.image.identifier])
    view.font = .monospacedSystemFont(
      ofSize: UIFont.preferredFont(forTextStyle: .body).pointSize, weight: .regular)
    view.adjustsFontForContentSizeCategory = true
    view.backgroundColor = .clear
    view.autocorrectionType = .no
    view.autocapitalizationType = .none
    view.smartQuotesType = .no
    view.smartDashesType = .no
    view.accessibilityIdentifier = "documentText"
    return view
  }

  func updateUIView(_ view: UITextView, context: Context) {
    context.coordinator.applyModel(to: view)
  }

  static func dismantleUIView(_ view: UITextView, coordinator: Coordinator) {
    view.pasteDelegate = nil
    view.delegate = nil
    view.text = ""
    view.undoManager?.removeAllActions()
  }

  final class Coordinator: NSObject, UITextViewDelegate, UITextPasteDelegate {
    let model: DocumentModel
    var applyingModel = false
    private var hasLoadedText = false
    init(model: DocumentModel) { self.model = model }

    func applyModel(to view: UITextView) {
      applyingModel = true
      defer { applyingModel = false }
      let selection = model.selection
      view.isEditable = model.state == .editing && !model.importingImage
      if !hasLoadedText || model.state == .revoked {
        view.text = model.text
        view.undoManager?.removeAllActions()
      } else if view.text != model.text,
        let range = view.textRange(from: view.beginningOfDocument, to: view.endOfDocument)
      {
        // UIKit owns undo/redo. A model-driven insertion is one edit, separate from typing.
        view.undoManager?.beginUndoGrouping()
        view.replace(range, withText: model.text)
        view.undoManager?.endUndoGrouping()
      }
      if NSMaxRange(selection) <= (view.text as NSString).length, view.selectedRange != selection {
        view.selectedRange = selection
      }
      if model.state == .editing { hasLoadedText = true }
    }

    func textPasteConfigurationSupporting(
      _ textPasteConfigurationSupporting: any UITextPasteConfigurationSupporting,
      transform item: any UITextPasteItem
    ) {
      guard model.state == .editing, model.mode == .source, !model.importingImage else {
        item.setNoResult()
        return
      }
      if item.itemProvider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
        guard model.canImportImage else {
          item.setNoResult()
          return
        }
        item.setResult(attachment: PastedImageAttachment(provider: item.itemProvider))
      } else {
        item.setDefaultResult()
      }
    }

    func textPasteConfigurationSupporting(
      _ textPasteConfigurationSupporting: any UITextPasteConfigurationSupporting,
      performPasteOf attributedString: NSAttributedString, to textRange: UITextRange
    ) -> UITextRange {
      guard let view = textPasteConfigurationSupporting as? UITextView,
        model.state == .editing, model.mode == .source, !model.importingImage
      else { return textRange }
      var fragments: [DocumentPasteFragment] = []
      var hasImages = false
      attributedString.enumerateAttribute(
        .attachment, in: NSRange(location: 0, length: attributedString.length)
      ) {
        value, range, _ in
        if let image = value as? PastedImageAttachment {
          hasImages = true
          fragments.append(.image(.provider(image.provider)))
        } else {
          fragments.append(.text(attributedString.attributedSubstring(from: range).string))
        }
      }
      if hasImages {
        let location = view.offset(from: view.beginningOfDocument, to: textRange.start)
        let length = view.offset(from: textRange.start, to: textRange.end)
        model.receivePaste(fragments, at: NSRange(location: location, length: length))
      } else {
        // Preserve UIKit's ordinary text replacement and report the resulting editor state.
        applyingModel = true
        view.replace(textRange, withText: attributedString.string)
        applyingModel = false
        textViewDidChange(view)
      }
      return view.selectedTextRange ?? textRange
    }

    func textViewDidChange(_ textView: UITextView) {
      guard !applyingModel else { return }
      model.setText(textView.text)
      model.setSelection(textView.selectedRange)
    }

    func textViewDidChangeSelection(_ textView: UITextView) {
      guard !applyingModel else { return }
      model.setSelection(textView.selectedRange)
    }
  }
}

/// This transient marker carries the explicit UIKit item to the final paste range callback.
/// It is consumed there and never inserted as a rich-text attachment in the Markdown editor.
private final class PastedImageAttachment: NSTextAttachment {
  let provider: NSItemProvider
  init(provider: NSItemProvider) {
    self.provider = provider
    super.init(data: nil, ofType: nil)
  }
  required init?(coder: NSCoder) { return nil }
}
