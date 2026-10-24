import XCTest
import ObjectiveC.runtime

final class ChromVoidSimulatorSmokeTests: XCTestCase {
    private typealias InteractionBlock = @convention(block) () -> Void
    private typealias PerformWithInteractionOptions = @convention(c) (
        XCUIApplication,
        Selector,
        UInt,
        InteractionBlock
    ) -> Void
    private let launchTimeout: TimeInterval = 90
    private let elementTimeout: TimeInterval = 60
    private let focusTimeout: TimeInterval = 3
    private let smokePassword = "7319054826713"
    private let alternatePassword = "8642097531086"
    private let smokeCredentialTitle = "iOS durability smoke"
    private let smokeCredentialUsername = "ios-smoke@example.invalid"
    private let smokeCredentialPassword = "4097158263049"
    private let layoutCredentialFixtures = [
        (
            title: "iOS layout alpha",
            username: "ios-layout-alpha@example.invalid",
            password: "5173084269517"
        ),
        (
            title: "iOS layout beta",
            username: "ios-layout-beta@example.invalid",
            password: "6824197350862"
        ),
    ]

    override func setUpWithError() throws {
        continueAfterFailure = false
        executionTimeAllowance = 600
    }

    func testFreshInstallVaultLifecycle() {
        var app = XCUIApplication()
        XCTAssertTrue(
            app.wait(for: .runningForeground, timeout: launchTimeout),
            "ChromVoid must be prelaunched by the simulator smoke runner"
        )

        createLocalVault(in: app)

        XCTContext.runActivity(named: "Unlock the new vault") { _ in
            unlockVault(with: smokePassword, in: app)
            requireFilesProductRoot(in: app)
            attachScreenshot(named: "first-unlock")
        }

        createAndVerifyCredential(in: app)
        verifyCredentialRowsDoNotOverlap(in: app)
        verifyManualLockAndUnlock(in: app)
        verifyBackgroundResumeLock(in: app)

        app = coldRelaunchLockedApp(app)

        verifyPlausibleDeniabilityAndCredentialReadback(in: app)
    }

    func testIPadVaultUnlockLifecycle() {
        var app = XCUIApplication()
        XCTAssertTrue(
            app.wait(for: .runningForeground, timeout: launchTimeout),
            "ChromVoid must be prelaunched by the simulator smoke runner"
        )
        requireIPadViewport(in: app)

        createLocalVault(in: app)

        XCTContext.runActivity(named: "Unlock the new vault on iPad") { _ in
            unlockVault(with: smokePassword, in: app)
            requireFilesProductRoot(in: app)
            attachScreenshot(named: "ipad-first-unlock")
        }

        verifyManualLockAndUnlock(in: app)
        verifyBackgroundResumeLock(in: app)
        app = coldRelaunchLockedApp(app)

        XCTContext.runActivity(named: "Unlock after a cold relaunch on iPad") { _ in
            unlockVault(with: smokePassword, in: app)
            requireFilesProductRoot(in: app)
            attachScreenshot(named: "ipad-cold-relaunch-unlocked")
        }

        verifyLandscapeLockAndUnlock(in: app)
    }

    func testPrepareFixedUpdateFixture() {
        let app = XCUIApplication()
        XCTAssertTrue(
            app.wait(for: .runningForeground, timeout: launchTimeout),
            "ChromVoid build N must be prelaunched by the simulator update runner"
        )

        createLocalVault(in: app)
        unlockVault(with: smokePassword, in: app)
        requireFilesProductRoot(in: app)
        createAndVerifyUpdateFolder(in: app)
        createAndVerifyCredential(in: app)
        lockVaultFromMobileNavigation(in: app)
        attachScreenshot(named: "update-fixture-seeded-and-locked")

        app.terminate()
        requireAppState(
            app,
            oneOf: [.notRunning],
            timeout: launchTimeout,
            description: "terminate build N after seeding the update fixture"
        )
    }

    func testAssertFixedUpdateRemainsLocked() {
        let app = XCUIApplication()
        XCTAssertTrue(
            app.wait(for: .runningForeground, timeout: launchTimeout),
            "ChromVoid build N+1 must be prelaunched for the locked-state update check"
        )

        requireUpdateUnlockState(in: app)
        app.terminate()
        requireAppState(
            app,
            oneOf: [.notRunning],
            timeout: launchTimeout,
            description: "terminate build N+1 without unlocking it"
        )
    }

    func testVerifyFixedUpdateFixture() {
        var app = XCUIApplication()
        XCTAssertTrue(
            app.wait(for: .runningForeground, timeout: launchTimeout),
            "ChromVoid build N+1 must be prelaunched by the simulator update runner"
        )

        requireUpdateUnlockState(in: app)
        unlockVault(with: smokePassword, in: app)
        verifyUpdateFixture(in: app, screenshotSuffix: "after-overlay-update")

        app.terminate()
        requireAppState(
            app,
            oneOf: [.notRunning],
            timeout: launchTimeout,
            description: "terminate build N+1 before cold relaunch"
        )
        openChromVoidFromSpringBoard()

        app = XCUIApplication()
        XCTAssertTrue(
            app.wait(for: .runningForeground, timeout: launchTimeout),
            "ChromVoid build N+1 did not return to the foreground after cold relaunch"
        )
        requireUpdateUnlockState(in: app)
        unlockVault(with: smokePassword, in: app)
        verifyUpdateFixture(in: app, screenshotSuffix: "after-cold-relaunch")

        app.terminate()
        requireAppState(
            app,
            oneOf: [.notRunning],
            timeout: launchTimeout,
            description: "terminate build N+1 after update verification"
        )
    }

    private func createLocalVault(in app: XCUIApplication) {
        XCTContext.runActivity(named: "Create a local vault") { _ in
            let localModeButton = requireButton(
                identifier: "welcome.mode.local",
                label: "Create Storage",
                in: app
            )
            attachScreenshot(named: "first-run")
            tap(localModeButton, in: app)

            requireButton(
                identifier: "welcome.create-storage",
                label: "Create Storage",
                in: app
            )
            enterSecureText(
                smokePassword,
                expectedFieldCount: 2,
                in: app
            )
            pressCurrentButton(
                identifier: "welcome.create-storage",
                label: "Create Storage",
                in: app
            )

            requireButton(
                identifier: "welcome.unlock-submit",
                label: "Unlock Vault",
                in: app
            )
            attachScreenshot(named: "storage-created")
        }
    }

    private func createAndVerifyCredential(in app: XCUIApplication) {
        XCTContext.runActivity(named: "Create a durable credential") { _ in
            openCredentialsRoot(in: app)
            createCredential(
                title: smokeCredentialTitle,
                username: smokeCredentialUsername,
                password: smokeCredentialPassword,
                in: app
            )
            requireCredentialDetailReady(in: app)
            attachScreenshot(named: "credential-created-detail")

            openCredentialsRoot(in: app)
            requireCredentialRow(in: app)
            attachScreenshot(named: "credential-created-list")
        }
    }

    private func verifyCredentialRowsDoNotOverlap(in app: XCUIApplication) {
        XCTContext.runActivity(named: "Credentials remain separated on iPhone") { _ in
            for fixture in layoutCredentialFixtures {
                openCredentialsRoot(in: app)
                createCredential(
                    title: fixture.title,
                    username: fixture.username,
                    password: fixture.password,
                    in: app
                )
            }

            openCredentialsRoot(in: app)
            let titles = [smokeCredentialTitle] + layoutCredentialFixtures.map(\.title)
            let rows = titles.map { title in
                requireUniqueHittable(
                    credentialRowQuery(title: title, in: app),
                    description: "credential row \(title)",
                    in: app
                )
            }
            let orderedRows = rows.sorted { $0.frame.minY < $1.frame.minY }

            guard orderedRows.allSatisfy({ !$0.frame.isEmpty && !$0.frame.isInfinite }) else {
                attachDiagnostics(for: app, named: "credential-rows-invalid-geometry")
                XCTFail("Credential rows must expose non-empty finite frames")
                return
            }

            for (upperRow, lowerRow) in zip(orderedRows, orderedRows.dropFirst()) {
                guard upperRow.frame.maxY <= lowerRow.frame.minY + 0.5 else {
                    attachDiagnostics(for: app, named: "credential-rows-overlap")
                    XCTFail(
                        "Credential rows overlap: \(upperRow.label) \(upperRow.frame) and " +
                            "\(lowerRow.label) \(lowerRow.frame)"
                    )
                    return
                }
            }

            attachScreenshot(named: "credential-list-separated-rows")
        }
    }

    private func createCredential(
        title: String,
        username: String,
        password: String,
        in app: XCUIApplication
    ) {
        tap(
            requireButton(
                identifier: "passwords.create-entry",
                label: "Create entry",
                in: app
            ),
            in: app
        )

        enterText(
            title,
            into: requireTextField(
                identifier: "passwords.create.title",
                label: "Title",
                placeholder: "Enter title",
                in: app
            ),
            description: "passwords.create.title",
            in: app
        )
        enterText(
            username,
            into: requireTextField(
                identifier: "passwords.create.username",
                label: "User name",
                placeholder: "Enter user name or account name",
                in: app
            ),
            description: "passwords.create.username",
            in: app
        )
        enterText(
            password,
            into: requireSecureTextField(
                identifier: "passwords.create.password",
                label: "Password",
                placeholder: "Enter password",
                in: app
            ),
            description: "passwords.create.password",
            in: app
        )

        // Credential creation is not idempotent. Activate the submit button once,
        // then wait for the persisted entry detail instead of retrying the tap.
        tap(
            requireButton(
                identifier: "passwords.create.submit",
                label: "Create entry",
                in: app
            ),
            in: app
        )
        requireButtonToDisappear(
            identifier: "passwords.create.submit",
            label: "Create entry",
            in: app
        )
    }

    private func verifyManualLockAndUnlock(in app: XCUIApplication) {
        XCTContext.runActivity(named: "Lock from the mobile navigation") { _ in
            lockVaultFromMobileNavigation(in: app)
            attachScreenshot(named: "manual-lock")

            unlockVault(with: smokePassword, in: app)
            requireFilesProductRoot(in: app)
            attachScreenshot(named: "manual-reunlock")
        }
    }

    private func verifyBackgroundResumeLock(in app: XCUIApplication) {
        XCTContext.runActivity(named: "Background and foreground lock the unlocked vault") { _ in
            requireFilesProductRoot(in: app)
            XCUIDevice.shared.press(.home)
            requireAppState(
                app,
                oneOf: [.runningBackground, .runningBackgroundSuspended],
                timeout: elementTimeout,
                description: "background after pressing Home"
            )

            openChromVoidFromSpringBoard()
            XCTAssertTrue(
                app.wait(for: .runningForeground, timeout: launchTimeout),
                "ChromVoid did not return to the foreground after backgrounding"
            )
            requireButton(
                identifier: "welcome.unlock-submit",
                label: "Unlock Vault",
                in: app
            )
            attachScreenshot(named: "background-resume-locked")

            unlockVault(with: smokePassword, in: app)
            requireFilesProductRoot(in: app)
            attachScreenshot(named: "background-resume-unlocked")
        }
    }

    private func coldRelaunchLockedApp(_ app: XCUIApplication) -> XCUIApplication {
        XCTContext.runActivity(named: "Terminate while unlocked and cold relaunch locked") { _ in
            requireFilesProductRoot(in: app)
            app.terminate()
            requireAppState(
                app,
                oneOf: [.notRunning],
                timeout: launchTimeout,
                description: "terminate before cold relaunch"
            )

            // A second XCUIApplication launch/activate leaves Tauri's WKWebView blank on
            // current iOS runtimes. Launch through SpringBoard like a user, then attach
            // a fresh XCUIApplication instance to the new process.
            openChromVoidFromSpringBoard()

            let relaunchedApp = XCUIApplication()
            XCTAssertTrue(
                relaunchedApp.wait(for: .runningForeground, timeout: launchTimeout),
                "ChromVoid did not return to the foreground after cold relaunch"
            )

            requireButton(
                identifier: "welcome.unlock-submit",
                label: "Unlock Vault",
                in: relaunchedApp
            )
            attachScreenshot(named: "cold-relaunch-locked")
            return relaunchedApp
        }
    }

    private func requireIPadViewport(in app: XCUIApplication) {
        let window = app.windows.firstMatch
        guard window.waitForExistence(timeout: elementTimeout) else {
            attachDiagnostics(for: app, named: "ipad-window-missing")
            XCTFail("ChromVoid did not expose an application window")
            return
        }

        let shortestSide = min(window.frame.width, window.frame.height)
        guard shortestSide >= 700 else {
            attachDiagnostics(for: app, named: "ipad-viewport-required")
            XCTFail("The iPad unlock smoke test requires an iPad viewport, received \(window.frame)")
            return
        }
    }

    private func verifyLandscapeLockAndUnlock(in app: XCUIApplication) {
        XCTContext.runActivity(named: "Unlock the vault in iPad landscape") { _ in
            lockVaultFromMobileNavigation(in: app)
            XCUIDevice.shared.orientation = .landscapeLeft
            requireOrientation(.landscape, in: app)

            requireButton(
                identifier: "welcome.unlock-submit",
                label: "Unlock Vault",
                in: app
            )
            attachScreenshot(named: "ipad-landscape-locked")

            unlockVault(with: smokePassword, in: app)
            requireFilesProductRoot(in: app)
            attachScreenshot(named: "ipad-landscape-unlocked")

            XCUIDevice.shared.orientation = .portrait
            requireOrientation(.portrait, in: app)
        }
    }

    private enum ExpectedOrientation {
        case landscape
        case portrait
    }

    private func requireOrientation(_ orientation: ExpectedOrientation, in app: XCUIApplication) {
        let window = app.windows.firstMatch
        let predicate = NSPredicate { _, _ in
            switch orientation {
            case .landscape:
                return window.frame.width > window.frame.height
            case .portrait:
                return window.frame.height > window.frame.width
            }
        }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: window)
        let result = XCTWaiter.wait(for: [expectation], timeout: elementTimeout)
        guard result == .completed else {
            attachDiagnostics(for: app, named: "ipad-orientation-timeout")
            XCTFail("ChromVoid did not reach the expected iPad orientation")
            return
        }
    }

    private func verifyPlausibleDeniabilityAndCredentialReadback(in app: XCUIApplication) {
        XCTContext.runActivity(named: "Alternate password opens a plausible-deniability vault") { _ in
            unlockVault(with: alternatePassword, in: app)
            requireFilesProductRoot(in: app)
            openCredentialsRoot(in: app)
            requireEmptyCredentialsState(in: app)
            assertCredentialAbsent(in: app)
            attachScreenshot(named: "alternate-password-vault-empty")
            lockVaultFromMobileNavigation(in: app)
        }

        XCTContext.runActivity(named: "Original vault restores the durable credential") { _ in
            unlockVault(with: smokePassword, in: app)
            requireFilesProductRoot(in: app)
            openCredentialsRoot(in: app)
            tap(requireCredentialRow(in: app), in: app)
            requireCredentialDetailReady(in: app)
            attachScreenshot(named: "original-credential-readback")
        }
    }

    private func createAndVerifyUpdateFolder(in app: XCUIApplication) {
        XCTContext.runActivity(named: "Create a durable folder for the update fixture") { _ in
            requireFilesProductRoot(in: app)
            tap(
                requireShadowControl(
                    app.webViews.otherElements.matching(
                        NSPredicate(format: "label == %@", "Add")
                    ),
                    description: "files.mobile-add-menu",
                    in: app
                ),
                in: app
            )
            tap(
                requireUniqueHittable(
                    app.webViews.menuItems.matching(
                        NSPredicate(format: "label == %@", "Create folder")
                    ),
                    description: "files.mobile-add-menu.create-folder",
                    in: app
                ),
                in: app
            )

            enterText(
                updateFolderName,
                into: requireTextField(
                    identifier: "files.create-folder.name",
                    label: "Folder name",
                    placeholder: "Enter folder name...",
                    in: app
                ),
                description: "files.create-folder.name",
                in: app
            )

            // Folder creation is not idempotent. Submit once, then wait for the
            // dialog to close and the persisted catalog row to appear.
            tap(
                requireButton(
                    identifier: "files.create-folder.submit",
                    label: "Create",
                    in: app
                ),
                in: app
            )
            requireButtonToDisappear(
                identifier: "files.create-folder.submit",
                label: "Create",
                in: app
            )
            requireUpdateFolder(in: app)
            attachScreenshot(named: "update-folder-created")
        }
    }

    private func requireUpdateUnlockState(in app: XCUIApplication) {
        requireButton(
            identifier: "welcome.unlock-submit",
            label: "Unlock Vault",
            in: app
        )

        let firstRunControls = buttonQuery(
            identifier: "welcome.mode.local",
            label: "Create Storage",
            in: app
        ).allElementsBoundByIndex.filter(\.exists)
        guard firstRunControls.isEmpty else {
            attachDiagnostics(for: app, named: "update-returned-to-first-run")
            XCTFail("Build N+1 returned to first-run storage creation after an overlay update")
            return
        }
        attachScreenshot(named: "update-existing-vault-locked")
    }

    private func verifyUpdateFixture(
        in app: XCUIApplication,
        screenshotSuffix: String
    ) {
        requireFilesProductRoot(in: app)
        requireUpdateFolder(in: app)
        attachScreenshot(named: "update-folder-\(screenshotSuffix)")

        openCredentialsRoot(in: app)
        tap(requireCredentialRow(in: app), in: app)
        requireCredentialDetailReady(in: app)
        attachScreenshot(named: "update-credential-\(screenshotSuffix)")
    }

    private var updateFolderName: String {
        "iOS update durability folder"
    }

    @discardableResult
    private func requireUpdateFolder(in app: XCUIApplication) -> XCUIElement {
        requireUniqueExisting(
            app.webViews.otherElements.matching(
                NSPredicate(format: "label BEGINSWITH %@", updateFolderName)
            ),
            description: "persisted update folder",
            in: app
        )
    }

    private func openCredentialsRoot(in app: XCUIApplication) {
        tap(
            requireButton(
                identifier: "app.tab.credentials",
                label: "Credentials",
                in: app
            ),
            in: app
        )
        requirePasswordsProductRoot(in: app)
        requireButton(
            identifier: "passwords.create-entry",
            label: "Create entry",
            in: app
        )
    }

    @discardableResult
    private func requireFilesProductRoot(in app: XCUIApplication) -> XCUIElement {
        requireProductRoot(
            identifier: "app.files.root",
            label: "Encrypted files & folders",
            in: app
        )
    }

    @discardableResult
    private func requirePasswordsProductRoot(in app: XCUIApplication) -> XCUIElement {
        requireProductRoot(
            identifier: "app.passwords.root",
            label: "Password manager",
            in: app
        )
    }

    private func requireProductRoot(
        identifier: String,
        label: String,
        in app: XCUIApplication
    ) -> XCUIElement {
        let predicate = NSPredicate(
            format: "identifier == %@ OR label == %@",
            identifier,
            label
        )
        return requireUniqueExisting(
            app.webViews.otherElements.matching(predicate),
            description: identifier,
            in: app
        )
    }

    @discardableResult
    private func requireCredentialRow(in app: XCUIApplication) -> XCUIElement {
        requireUniqueHittable(
            credentialRowQuery(in: app),
            description: "persisted credential row",
            in: app
        )
    }

    private func credentialRowQuery(in app: XCUIApplication) -> XCUIElementQuery {
        credentialRowQuery(title: smokeCredentialTitle, in: app)
    }

    private func credentialRowQuery(
        title: String,
        in app: XCUIApplication
    ) -> XCUIElementQuery {
        app.webViews.buttons.matching(
            NSPredicate(format: "label == %@", title)
        )
    }

    private func requireEmptyCredentialsState(in app: XCUIApplication) {
        let predicate = NSPredicate(
            format: "identifier == %@ OR label == %@",
            "passwords.empty-state",
            "Empty"
        )
        requireUniqueExisting(
            app.webViews.otherElements.matching(predicate),
            description: "passwords.empty-state",
            in: app
        )
    }

    private func assertCredentialAbsent(in app: XCUIApplication) {
        let matches = credentialRowQuery(in: app).allElementsBoundByIndex.filter(\.exists)
        guard matches.isEmpty else {
            attachDiagnostics(for: app, named: "alternate-vault-credential-present")
            XCTFail("The original-vault credential appeared in the alternate vault")
            return
        }
    }

    private func requireCredentialDetailReady(in app: XCUIApplication) {
        let usernamePredicate = NSPredicate(
            format: "identifier == %@ OR label == %@",
            "passwords.entry.username",
            smokeCredentialUsername
        )
        let username = requireUniqueExisting(
            app.webViews.staticTexts.matching(usernamePredicate),
            description: "passwords.entry.username",
            in: app
        )
        guard username.label == smokeCredentialUsername else {
            attachDiagnostics(for: app, named: "credential-username-mismatch")
            XCTFail("The persisted credential username did not match the smoke fixture")
            return
        }

        let passwordField = requireUniqueExisting(
            secureTextFieldQuery(
                identifier: "passwords.entry.password",
                label: "Password",
                placeholder: nil,
                in: app
            ),
            description: "passwords.entry.password",
            in: app
        )
        let waitResult = waitForFilledField(passwordField)
        guard waitResult == .completed else {
            attachDiagnostics(for: app, named: "credential-password-unavailable")
            XCTFail("The persisted credential password was not readable as a masked secure field")
            return
        }

        tap(
            requirePasswordToggle(in: app),
            in: app
        )
        let revealedPasswordField = requireUniqueExisting(
            app.webViews.textFields.matching(
                NSPredicate(
                    format: "identifier == %@ OR label == %@",
                    "passwords.entry.password",
                    "Password"
                )
            ),
            description: "passwords.entry.password.revealed",
            in: app
        )
        let passwordMatches =
            waitForFilledField(revealedPasswordField) == .completed &&
            (revealedPasswordField.value as? String) == smokeCredentialPassword

        tap(
            requirePasswordToggle(in: app),
            in: app
        )
        guard passwordMatches else {
            attachDiagnostics(for: app, named: "credential-password-mismatch")
            XCTFail("The persisted credential password did not match the smoke fixture")
            return
        }
    }

    private func requirePasswordToggle(in app: XCUIApplication) -> XCUIElement {
        // Current iOS WebKit exposes an aria-pressed password toggle from a
        // shadow root as a Switch but drops the internal DOM id. The detail
        // screen owns exactly one switch, so enforce that accessible-role
        // contract instead of falling back to localized text or coordinates.
        requireUniqueHittable(
            app.webViews.switches,
            description: "passwords.entry.password.toggle",
            in: app
        )
    }

    private func requireButtonToDisappear(
        identifier: String,
        label: String,
        in app: XCUIApplication
    ) {
        let waitResult = waitForButtonToDisappear(
            identifier: identifier,
            label: label,
            timeout: elementTimeout,
            in: app
        )
        guard waitResult == .completed else {
            attachDiagnostics(for: app, named: "still-present-\(identifier)")
            XCTFail("XCUI button did not disappear after activation: \(identifier)")
            return
        }
    }

    private func waitForButtonToDisappear(
        identifier: String,
        label: String,
        timeout: TimeInterval,
        in app: XCUIApplication
    ) -> XCTWaiter.Result {
        let query = buttonQuery(identifier: identifier, label: label, in: app)
        let predicate = NSPredicate { _, _ in
            query.allElementsBoundByIndex.allSatisfy { !$0.exists }
        }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: query)
        return XCTWaiter.wait(for: [expectation], timeout: timeout)
    }

    /// Waits while the button exists and is disabled, then reports whether it is gone.
    private func waitForDisabledButtonToSettle(
        identifier: String,
        label: String,
        timeout: TimeInterval,
        in app: XCUIApplication
    ) -> Bool {
        let query = buttonQuery(identifier: identifier, label: label, in: app)
        // Count through queries: reading isEnabled on a bound element fails the test
        // when the button leaves the hierarchy between snapshots.
        let disabledButtons = query.matching(NSPredicate(format: "isEnabled == false"))
        let predicate = NSPredicate { _, _ in
            disabledButtons.count == 0
        }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: query)
        _ = XCTWaiter.wait(for: [expectation], timeout: timeout)
        return query.count == 0
    }

    @discardableResult
    private func requireTextField(
        identifier: String,
        label: String,
        placeholder: String,
        in app: XCUIApplication
    ) -> XCUIElement {
        requireUniqueHittableAfterUpwardScroll(
            textFieldQuery(
                identifier: identifier,
                label: label,
                placeholder: placeholder,
                in: app
            ),
            description: identifier,
            in: app
        )
    }

    @discardableResult
    private func requireSecureTextField(
        identifier: String,
        label: String,
        placeholder: String,
        in app: XCUIApplication
    ) -> XCUIElement {
        requireUniqueHittableAfterUpwardScroll(
            secureTextFieldQuery(
                identifier: identifier,
                label: label,
                placeholder: placeholder,
                in: app
            ),
            description: identifier,
            in: app
        )
    }

    private func textFieldQuery(
        identifier: String,
        label: String,
        placeholder: String,
        in app: XCUIApplication
    ) -> XCUIElementQuery {
        let predicate = NSPredicate(
            format: "identifier == %@ OR label == %@ OR placeholderValue == %@",
            identifier,
            label,
            placeholder
        )
        return app.webViews.textFields.matching(predicate)
    }

    private func secureTextFieldQuery(
        identifier: String,
        label: String,
        placeholder: String?,
        in app: XCUIApplication
    ) -> XCUIElementQuery {
        let predicate: NSPredicate
        if let placeholder {
            predicate = NSPredicate(
                format: "identifier == %@ OR label == %@ OR placeholderValue == %@",
                identifier,
                label,
                placeholder
            )
        } else {
            predicate = NSPredicate(
                format: "identifier == %@ OR label == %@",
                identifier,
                label
            )
        }
        return app.webViews.secureTextFields.matching(predicate)
    }

    private func enterText(
        _ value: String,
        into field: XCUIElement,
        description: String,
        in app: XCUIApplication
    ) {
        guard focusTextField(field, description: description, in: app) else {
            return
        }
        performWithoutQuiescenceWait(for: app) {
            field.typeText(value)
        }

        let waitResult = waitForFilledField(field)
        guard waitResult == .completed else {
            attachDiagnostics(for: app, named: "field-did-not-fill-\(description)")
            XCTFail("XCUI field did not accept keyboard input: \(description)")
            return
        }
    }

    private func focusTextField(
        _ field: XCUIElement,
        description: String,
        in app: XCUIApplication
    ) -> Bool {
        tap(field, in: app)
        if waitForKeyboardFocus(field) == .completed {
            return true
        }

        // WKWebView can consume the first tap after an overflow scroll while it
        // transfers focus away from the previous input. Field taps are idempotent,
        // so retry once and require observable keyboard focus before typing.
        tap(field, in: app)
        if waitForKeyboardFocus(field) == .completed {
            return true
        }

        attachDiagnostics(for: app, named: "field-did-not-focus-\(description)")
        XCTFail("XCUI field did not receive keyboard focus: \(description)")
        return false
    }

    private func waitForKeyboardFocus(_ field: XCUIElement) -> XCTWaiter.Result {
        let predicate = NSPredicate(format: "hasKeyboardFocus == true")
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: field)
        return XCTWaiter.wait(for: [expectation], timeout: focusTimeout)
    }

    @discardableResult
    private func requireUniqueExisting(
        _ query: XCUIElementQuery,
        description: String,
        in app: XCUIApplication
    ) -> XCUIElement {
        let first = query.firstMatch
        guard first.waitForExistence(timeout: elementTimeout) else {
            attachDiagnostics(for: app, named: "missing-\(description)")
            XCTFail("XCUI element was unavailable: \(description)")
            return first
        }

        let matches = query.allElementsBoundByIndex.filter(\.exists)
        guard matches.count == 1 else {
            attachDiagnostics(for: app, named: "ambiguous-\(description)")
            XCTFail("Expected one XCUI element for \(description), found \(matches.count)")
            return first
        }

        return matches[0]
    }

    private func waitForFilledField(_ field: XCUIElement) -> XCTWaiter.Result {
        let predicate = NSPredicate { _, _ in
            self.fieldIsFilled(field)
        }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: field)
        return XCTWaiter.wait(for: [expectation], timeout: elementTimeout)
    }

    private func openChromVoidFromSpringBoard() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let appIcons = springboard.icons.matching(identifier: "ChromVoid")
        XCTAssertTrue(
            appIcons.firstMatch.waitForExistence(timeout: elementTimeout),
            "ChromVoid icon was not available in SpringBoard"
        )

        guard let appIcon = appIcons.allElementsBoundByIndex.first(where: \.isHittable) else {
            attachScreenshot(named: "springboard-icon-not-hittable")
            let hierarchy = XCTAttachment(string: springboard.debugDescription)
            hierarchy.name = "springboard-icon-not-hittable-accessibility-hierarchy"
            hierarchy.lifetime = .keepAlways
            add(hierarchy)
            XCTFail("No hittable ChromVoid icon was available in SpringBoard")
            return
        }

        appIcon.tap()
    }

    private func requireAppState(
        _ app: XCUIApplication,
        oneOf expectedStates: [XCUIApplication.State],
        timeout: TimeInterval,
        description: String
    ) {
        let predicate = NSPredicate { _, _ in
            expectedStates.contains(app.state)
        }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: app)
        let waitResult = XCTWaiter.wait(for: [expectation], timeout: timeout)
        XCTAssertEqual(waitResult, .completed, "ChromVoid did not reach expected state: \(description)")
    }

    private func lockVaultFromMobileNavigation(in app: XCUIApplication) {
        tap(
            requireButton(
                identifier: "app.navigation.menu",
                label: "Open menu",
                in: app
            ),
            in: app
        )
        tap(
            requireButton(
                identifier: "app.vault.lock",
                label: "Lock",
                labelComparison: "BEGINSWITH",
                in: app
            ),
            in: app
        )
        requireButton(
            identifier: "welcome.unlock-submit",
            label: "Unlock Vault",
            in: app
        )
    }

    @discardableResult
    private func requireButton(
        identifier: String,
        label: String,
        labelComparison: String = "==",
        in app: XCUIApplication
    ) -> XCUIElement {
        requireUniqueHittable(
            buttonQuery(
                identifier: identifier,
                label: label,
                labelComparison: labelComparison,
                in: app
            ),
            description: identifier,
            in: app
        )
    }

    private func buttonQuery(
        identifier: String,
        label: String,
        labelComparison: String = "==",
        in app: XCUIApplication
    ) -> XCUIElementQuery {
        // WKWebView on current iOS runtimes does not promote DOM ids to
        // XCUIElement.identifier. Keep the identifier branch for runtimes that do,
        // and use the fresh-install English accessible name as a bounded fallback.
        let predicate = NSPredicate(
            format: "identifier == %@ OR label \(labelComparison) %@",
            identifier,
            label
        )
        return app.webViews.buttons.matching(predicate)
    }

    private func pressCurrentButton(
        identifier: String,
        label: String,
        in app: XCUIApplication
    ) {
        let query = buttonQuery(identifier: identifier, label: label, in: app)
        let button = query.firstMatch
        guard button.waitForExistence(timeout: elementTimeout), button.isEnabled else {
            attachDiagnostics(for: app, named: "missing-\(identifier)")
            XCTFail("XCUI button was unavailable: \(identifier)")
            return
        }

        // The first tap on a web button covered by the software keyboard only
        // scrolls it into view on current iOS WebKit. Resolve the AX node again
        // and activate it once it is hittable; skip the retry if action started.
        tap(button, in: app)

        let currentButton = query.firstMatch
        guard currentButton.exists, currentButton.isEnabled else { return }
        let hittableButton = requireUniqueHittable(
            query,
            description: identifier,
            in: app
        )
        hittableButton.tap()
    }

    @discardableResult
    private func requireUniqueHittable(
        _ query: XCUIElementQuery,
        description: String,
        in app: XCUIApplication
    ) -> XCUIElement {
        let first = query.firstMatch
        let waitResult = waitForHittableCount(1, in: query)
        guard waitResult == .completed else {
            attachDiagnostics(for: app, named: "missing-\(description)")
            XCTFail("XCUI control was not hittable: \(description)")
            return first
        }

        let matches = query.allElementsBoundByIndex.filter(\.isHittable)
        guard matches.count == 1 else {
            attachDiagnostics(for: app, named: "ambiguous-\(description)")
            XCTFail("Expected one hittable XCUI control for \(description), found \(matches.count)")
            return first
        }

        return matches[0]
    }

    @discardableResult
    private func requireShadowControl(
        _ query: XCUIElementQuery,
        description: String,
        in app: XCUIApplication
    ) -> XCUIElement {
        // Current iOS WebKit can flatten a shadow-DOM control into nested AX
        // nodes with the same label and frame. Treat that cluster as one control,
        // while preserving the ambiguity failure for distinct on-screen controls.
        let first = query.firstMatch
        let predicate = NSPredicate { _, _ in
            query.allElementsBoundByIndex.contains(where: \.isHittable)
        }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: query)
        guard XCTWaiter.wait(for: [expectation], timeout: elementTimeout) == .completed else {
            attachDiagnostics(for: app, named: "missing-\(description)")
            XCTFail("XCUI shadow control was not hittable: \(description)")
            return first
        }

        let matches = query.allElementsBoundByIndex.filter(\.isHittable)
        guard let control = matches.first else {
            attachDiagnostics(for: app, named: "missing-\(description)")
            XCTFail("XCUI shadow control disappeared: \(description)")
            return first
        }

        guard matches.dropFirst().allSatisfy({ $0.frame == control.frame }) else {
            attachDiagnostics(for: app, named: "ambiguous-\(description)")
            XCTFail("Expected one hittable XCUI control cluster for \(description)")
            return control
        }

        return control
    }

    @discardableResult
    private func requireUniqueHittableAfterUpwardScroll(
        _ query: XCUIElementQuery,
        description: String,
        in app: XCUIApplication
    ) -> XCUIElement {
        let existing = requireUniqueExisting(query, description: description, in: app)
        if existing.isHittable {
            return existing
        }

        let webView = app.webViews.firstMatch
        guard webView.exists else {
            attachDiagnostics(for: app, named: "missing-webview-\(description)")
            XCTFail("XCUI could not reveal \(description) because the WebView was unavailable")
            return existing
        }

        // The mobile create form owns a native overflow scroller. With the software
        // keyboard open, its sticky submit footer can cover the next field. A bounded
        // user-style swipe reveals the field without coordinates or a test-only hook.
        for _ in 0..<3 {
            performWithoutQuiescenceWait(for: app) {
                webView.swipeUp()
            }

            let matches = query.allElementsBoundByIndex.filter(\.isHittable)
            if matches.count == 1 {
                return matches[0]
            }
            if matches.count > 1 {
                attachDiagnostics(for: app, named: "ambiguous-\(description)")
                XCTFail("Expected one hittable XCUI control for \(description), found \(matches.count)")
                return matches[0]
            }
        }

        attachDiagnostics(for: app, named: "covered-\(description)")
        XCTFail("XCUI control remained covered after bounded upward scrolling: \(description)")
        return query.firstMatch
    }

    private func enterSecureText(
        _ value: String,
        expectedFieldCount: Int,
        in app: XCUIApplication
    ) {
        let query = app.webViews.secureTextFields
        let waitResult = waitForHittableCount(expectedFieldCount, in: query)
        guard waitResult == .completed else {
            attachDiagnostics(for: app, named: "missing-secure-fields")
            XCTFail("Expected \(expectedFieldCount) hittable secure text fields")
            return
        }

        guard waitForFilledSecureFieldCount(0, in: query) == .completed else {
            attachDiagnostics(for: app, named: "secure-fields-did-not-reset")
            XCTFail("Secure text fields did not reset before keyboard input")
            return
        }

        let initialFields = query.allElementsBoundByIndex.filter(\.isHittable)
        guard initialFields.count == expectedFieldCount else {
            attachDiagnostics(for: app, named: "unexpected-secure-field-count")
            XCTFail("Expected \(expectedFieldCount) secure fields, found \(initialFields.count)")
            return
        }

        for filledCount in 1...expectedFieldCount {
            let fields = query.allElementsBoundByIndex.filter(\.isHittable)
            guard let field = fields.first(where: { !fieldIsFilled($0) }) else {
                attachDiagnostics(for: app, named: "missing-empty-secure-field")
                XCTFail("Unable to find the next empty secure field")
                return
            }

            guard focusTextField(
                field,
                description: "secure-field-\(filledCount)-of-\(expectedFieldCount)",
                in: app
            ) else { return }
            performWithoutQuiescenceWait(for: app) {
                field.typeText(value)
            }

            let fillResult = waitForFilledSecureFieldCount(filledCount, in: query)
            guard fillResult == .completed else {
                attachDiagnostics(for: app, named: "secure-field-did-not-fill")
                XCTFail("Secure field \(filledCount) did not accept keyboard input")
                return
            }
        }
    }

    private func fieldIsFilled(_ field: XCUIElement) -> Bool {
        guard let value = field.value as? String, !value.isEmpty else { return false }
        return value != field.placeholderValue
    }

    private func waitForFilledSecureFieldCount(
        _ expectedCount: Int,
        in query: XCUIElementQuery
    ) -> XCTWaiter.Result {
        let predicate = NSPredicate { _, _ in
            query.allElementsBoundByIndex.filter { self.fieldIsFilled($0) }.count == expectedCount
        }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: query)
        return XCTWaiter.wait(for: [expectation], timeout: elementTimeout)
    }

    private func waitForHittableCount(
        _ expectedCount: Int,
        in query: XCUIElementQuery
    ) -> XCTWaiter.Result {
        let predicate = NSPredicate { _, _ in
            query.allElementsBoundByIndex.filter(\.isHittable).count == expectedCount
        }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: query)
        return XCTWaiter.wait(for: [expectation], timeout: elementTimeout)
    }

    private func unlockVault(with password: String, in app: XCUIApplication) {
        requireButton(
            identifier: "welcome.unlock-submit",
            label: "Unlock Vault",
            in: app
        )
        enterSecureText(
            password,
            expectedFieldCount: 1,
            in: app
        )
        submitUnlockPassword(password, in: app)
    }

    private func submitUnlockPassword(_ password: String, in app: XCUIApplication) {
        pressCurrentButton(
            identifier: "welcome.unlock-submit",
            label: "Unlock Vault",
            in: app
        )
        if waitForButtonToDisappear(
            identifier: "welcome.unlock-submit",
            label: "Unlock Vault",
            timeout: focusTimeout,
            in: app
        ) == .completed {
            return
        }

        // The vault KDF can outlast focusTimeout in a debug Simulator build. The submit
        // button stays disabled while vault:unlock runs, so let an in-flight unlock
        // finish before treating the submit as lost.
        if waitForDisabledButtonToSettle(
            identifier: "welcome.unlock-submit",
            label: "Unlock Vault",
            timeout: elementTimeout,
            in: app
        ) {
            return
        }

        // iOS WebKit can occasionally update the native SecureTextField value
        // without delivering the corresponding input event through the custom
        // element. An empty submit is side-effect free and re-renders the required
        // validation state with a cleared field, so retry that bounded case once.
        enterSecureText(
            password,
            expectedFieldCount: 1,
            in: app
        )
        pressCurrentButton(
            identifier: "welcome.unlock-submit",
            label: "Unlock Vault",
            in: app
        )
        guard waitForButtonToDisappear(
            identifier: "welcome.unlock-submit",
            label: "Unlock Vault",
            timeout: elementTimeout,
            in: app
        ) == .completed else {
            attachDiagnostics(for: app, named: "unlock-form-did-not-submit")
            XCTFail("The unlock form did not accept secure keyboard input after one retry")
            return
        }
    }

    private func tap(_ element: XCUIElement, in app: XCUIApplication) {
        performWithoutQuiescenceWait(for: app) {
            element.tap()
        }
    }

    private func performWithoutQuiescenceWait(
        for app: XCUIApplication,
        block: @escaping InteractionBlock
    ) {
        // Tao keeps the iOS application run loop active even when the UI is ready.
        // Limit XCTest's private skip-pre/post-quiescence option to the UI test;
        // production code and the app-under-test receive no test hook.
        let selector = NSSelectorFromString("_performWithInteractionOptions:block:")
        guard app.responds(to: selector) else {
            XCTFail("This XCTest runtime cannot bypass Tauri event-loop quiescence waits")
            return
        }

        let implementation = app.method(for: selector)
        let perform = unsafeBitCast(implementation, to: PerformWithInteractionOptions.self)
        let skipPreAndPostQuiescence: UInt = (1 << 0) | (1 << 1)
        perform(app, selector, skipPreAndPostQuiescence, block)
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func attachDiagnostics(for app: XCUIApplication, named name: String) {
        attachScreenshot(named: name)

        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "\(name)-accessibility-hierarchy"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
    }
}
