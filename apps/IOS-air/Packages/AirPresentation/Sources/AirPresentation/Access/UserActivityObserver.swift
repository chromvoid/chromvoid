import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// Observes the owning window, including presented sheets, without claiming a gesture.
struct UserActivityObserver: UIViewRepresentable {
  let onActivity: @MainActor () -> Void

  func makeUIView(context: Context) -> UserActivityView {
    let view = UserActivityView()
    view.isUserInteractionEnabled = false
    view.onActivity = onActivity
    return view
  }

  func updateUIView(_ view: UserActivityView, context: Context) {
    view.onActivity = onActivity
  }

  static func dismantleUIView(_ view: UserActivityView, coordinator: ()) {
    view.detach()
  }
}

final class UserActivityView: UIView {
  var onActivity: (@MainActor () -> Void)?
  private weak var observedWindow: UIWindow?
  private let input = UserActivityRecognizer()

  override func didMoveToWindow() {
    super.didMoveToWindow()
    detach()
    guard let window else { return }
    observedWindow = window
    input.onActivity = { [weak self] in self?.onActivity?() }
    window.addGestureRecognizer(input)
    // Keyboard touches belong to a system window. Observe editing in this window,
    // without reading the field's text or replacing its delegate.
    for name in [UITextField.textDidChangeNotification, UITextView.textDidChangeNotification] {
      NotificationCenter.default.addObserver(
        self, selector: #selector(textChanged), name: name, object: nil)
    }
  }

  func detach() {
    NotificationCenter.default.removeObserver(self)
    observedWindow?.removeGestureRecognizer(input)
    observedWindow = nil
    input.onActivity = nil
  }

  @objc private func textChanged(_ notification: Notification) {
    guard let source = notification.object as? UIView, let observedWindow,
      source.window === observedWindow, source.isFirstResponder
    else { return }
    onActivity?()
  }
}

private final class UserActivityRecognizer: UIGestureRecognizer {
  var onActivity: (@MainActor () -> Void)?

  init() {
    super.init(target: nil, action: nil)
    cancelsTouchesInView = false
    delaysTouchesBegan = false
    delaysTouchesEnded = false
  }

  override func canPrevent(_ other: UIGestureRecognizer) -> Bool { false }
  override func canBePrevented(by other: UIGestureRecognizer) -> Bool { false }
  override func shouldRequireFailure(of other: UIGestureRecognizer) -> Bool { false }
  override func shouldBeRequiredToFail(by other: UIGestureRecognizer) -> Bool { false }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) { onActivity?() }
  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) { onActivity?() }
  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
    onActivity?()
    state = .failed
  }
  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) { state = .failed }

  override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent) { onActivity?() }
  override func pressesChanged(_ presses: Set<UIPress>, with event: UIPressesEvent) {
    onActivity?()
  }
  override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent) {
    onActivity?()
    state = .failed
  }
  override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent) {
    state = .failed
  }
}
