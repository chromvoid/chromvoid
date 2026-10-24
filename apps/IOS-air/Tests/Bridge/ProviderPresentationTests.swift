import Combine
import SwiftUI
import XCTest

@testable import AirCredentialProvider

final class ProviderPresentationTests: XCTestCase {
  @MainActor
  func testCanceledLoadCannotRestoreOldRows() async {
    let model = ProviderModel()
    let started = expectation(description: "pending load")
    var resume: CheckedContinuation<Void, Never>?
    let task = model.prepare {
      await withCheckedContinuation { continuation in
        resume = continuation
        started.fulfill()
      }
      return [
        ProviderChoice(
          id: "stale", title: "Old account", subtitle: "example.test", symbol: "key", perform: {})
      ]
    }
    await fulfillment(of: [started], timeout: 2)
    model.reset()
    resume?.resume()
    await task.value
    XCTAssertTrue(model.choices.isEmpty)
    XCTAssertFalse(model.busy)
    XCTAssertNil(model.message)
  }

  @MainActor
  func testDuplicateSelectionDoesNotRepeatTheOperation() async {
    let model = ProviderModel()
    let started = expectation(description: "selection started")
    var resume: CheckedContinuation<Void, Never>?
    var calls = 0
    let choice = ProviderChoice(
      id: "selected", title: "Account", subtitle: "example.test", symbol: "key"
    ) {
      calls += 1
      await withCheckedContinuation { continuation in
        resume = continuation
        started.fulfill()
      }
    }
    let task = model.choose(choice)
    await fulfillment(of: [started], timeout: 2)
    XCTAssertNil(model.choose(choice))
    resume?.resume()
    await task?.value
    XCTAssertEqual(calls, 1)
  }

  @MainActor
  func testOrdinaryProviderRendering() async throws {
    let model = ProviderModel()
    await model.prepare {
      [
        ProviderChoice(
          id: "personal", title: "Personal account", subtitle: "alice@example.test · example.test",
          symbol: "key", perform: {}),
        ProviderChoice(
          id: "work", title: "Work passkey", subtitle: "work.example.test",
          symbol: "person.badge.key", perform: {}),
      ]
    }.value
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    let previous = scene.windows.first(where: \.isKeyWindow)
    let window = UIWindow(windowScene: scene)
    window.frame = scene.coordinateSpace.bounds
    let appeared = expectation(description: "preview appeared")
    let host = ProviderPreviewHost(rootView: ProviderView(model: model, cancel: {}))
    host.appeared = { appeared.fulfill() }
    window.rootViewController = host
    window.makeKeyAndVisible()
    defer {
      window.isHidden = true
      previous?.makeKeyAndVisible()
    }
    await fulfillment(of: [appeared], timeout: 2)
    host.view.frame = window.bounds
    host.view.layoutIfNeeded()
    let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
      window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
    }
    let attachment = XCTAttachment(image: image)
    attachment.name = "Provider ordinary credential list"
    attachment.lifetime = .keepAlways
    add(attachment)
    model.configure()
    host.view.layoutIfNeeded()
    let unavailable = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
      window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
    }
    let unavailableAttachment = XCTAttachment(image: unavailable)
    unavailableAttachment.name = "Provider configuration limitation"
    unavailableAttachment.lifetime = .keepAlways
    add(unavailableAttachment)
  }
}

@MainActor
private final class ProviderPreviewHost: UIHostingController<ProviderView> {
  var appeared: (() -> Void)?
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    appeared?()
    appeared = nil
  }
}
