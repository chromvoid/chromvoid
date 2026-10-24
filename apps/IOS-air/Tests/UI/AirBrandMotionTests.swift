import XCTest

/// The ordinary fixture access flow, with settled captures for each theme. Record the
/// simulator while these tests run to inspect the intro, key signal and opening ring.
final class AirBrandMotionTests: XCTestCase {
  @MainActor
  func testLightBrandMotionThroughEmptyAndPopulatedVault() {
    exerciseBrandMotion(theme: "light")
  }

  @MainActor
  func testDarkBrandMotionThroughEmptyAndPopulatedVault() {
    exerciseBrandMotion(theme: "dark")
  }

  @MainActor
  private func exerciseBrandMotion(theme: String) {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app, theme: theme)
    let vaultPassword = "air-brand-motion-" + UUID().uuidString
    Thread.sleep(forTimeInterval: 2)
    attach(app, name: "brand-\(theme)-locked")

    tap(password, in: app)
    password.typeText(vaultPassword)
    Thread.sleep(forTimeInterval: 1)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    Thread.sleep(forTimeInterval: 1)
    attach(app, name: "brand-\(theme)-empty-vault")

    tap(app.buttons["addCredential"], in: app)
    let title = app.textFields["credential_title"]
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    tap(title, in: app)
    title.typeText("Brand motion synthetic login")
    tap(app.buttons["saveCredential"], in: app)
    XCTAssertTrue(
      app.staticTexts["Brand motion synthetic login"].firstMatch.waitForExistence(timeout: 15))
    XCTAssertTrue(app.buttons["saveCredential"].waitForNonExistence(timeout: 10))

    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
    Thread.sleep(forTimeInterval: 1)
    attach(app, name: "brand-\(theme)-returned-to-lock")

    tap(password, in: app)
    password.typeText(vaultPassword)
    Thread.sleep(forTimeInterval: 1)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    XCTAssertTrue(
      app.staticTexts["Brand motion synthetic login"].firstMatch.waitForExistence(timeout: 15))
    Thread.sleep(forTimeInterval: 1)
    attach(app, name: "brand-\(theme)-populated-vault")
    app.terminate()
  }

  @MainActor
  private func launchLockedFixture(_ app: XCUIApplication, theme: String) -> XCUIElement {
    app.launchArguments += [
      "-AppleLanguages", "(en)", "-AppleLocale", "en_US",
      "-air.appearance.theme", theme, "-air.appearance.language", "en",
    ]
    app.launch()
    XCTAssertTrue(app.navigationBars["ChromVoid Air"].waitForExistence(timeout: 20))
    let welcome = app.buttons["continueWelcome"]
    if welcome.waitForExistence(timeout: 3) {
      Thread.sleep(forTimeInterval: 2)
      attach(app, name: "brand-\(theme)-welcome")
      tap(welcome, in: app)
    }
    let password = app.secureTextFields["accessPassword"]
    XCTAssertTrue(password.waitForExistence(timeout: 15))
    let confirmation = app.secureTextFields["accessConfirmation"]
    if confirmation.exists {
      tap(password, in: app)
      password.typeText("air-synthetic-ui-administrator")
      tap(confirmation, in: app)
      confirmation.typeText("air-synthetic-ui-administrator")
      tap(app.buttons["submitAccess"], in: app)
      XCTAssertTrue(app.buttons["Open vault"].waitForExistence(timeout: 20))
    }
    return password
  }

  @MainActor
  private func tap(_ element: XCUIElement, in app: XCUIApplication) {
    for _ in 0..<8 where !element.exists { app.swipeUp() }
    XCTAssertTrue(element.exists)
    let enabled = expectation(
      for: NSPredicate(format: "isEnabled == true"), evaluatedWith: element)
    wait(for: [enabled], timeout: 15)
    element.tap()
  }

  @MainActor
  private func attach(_ app: XCUIApplication, name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
