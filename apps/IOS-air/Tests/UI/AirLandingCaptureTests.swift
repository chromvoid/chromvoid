import XCTest

/// Marketing capture for the landing page: seeds a small synthetic vault once, then walks
/// through the screens the site shows and attaches named screenshots. Runs only when
/// `scripts/capture-landing-media.sh` asks for it, so the verification suite never pays for it.
///
/// Every value typed here is synthetic; the vault password is fixed so the same vault is
/// reused between runs (any other password would open a different, empty vault).
final class AirLandingCaptureTests: XCTestCase {
  private var environment: [String: String] { ProcessInfo.processInfo.environment }
  private var locale: String { environment["AIR_LANDING_LOCALE"] ?? "en" }
  private var pace: TimeInterval { TimeInterval(environment["AIR_LANDING_PACE"] ?? "") ?? 1.6 }

  override func setUpWithError() throws {
    try XCTSkipUnless(
      environment["AIR_LANDING_CAPTURE"] == "1" || environment["AIR_SCREEN_SURVEY"] == "1",
      "Landing capture runs only from scripts/capture-landing-media.sh")
    continueAfterFailure = false
  }

  /// Design survey: every main screen of the unlocked app as a named screenshot, on the same
  /// synthetic vault as the landing tour. Runs only with `AIR_SCREEN_SURVEY=1`; nothing here
  /// is a verification step.
  @MainActor
  func testScreenSurvey() throws {
    try XCTSkipUnless(environment["AIR_SCREEN_SURVEY"] == "1")
    let app = XCUIApplication()
    let password = launchLocked(app)
    pause(0.8)
    attach(app, name: "survey-locked")
    password.tap()
    password.typeText(environment["AIR_LANDING_PASSWORD"] ?? "air-landing-demo")
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    if !app.staticTexts[copy.credentials[0].title].firstMatch.waitForExistence(timeout: 10),
      app.staticTexts["emptyVault"].exists
    {
      seedVault(in: app)
    }
    pause()
    attach(app, name: "survey-vault")

    // Search with results, then cleared.
    let search = app.textFields["credentialSearch"]
    if search.waitForExistence(timeout: 5) {
      search.tap()
      search.typeText("a")
      pause()
      attach(app, name: "survey-search")
      // iOS 26 has no labelled Cancel; the catalog's own row clears and dismisses the search.
      tap(app.buttons["clearCredentialSearch"], in: app)
      XCTAssertTrue(app.buttons["vaultTools"].waitForExistence(timeout: 10))
      pause(0.6)
    }

    // Sort and filter menu, tools menu, add menu.
    tap(app.buttons["catalogOptions"], in: app)
    pause(0.8)
    attach(app, name: "survey-catalog-menu")
    dismissMenu(app)
    tap(app.buttons["vaultTools"], in: app)
    pause(0.8)
    attach(app, name: "survey-tools-menu")
    dismissMenu(app)
    app.buttons["addCredential"].press(forDuration: 1.2)
    pause(0.8)
    attach(app, name: "survey-add-menu")
    dismissMenu(app)

    // Collections.
    for (identifier, name) in [
      ("openCodes", "survey-codes"), ("openPasskeys", "survey-passkeys"),
      ("openSSHKeys", "survey-ssh"), ("openWallet", "survey-wallet"),
    ] {
      tap(app.buttons[identifier], in: app)
      pause(1.2)
      attach(app, name: name)
      goBack(app)
      XCTAssertTrue(app.buttons["addCredential"].waitForExistence(timeout: 10))
      pause(0.5)
    }

    // Credential page and its code manager.
    tap(firstCredentialRow(in: app), in: app)
    XCTAssertTrue(app.staticTexts["credentialDetailTitle"].waitForExistence(timeout: 15))
    _ = app.staticTexts["otpInlineValue"].waitForExistence(timeout: 10)
    pause()
    attach(app, name: "survey-credential")
    app.swipeUp()
    pause(0.6)
    attach(app, name: "survey-credential-bottom")
    goBack(app)
    XCTAssertTrue(app.buttons["addCredential"].waitForExistence(timeout: 10))

    // Vault tools as sheets.
    tap(app.buttons["vaultTools"], in: app)
    tap(app.buttons["openSecurityAudit"], in: app)
    pause(1.5)
    attach(app, name: "survey-audit")
    tap(doneButton(in: app), in: app)
    pause(0.6)
    tap(app.buttons["vaultTools"], in: app)
    tap(app.buttons["browseTags"], in: app)
    pause(1.0)
    attach(app, name: "survey-tags")
    tap(app.buttons["closeTags"], in: app)
    pause(0.6)

    // Files, note, connections, settings, help.
    openTab("Files", in: app)
    // A vault seeded by an earlier, interrupted run may have no note; the survey goes on.
    let note = app.buttons["fileRow-\(copy.noteName).md"]
    _ = note.waitForExistence(timeout: 15)
    pause()
    attach(app, name: "survey-files")
    if note.exists {
      tap(note, in: app)
      _ = app.descendants(matching: .any)["markdownPreview"].waitForExistence(timeout: 8)
      pause()
      attach(app, name: "survey-note")
      goBack(app)
      pause(0.6)
    }
    openTab("Connections", in: app)
    pause(1.2)
    attach(app, name: "survey-connections")
    openTab("Settings", in: app)
    pause(1.0)
    attach(app, name: "survey-settings")
    app.swipeUp()
    pause(0.6)
    attach(app, name: "survey-settings-bottom")
    tap(app.buttons["settingsHelp"], in: app)
    pause(1.0)
    attach(app, name: "survey-help")
    goBack(app)
    pause(0.6)
    openTab("Vault", in: app)
    XCTAssertTrue(app.buttons["addCredential"].waitForExistence(timeout: 10))
  }

  /// The sheet's Done button in either language.
  @MainActor
  private func doneButton(in app: XCUIApplication) -> XCUIElement {
    let done = app.buttons["Done"].firstMatch
    return done.exists ? done : app.buttons["Готово"].firstMatch
  }

  @MainActor
  private func goBack(_ app: XCUIApplication) {
    app.navigationBars.element(boundBy: 0).buttons.element(boundBy: 0).tap()
  }

  /// A tap on the large title, which no menu covers and which reacts to nothing, closes it.
  @MainActor
  private func dismissMenu(_ app: XCUIApplication) {
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.16)).tap()
    pause(0.6)
  }

  @MainActor
  func testLandingTour() throws {
    let app = XCUIApplication()
    let password = launchLocked(app)
    password.tap()
    password.typeText(environment["AIR_LANDING_PASSWORD"] ?? "air-landing-demo")
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    if !app.staticTexts[copy.credentials[0].title].firstMatch.waitForExistence(timeout: 10),
      app.staticTexts["emptyVault"].exists
    {
      seedVault(in: app)
    }
    pause()
    attach(app, name: "landing-vault")

    // The first catalog row carries the live one-time code.
    tap(firstCredentialRow(in: app), in: app)
    XCTAssertTrue(app.staticTexts["credentialDetailTitle"].waitForExistence(timeout: 15))
    _ = app.staticTexts["otpInlineValue"].waitForExistence(timeout: 10)
    pause()
    attach(app, name: "landing-credential")
    app.navigationBars.element(boundBy: 0).buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.buttons["addCredential"].waitForExistence(timeout: 10))
    pause(0.6)

    // Files and the note.
    openTab("Files", in: app)
    XCTAssertTrue(app.buttons["fileRow-\(copy.noteName).md"].waitForExistence(timeout: 15))
    pause()
    attach(app, name: "landing-files")
    tap(app.buttons["fileRow-\(copy.noteName).md"], in: app)
    _ = app.descendants(matching: .any)["markdownPreview"].waitForExistence(timeout: 8)
    pause()
    attach(app, name: "landing-note")
    app.navigationBars.element(boundBy: 0).buttons.element(boundBy: 0).tap()
    pause(0.6)
    openTab("Vault", in: app)
    XCTAssertTrue(app.buttons["addCredential"].waitForExistence(timeout: 10))
    pause()
  }

  // MARK: - Synthetic content

  private struct Credential {
    let title: String
    let username: String
    let password: String
  }
  private struct Copy {
    let credentials: [Credential]
    let otpName: String
    let noteName: String
    let noteBody: String
  }
  private var copy: Copy {
    locale == "ru"
      ? Copy(
        credentials: [
          Credential(
            title: "Личная почта", username: "alice@example.com", password: "kx7-Plume-orchid-42"),
          Credential(
            title: "Рабочий аккаунт", username: "a.petrova", password: "Granite-bridge-9021"),
          Credential(title: "Облачный диск", username: "alice.p", password: "Copper-lantern-337"),
          Credential(
            title: "Домашний Wi-Fi", username: "home-network", password: "quiet-river-5580"),
        ],
        otpName: "Основной код", noteName: "Поездка",
        noteBody: "# Поездка\n- [x] Паспорт\n- [ ] Страховка\n- [ ] Бронь отеля")
      : Copy(
        credentials: [
          Credential(
            title: "Personal mail", username: "alice@example.com", password: "kx7-Plume-orchid-42"),
          Credential(title: "Work account", username: "a.miller", password: "Granite-bridge-9021"),
          Credential(title: "Cloud drive", username: "alice.m", password: "Copper-lantern-337"),
          Credential(title: "Home Wi-Fi", username: "home-network", password: "quiet-river-5580"),
        ],
        otpName: "Main code", noteName: "Trip",
        noteBody: "# Trip\n- [x] Passport\n- [ ] Insurance\n- [ ] Hotel booking")
  }

  @MainActor
  private func seedVault(in app: XCUIApplication) {
    for credential in copy.credentials.reversed() {
      tap(app.buttons["addCredential"], in: app)
      let title = app.textFields["credential_title"].firstMatch
      XCTAssertTrue(title.waitForExistence(timeout: 5))
      title.tap()
      title.typeText(credential.title)
      let username = app.textFields["credential_username"].firstMatch
      focus(username, in: app)
      username.typeText(credential.username)
      let secret = app.secureTextFields["credential_password"].firstMatch
      focus(secret, in: app)
      secret.typeText(credential.password)
      tap(app.buttons["saveCredential"].firstMatch, in: app)
      XCTAssertTrue(app.staticTexts[credential.title].firstMatch.waitForExistence(timeout: 15))
      // Let the creation sheet leave the hierarchy before the next one opens.
      XCTAssertTrue(app.buttons["saveCredential"].waitForNonExistence(timeout: 10))
    }
    // A one-time code on the first credential so the detail page shows a live code.
    tap(firstCredentialRow(in: app), in: app)
    // Codes are managed from the edit form; the page only shows them.
    tap(app.buttons["editCredential"], in: app)
    tap(app.buttons["openOTP"], in: app)
    tap(app.buttons["addOTP"], in: app)
    tap(app.buttons["manualOTP"], in: app)
    focus(app.textFields["otpName"], in: app)
    app.textFields["otpName"].typeText(copy.otpName)
    focus(app.secureTextFields["otpSeed"], in: app)
    app.secureTextFields["otpSeed"].typeText("JBSWY3DPEHPK3PXP")
    tap(app.buttons["saveOTP"], in: app)
    XCTAssertTrue(app.staticTexts["otpValue"].waitForExistence(timeout: 15))
    tap(doneButton(in: app), in: app)
    tap(app.buttons["cancelCredentialEdit"], in: app)
    XCTAssertTrue(app.staticTexts["otpInlineValue"].waitForExistence(timeout: 15))
    app.navigationBars.element(boundBy: 0).buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.buttons["addCredential"].waitForExistence(timeout: 10))

    // One Markdown note in Files.
    openTab("Files", in: app)
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newNote"], in: app)
    let name = app.textFields["noteName"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText(copy.noteName)
    let body = app.textViews["noteText"]
    XCTAssertTrue(body.waitForExistence(timeout: 5))
    body.tap()
    body.typeText(copy.noteBody)
    tap(app.buttons["saveNote"], in: app)
    XCTAssertTrue(app.buttons["fileRow-\(copy.noteName).md"].waitForExistence(timeout: 15))
    openTab("Vault", in: app)
    XCTAssertTrue(app.buttons["addCredential"].waitForExistence(timeout: 10))
  }

  // MARK: - Helpers (kept local so AirUITests can change freely)

  @MainActor
  private func launchLocked(_ app: XCUIApplication) -> XCUIElement {
    app.launchArguments += [
      "-AppleLanguages", "(\(locale))", "-AppleLocale", locale == "ru" ? "ru_RU" : "en_US",
    ]
    app.launch()
    XCTAssertTrue(app.navigationBars.element(boundBy: 0).waitForExistence(timeout: 20))
    let password = app.secureTextFields["accessPassword"]
    let welcome = app.buttons["continueWelcome"]
    if welcome.waitForExistence(timeout: 1) {
      pause()
      tap(welcome, in: app)
    }
    XCTAssertTrue(password.waitForExistence(timeout: 15))
    let confirmation = app.secureTextFields["accessConfirmation"]
    if confirmation.exists {
      password.tap()
      password.typeText("air-synthetic-ui-administrator")
      confirmation.tap()
      confirmation.typeText("air-synthetic-ui-administrator")
      tap(app.buttons["submitAccess"], in: app)
      XCTAssertTrue(password.waitForExistence(timeout: 20))
      XCTAssertFalse(app.secureTextFields["accessConfirmation"].exists)
    }
    return password
  }

  /// The first catalog row, the same query the verification suite uses.
  @MainActor
  private func firstCredentialRow(in app: XCUIApplication) -> XCUIElement {
    let row = app.buttons.matching(
      NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_")
    ).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    return row
  }

  /// Tabs by position, because their labels follow the app language.
  @MainActor
  private func openTab(_ label: String, in app: XCUIApplication) {
    let index = ["Vault": 0, "Files": 1, "Connections": 2, "Settings": 3][label] ?? 0
    let tab = app.tabBars.buttons.element(boundBy: index)
    if tab.exists { tab.tap() } else { tap(app.buttons[label], in: app) }
  }

  @MainActor
  private func focus(_ field: XCUIElement, in app: XCUIApplication) {
    for _ in 0..<8 where !field.exists { app.swipeUp() }
    XCTAssertTrue(field.exists)
    let frame = field.frame
    field.tap()
    if field.frame != frame { field.tap() }
  }

  @MainActor
  private func tap(_ element: XCUIElement, in app: XCUIApplication) {
    // Rows expose their text as non-hittable children; scroll only while nothing is there at all.
    for _ in 0..<8 where !element.exists { app.swipeUp() }
    XCTAssertTrue(element.exists, "Missing element \(element)")
    // Edit exists from the first frame and turns usable once the page has loaded.
    let ready = expectation(
      for: NSPredicate(format: "isEnabled == true"), evaluatedWith: element)
    wait(for: [ready], timeout: 15)
    element.tap()
  }

  private func pause(_ seconds: TimeInterval? = nil) {
    Thread.sleep(forTimeInterval: seconds ?? pace)
  }

  @MainActor
  private func attach(_ app: XCUIApplication, name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
