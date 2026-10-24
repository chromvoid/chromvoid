import ChromVoidBridge
import SwiftUI
import UIKit

/// Grouping a card number as it is typed, as pure text arithmetic: what the field should show
/// after an edit, and where the caret belongs in it. The caret is counted in digits, never in
/// characters, so the separators the grouping adds or removes never move it. The network's
/// groups and longest number are Core's.
enum PaymentCardNumberFormat {
  /// `text` as the field shows it now, `range` the edit in that text and `replacement` what
  /// the keyboard put there. Returns the text to show and the caret offset within it.
  static func edit(_ text: String, range: NSRange, replacement: String) -> (
    text: String, caret: Int
  ) {
    var range = range
    // Backspace onto a separator takes the digit before it, as a card form is expected to.
    if replacement.isEmpty, range.length == 1, let index = characterIndex(text, range.location),
      PaymentCardText.digits(String(text[index])).isEmpty, range.location > 0
    {
      range = NSRange(location: range.location - 1, length: 2)
    }
    let characters = Array(text)
    let head = String(characters.prefix(max(0, min(range.location, characters.count))))
    let tail = String(characters.dropFirst(min(range.location + range.length, characters.count)))
    let digitsBefore = PaymentCardText.digits(head + replacement).count
    let typed = PaymentCardText.digits(head + replacement + tail)
    let format = PaymentCardRules.inspect(typed).format
    let digits = String(typed.prefix(Int(format.maxDigits)))
    let grouped = PaymentCardText.grouped(digits, groups: format.groups)
    return (grouped, caret(in: grouped, afterDigits: min(digitsBefore, digits.count)))
  }

  /// The offset in `text` just past its `count`-th digit.
  static func caret(in text: String, afterDigits count: Int) -> Int {
    guard count > 0 else { return 0 }
    var seen = 0
    for (offset, character) in text.enumerated() where character.isASCII && character.isNumber {
      seen += 1
      if seen == count { return offset + 1 }
    }
    return text.count
  }

  private static func characterIndex(_ text: String, _ offset: Int) -> String.Index? {
    guard offset >= 0, offset < text.count else { return nil }
    return text.index(text.startIndex, offsetBy: offset)
  }
}

/// The card number on the face of the card. UIKit owns the text while it is being typed: the
/// field formats the edit itself and keeps the caret, instead of writing SwiftUI state back
/// into itself on every keystroke — a round trip fast typing outruns, which used to drop a
/// digit. `digits` is the storage value, digits only.
struct PaymentCardNumberInput: UIViewRepresentable {
  @Binding var digits: String
  let prompt: String
  let label: String
  let identifier: String
  /// A changed value focuses the field; nil leaves focus alone.
  var focusRequest: Int? = nil
  /// Reports focus so the caller can mark the field as the one being typed in.
  var onFocusChange: ((Bool) -> Void)? = nil

  func makeUIView(context: Context) -> CredentialSecretInput.InputField {
    let view = CredentialSecretInput.InputField()
    view.delegate = context.coordinator
    view.addTarget(
      context.coordinator, action: #selector(Coordinator.changed), for: .editingChanged)
    view.keyboardType = .numberPad
    view.textContentType = .creditCardNumber
    view.autocorrectionType = .no
    view.spellCheckingType = .no
    view.textColor = .white
    view.tintColor = .white
    view.adjustsFontSizeToFitWidth = true
    view.minimumFontSize = 13
    view.defaultTextAttributes = Self.attributes
    view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    return view
  }

  func updateUIView(_ view: CredentialSecretInput.InputField, context: Context) {
    context.coordinator.input = self
    view.isEnabled = context.environment.isEnabled
    view.accessibilityLabel = label
    view.accessibilityIdentifier = identifier
    view.attributedPlaceholder = NSAttributedString(
      string: prompt,
      attributes: Self.attributes.merging([.foregroundColor: UIColor.white.withAlphaComponent(0.45)]
      ) { _, new in new })
    // Only a value that did not come from this field is written back into it.
    let grouped = PaymentCardText.grouped(PaymentCardText.digits(digits))
    if view.text != grouped,
      !view.isFirstResponder || PaymentCardText.digits(view.text ?? "") != digits
    {
      view.text = grouped
    }
    if context.coordinator.lastFocusRequest != focusRequest {
      context.coordinator.lastFocusRequest = focusRequest
      if focusRequest != nil && view.isEnabled { view.requestFocus() }
    }
    if focusRequest == nil || !view.isEnabled { view.cancelFocusRequest() }
  }

  func sizeThatFits(
    _ proposal: ProposedViewSize, uiView: CredentialSecretInput.InputField, context: Context
  ) -> CGSize? {
    CGSize(
      width: proposal.width ?? uiView.intrinsicContentSize.width,
      height: uiView.intrinsicContentSize.height)
  }

  static func dismantleUIView(
    _ uiView: CredentialSecretInput.InputField, coordinator: Coordinator
  ) {
    uiView.cancelFocusRequest()
    uiView.removeTarget(coordinator, action: #selector(Coordinator.changed), for: .editingChanged)
    uiView.text = nil
  }

  func makeCoordinator() -> Coordinator { Coordinator(input: self) }

  private static let attributes: [NSAttributedString.Key: Any] = [
    .font: UIFont.monospacedSystemFont(ofSize: 21, weight: .medium),
    .kern: 1.5,
    .foregroundColor: UIColor.white,
  ]

  @MainActor
  final class Coordinator: NSObject, UITextFieldDelegate {
    var lastFocusRequest: Int?
    var input: PaymentCardNumberInput
    init(input: PaymentCardNumberInput) { self.input = input }

    func textField(
      _ textField: UITextField, shouldChangeCharactersIn range: NSRange,
      replacementString string: String
    ) -> Bool {
      let result = PaymentCardNumberFormat.edit(
        textField.text ?? "", range: range, replacement: string)
      textField.text = result.text
      if let position = textField.position(
        from: textField.beginningOfDocument, offset: result.caret)
      {
        textField.selectedTextRange = textField.textRange(from: position, to: position)
      }
      // The field already carries the edit; `editingChanged` reports it to the model.
      textField.sendActions(for: .editingChanged)
      return false
    }

    func textFieldDidBeginEditing(_ textField: UITextField) { input.onFocusChange?(true) }
    func textFieldDidEndEditing(_ textField: UITextField) { input.onFocusChange?(false) }

    @objc func changed(_ view: UITextField) {
      input.digits = PaymentCardText.digits(view.text ?? "")
    }
  }
}
