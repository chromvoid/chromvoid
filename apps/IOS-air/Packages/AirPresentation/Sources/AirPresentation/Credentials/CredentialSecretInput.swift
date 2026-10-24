import SwiftUI
import UIKit

/// Keep one native text input while toggling masking. Replacing a SecureField with a
/// TextField ends the password input session and can trigger system credential saving.
struct CredentialSecretInput: UIViewRepresentable {
  @Binding var text: String
  let focusRequest: Int?
  let revealed: Bool
  let label: String
  let identifier: String
  let numeric: Bool
  /// Return key appearance and handler; default keeps the plain keyboard behavior.
  var returnKey: UIReturnKeyType = .default
  var onSubmit: (() -> Void)? = nil

  func makeUIView(context: Context) -> InputField {
    let view = InputField()
    view.delegate = context.coordinator
    view.addTarget(
      context.coordinator, action: #selector(Coordinator.changed), for: .editingChanged)
    view.autocapitalizationType = .none
    view.autocorrectionType = .no
    view.spellCheckingType = .no
    view.smartQuotesType = .no
    view.smartDashesType = .no
    view.textContentType = nil
    view.clearsOnBeginEditing = false
    view.adjustsFontForContentSizeCategory = true
    view.font = .preferredFont(forTextStyle: .body)
    view.textColor = .label
    view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    return view
  }

  func updateUIView(_ view: InputField, context: Context) {
    context.coordinator.input = self
    view.isEnabled = context.environment.isEnabled
    view.placeholder = label
    view.accessibilityLabel = label
    view.accessibilityIdentifier = identifier
    view.keyboardType = numeric ? .numberPad : .asciiCapable
    view.returnKeyType = returnKey
    if view.isSecureTextEntry == revealed {
      let selection = view.selectedTextRange
      view.isSecureTextEntry = !revealed
      view.text = text
      view.selectedTextRange = selection
    } else if view.text != text {
      view.text = text
    }
    if context.coordinator.lastFocusRequest != focusRequest {
      context.coordinator.lastFocusRequest = focusRequest
      if focusRequest != nil && view.isEnabled { view.requestFocus() }
    }
    if focusRequest == nil || !view.isEnabled { view.cancelFocusRequest() }
  }

  func sizeThatFits(_ proposal: ProposedViewSize, uiView: InputField, context: Context) -> CGSize? {
    CGSize(
      width: proposal.width ?? uiView.intrinsicContentSize.width,
      height: max(44, uiView.intrinsicContentSize.height))
  }

  static func dismantleUIView(_ uiView: InputField, coordinator: Coordinator) {
    uiView.cancelFocusRequest()
    uiView.removeTarget(coordinator, action: #selector(Coordinator.changed), for: .editingChanged)
    uiView.text = nil
  }

  func makeCoordinator() -> Coordinator { Coordinator(input: self) }

  @MainActor
  final class Coordinator: NSObject, UITextFieldDelegate {
    var lastFocusRequest: Int?
    var input: CredentialSecretInput
    init(input: CredentialSecretInput) { self.input = input }
    @objc func changed(_ view: UITextField) { input.text = view.text ?? "" }
    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
      guard let onSubmit = input.onSubmit else { return true }
      onSubmit()
      return false
    }
  }

  /// Focus is a one-shot presentation request; ordinary user focus stays UIKit-owned.
  @MainActor
  final class InputField: UITextField {
    private var focusPending = false
    func requestFocus() {
      focusPending = true
      applyPendingFocus()
    }
    func cancelFocusRequest() { focusPending = false }
    override func didMoveToWindow() {
      super.didMoveToWindow()
      applyPendingFocus()
    }
    private func applyPendingFocus() {
      guard focusPending, window != nil, isEnabled else { return }
      focusPending = !becomeFirstResponder()
    }
  }
}
