import UIKit
import XCTest

@testable import AirPresentation

@MainActor
final class UserActivityObserverTests: XCTestCase {
  func testEditingObservationBelongsToTheAttachedWindowAndStopsOnRemoval() {
    let first = UIWindow()
    let second = UIWindow()
    let observer = UserActivityView()
    var activity = 0
    observer.onActivity = { activity += 1 }
    first.addSubview(observer)
    let editing = EditingField()
    first.addSubview(editing)
    let foreign = EditingField()
    second.addSubview(foreign)
    let inactive = UITextField()
    first.addSubview(inactive)

    editing.text = "programmatic model update"
    XCTAssertEqual(activity, 0)
    NotificationCenter.default.post(name: UITextField.textDidChangeNotification, object: foreign)
    NotificationCenter.default.post(name: UITextField.textDidChangeNotification, object: inactive)
    XCTAssertEqual(activity, 0)
    NotificationCenter.default.post(name: UITextField.textDidChangeNotification, object: editing)
    XCTAssertEqual(activity, 1)

    second.addSubview(observer)
    NotificationCenter.default.post(name: UITextField.textDidChangeNotification, object: editing)
    XCTAssertEqual(activity, 1)
    NotificationCenter.default.post(name: UITextField.textDidChangeNotification, object: foreign)
    XCTAssertEqual(activity, 2)
    let editor = EditingTextView()
    second.addSubview(editor)
    NotificationCenter.default.post(name: UITextView.textDidChangeNotification, object: editor)
    XCTAssertEqual(activity, 3)
    observer.removeFromSuperview()
    NotificationCenter.default.post(name: UITextField.textDidChangeNotification, object: foreign)
    NotificationCenter.default.post(name: UITextView.textDidChangeNotification, object: editor)
    XCTAssertEqual(activity, 3)
  }

  func testObserverDoesNotClaimOrDelayOtherGesturesAndDetachesCleanly() throws {
    let window = UIWindow()
    let existing = UIPanGestureRecognizer()
    window.addGestureRecognizer(existing)
    let original = window.gestureRecognizers ?? []
    let observer = UserActivityView()
    window.addSubview(observer)
    let added = (window.gestureRecognizers ?? []).filter { candidate in
      !original.contains { $0 === candidate }
    }
    XCTAssertEqual(added.count, 1)
    let input = try XCTUnwrap(added.first)
    XCTAssertFalse(input.cancelsTouchesInView)
    XCTAssertFalse(input.delaysTouchesBegan)
    XCTAssertFalse(input.delaysTouchesEnded)
    XCTAssertFalse(input.canPrevent(existing))
    XCTAssertFalse(input.canBePrevented(by: existing))
    XCTAssertFalse(input.shouldRequireFailure(of: existing))
    XCTAssertFalse(input.shouldBeRequiredToFail(by: existing))
    observer.detach()
    XCTAssertEqual(window.gestureRecognizers, original)
  }
}

/// Simulates UIKit's editing notification source without sending input to the simulator.
private final class EditingField: UITextField {
  override var isFirstResponder: Bool { true }
}

private final class EditingTextView: UITextView {
  override var isFirstResponder: Bool { true }
}
