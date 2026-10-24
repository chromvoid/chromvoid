import ChromVoidBridge
import Foundation
import SwiftUI
import XCTest

@testable import AirPresentation

@MainActor
final class AccessModelTests: XCTestCase {
  func testBrandUnlockMotionCompletesWhenAuthorityArrivesBeforeSubmitReturns() async throws {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    context.runtime.delayUnlockReturn = true
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked && context.runtime.hasEventListener }
    XCTAssertNil(model.brandUnlockMotion)
    model.password = "synthetic-vault"
    model.submit()
    let started = try XCTUnwrap(model.brandUnlockMotion)
    XCTAssertTrue(model.busy)
    XCTAssertNil(started.completedAt)
    await settled { model.phase == .unlocked && context.runtime.unlockReturnPending }
    let completed = try XCTUnwrap(model.brandUnlockMotion)
    XCTAssertTrue(model.busy, "An authority event can precede the submitted operation’s return")
    XCTAssertEqual(completed.startedAt, started.startedAt)
    XCTAssertNotNil(completed.completedAt)
    context.runtime.finishUnlock()
    await settled { !model.busy }
    XCTAssertEqual(model.brandUnlockMotion?.completedAt, completed.completedAt)
    model.sceneInactive()
    model.sceneActive(protectedDataAvailable: true)
    XCTAssertEqual(model.brandUnlockMotion?.completedAt, completed.completedAt)
    model.lock()
    XCTAssertNil(model.brandUnlockMotion)
  }

  func testBrandUnlockMotionStopsOnAnOrdinaryOperationError() async throws {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    context.runtime.delayUnlock = true
    context.runtime.unlockError = try rpcError("SYNTHETIC_OPERATION_FAILURE")
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.password = "synthetic-vault"
    model.submit()
    await settled { context.runtime.unlockPending }
    XCTAssertNotNil(model.brandUnlockMotion)
    context.runtime.finishUnlock()
    await settled { !model.busy }
    XCTAssertEqual(model.phase, .locked)
    XCTAssertEqual(model.issue, .operation)
    XCTAssertNil(model.brandUnlockMotion)
  }

  func testBootstrapFailureDoesNotClaimTheDeviceIsLocked() async {
    let context = Context()
    defer { context.shutdown() }
    let model = AccessModel(preferences: context.preferences) {
      throw BridgeError.InvalidStorageRoot
    }
    defer { model.shutdown() }
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .unavailable }
    XCTAssertEqual(model.issue, .operation)
    XCTAssertNil(model.credentials)
    model.retry()
    await settled { model.phase == .unavailable }
    XCTAssertEqual(model.issue, .operation)
  }

  func testOrdinaryCatalogLoadingErrorAndLockRendering() async throws {
    let context = Context()
    defer { context.shutdown() }
    let requested = expectation(description: "catalog request pending")
    var response: CheckedContinuation<Void, Never>?
    context.runtime.readCredentialPage = { _ in
      await withCheckedContinuation {
        response = $0
        requested.fulfill()
      }
      throw CredentialStoreError.invalidPage
    }
    defer { response?.resume() }
    let access = context.model
    access.sceneActive(protectedDataAvailable: true)
    await settled { access.phase == .locked }
    access.password = "synthetic-vault"
    access.submit()
    await fulfillment(of: [requested], timeout: 2)
    let catalog = try XCTUnwrap(access.credentials)
    XCTAssertEqual(catalog.state, .loading)

    let appearance = AppearancePreferences(defaults: context.preferences)
    appearance.setLanguage(.english)
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    let previous = scene.windows.first(where: \.isKeyWindow)
    let window = UIWindow(windowScene: scene)
    window.frame = scene.coordinateSpace.bounds
    let appeared = expectation(description: "native root appeared")
    // The unit-test host does not supply the product scene's active lifecycle.
    let host = AccessPreviewHost(
      rootView: AirRootView(model: access, appearance: appearance).environment(
        \.scenePhase, .active))
    host.appeared = { appeared.fulfill() }
    window.rootViewController = host
    window.makeKeyAndVisible()
    defer {
      window.isHidden = true
      previous?.makeKeyAndVisible()
    }
    await fulfillment(of: [appeared], timeout: 2)
    func capture(_ name: String) {
      host.view.frame = window.bounds
      host.view.layoutIfNeeded()
      let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
        window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
      }
      let attachment = XCTAttachment(image: image)
      attachment.name = name
      attachment.lifetime = .keepAlways
      add(attachment)
    }
    capture("Catalog loading with native navigation")
    response?.resume()
    response = nil
    await settled { catalog.state == .failed }
    XCTAssertEqual(access.phase, .unlocked)
    XCTAssertTrue(access.credentials === catalog)
    capture("Catalog error with retry and native navigation")
    access.lock()
    await settled { access.phase == .locked && !access.privacyCovered }
    XCTAssertNil(access.credentials)
    XCTAssertEqual(catalog.state, .revoked)
    capture("Locked root after catalog failure")
  }

  func testAutoLockConfiguresBeforeUnlockAndPersistsOnlyAcceptedChoices() async throws {
    let context = Context()
    defer { context.shutdown() }
    context.preferences.set(300, forKey: "air.auto-lock.seconds")
    let model = context.model
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    XCTAssertEqual(model.autoLockTimeout, .fiveMinutes)
    XCTAssertEqual(context.runtime.autoLockConfigurations.map(\.seconds), [300])
    model.setAutoLockTimeout(.oneMinute)
    XCTAssertEqual(model.autoLockTimeout, .fiveMinutes)
    model.password = "synthetic-vault"
    model.submit()
    await settled { model.phase == .unlocked && !model.busy }
    XCTAssertEqual(context.runtime.autoLockConfigurations.map(\.seconds), [300])
    context.runtime.autoLockError = BridgeError.RuntimeUnavailable
    model.setAutoLockTimeout(.oneMinute)
    XCTAssertEqual(model.autoLockTimeout, .fiveMinutes)
    XCTAssertEqual(context.preferences.integer(forKey: "air.auto-lock.seconds"), 300)
    XCTAssertEqual(model.issue, .operation)
    context.runtime.autoLockError = nil
    model.setAutoLockTimeout(.oneMinute)
    XCTAssertEqual(model.autoLockTimeout, .oneMinute)
    XCTAssertEqual(context.preferences.integer(forKey: "air.auto-lock.seconds"), 60)
    XCTAssertNil(model.issue)
    model.sceneInactive()
    model.sceneActive(protectedDataAvailable: true)
    XCTAssertEqual(context.runtime.autoLockConfigurations.map(\.seconds), [300, 60])
  }

  func testOnlyForegroundUnlockedInputReportsActivityAndLateInputReconcilesLock() async throws {
    let context = Context()
    defer { context.shutdown() }
    context.preferences.set(60, forKey: "air.auto-lock.seconds")
    let model = context.model
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.recordUserActivity()
    XCTAssertTrue(context.runtime.activityGenerations.isEmpty)
    model.password = "synthetic-vault"
    model.submit()
    await settled { model.phase == .unlocked && !model.busy }
    XCTAssertTrue(context.runtime.activityGenerations.isEmpty)
    model.recordUserActivity()
    XCTAssertEqual(context.runtime.activityGenerations, [context.runtime.state.generation])
    model.sceneInactive()
    model.recordUserActivity()
    XCTAssertEqual(context.runtime.activityGenerations.count, 1)
    model.sceneActive(protectedDataAvailable: true)
    // Expiry can precede delivery of the corresponding lifecycle event.
    _ = try context.runtime.lock()
    model.recordUserActivity()
    XCTAssertEqual(model.phase, .locked)
    XCTAssertNil(model.credentials)
    XCTAssertEqual(context.runtime.activityGenerations.count, 1)
  }

  func testDisabledAutoLockDoesNotReportInputOrWeakenBackgroundLock() async throws {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.password = "synthetic-vault"
    model.submit()
    await settled { model.phase == .unlocked && !model.busy }
    model.recordUserActivity()
    XCTAssertTrue(context.runtime.activityGenerations.isEmpty)
    model.setLockOnBackgroundEnabled(true)
    defer { model.setLockOnBackgroundEnabled(false) }
    model.setLockOnBackgroundEnabled(true)
    model.sceneBackground()
    XCTAssertEqual(context.runtime.state.phase, .inactive)
    XCTAssertNil(model.credentials)
  }

  func testAutoLockBootstrapFailureClosesRuntimeBeforeAllowingAccess() async throws {
    let context = Context()
    defer { context.shutdown() }
    context.runtime.autoLockError = BridgeError.RuntimeUnavailable
    context.model.sceneActive(protectedDataAvailable: true)
    await settled { context.model.phase == .unavailable }
    XCTAssertEqual(context.runtime.state.phase, .closed)
    XCTAssertTrue(context.runtime.unlockPasswords.isEmpty)
  }

  func testScreenAwakeIsOptInAndRestoresOnlyAfterUnlock() async throws {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.setKeepScreenAwakeEnabled(true)
    XCTAssertFalse(model.keepScreenAwakeEnabled)
    XCTAssertFalse(context.screenAwake.awake)
    model.password = "synthetic-vault"
    model.submit()
    await settled { model.phase == .unlocked && !model.busy }
    XCTAssertFalse(context.screenAwake.awake)
    model.setKeepScreenAwakeEnabled(true)
    XCTAssertTrue(context.screenAwake.awake)
    model.sceneInactive()
    XCTAssertFalse(context.screenAwake.awake)
    model.sceneActive(protectedDataAvailable: true)
    XCTAssertTrue(context.screenAwake.awake)
    model.setKeepScreenAwakeEnabled(false)
    XCTAssertFalse(context.screenAwake.awake)
    model.setKeepScreenAwakeEnabled(true)
    model.shutdown()
    XCTAssertFalse(context.screenAwake.awake)
    let relaunched = AccessModel(preferences: context.preferences, screenAwake: context.screenAwake)
    XCTAssertTrue(relaunched.keepScreenAwakeEnabled)
    XCTAssertFalse(context.screenAwake.awake)
    relaunched.shutdown()
  }

  func testScreenAwakeStopsImmediatelyWhenAccessEnds() async throws {
    let transitions: [(String, (AccessModel) -> Void)] = [
      ("lock", { $0.lock() }),
      (
        "background",
        {
          $0.setLockOnBackgroundEnabled(true)
          $0.sceneBackground()
          $0.setLockOnBackgroundEnabled(false)
        }
      ),
      ("protected data unavailable", { $0.protectedDataLost() }),
      ("shutdown", { $0.shutdown() }),
    ]
    for (name, transition) in transitions {
      let context = Context()
      defer { context.shutdown() }
      let model = context.model
      model.sceneActive(protectedDataAvailable: true)
      await settled { model.phase == .locked }
      model.password = "synthetic-vault"
      model.submit()
      await settled { model.phase == .unlocked && !model.busy }
      model.setKeepScreenAwakeEnabled(true)
      XCTAssertTrue(context.screenAwake.awake)
      transition(model)
      XCTAssertFalse(context.screenAwake.awake, name)
      XCTAssertTrue(
        model.keepScreenAwakeEnabled,
        "Keep the preference for the next authorized foreground session")
    }
  }

  func testEraseKeepsProgressAcrossGenerationRevocationAndUsesTheActualReceipt() async throws {
    let context = Context()
    defer { context.shutdown() }
    let access = context.model
    access.sceneActive(protectedDataAvailable: true)
    await settled { access.phase == .locked }
    context.runtime.eraseStore.commitGate.enabled = true
    access.openMaintenance(.erase)
    guard case .erase(let erase) = access.maintenance else { return XCTFail("Erase route missing") }
    await settled { erase.state == .ready }
    erase.acknowledge(true)
    erase.changePassword("administrator")
    let task = try XCTUnwrap(erase.submit())
    await context.runtime.eraseStore.commitGate.wait()
    context.runtime.state = AirSnapshot(
      generation: 2, sequence: 10, phase: .locked,
      cleanupPending: false, masterConfigured: false)
    context.runtime.deliverEvent(context.runtime.state)
    await settled { access.phase == .welcome }
    XCTAssertEqual(access.maintenance?.id, ObjectIdentifier(erase))
    XCTAssertEqual(erase.state, .committing)
    XCTAssertTrue(erase.password.isEmpty)
    context.runtime.eraseStore.commitGate.release()
    await task.value
    XCTAssertNil(access.maintenance)
    XCTAssertEqual(access.eraseOutcome, .completed)
    XCTAssertTrue(access.eraseOutcomePresented)
    XCTAssertTrue(context.runtime.setupPasswords.isEmpty && context.runtime.unlockPasswords.isEmpty)
    access.dismissEraseOutcome()
    XCTAssertNil(access.eraseOutcome)
  }

  func testEraseReceiptWaitsBehindPrivacyCoverAfterBackgroundClosesTheScreen() async throws {
    let context = Context()
    defer { context.shutdown() }
    let access = context.model
    access.sceneActive(protectedDataAvailable: true)
    await settled { access.phase == .locked }
    context.runtime.eraseStore.commitGate.enabled = true
    context.runtime.eraseStore.result = .success(
      .incomplete(keyCleanupFailed: true, hostCleanupFailed: false))
    access.openMaintenance(.erase)
    guard case .erase(let erase) = access.maintenance else { return XCTFail("Erase route missing") }
    await settled { erase.state == .ready }
    erase.acknowledge(true)
    erase.changePassword("administrator")
    let task = try XCTUnwrap(erase.submit())
    await context.runtime.eraseStore.commitGate.wait()
    access.setLockOnBackgroundEnabled(true)
    access.sceneBackground()
    XCTAssertNil(access.maintenance)
    XCTAssertEqual(erase.state, .revoked)
    context.runtime.eraseStore.commitGate.release()
    await task.value
    XCTAssertEqual(access.eraseOutcome, .incomplete)
    XCTAssertFalse(access.eraseOutcomePresented)
    access.dismissEraseOutcome()
    XCTAssertEqual(access.eraseOutcome, .incomplete)
    access.sceneActive(protectedDataAvailable: true)
    await settled { access.phase == .locked }
    XCTAssertTrue(access.eraseOutcomePresented)
  }

  func testFirstLaunchRestoreDoesNotSetUpOrUnlockAndReturnsToVaultEntry() async throws {
    let context = Context(configured: false)
    defer { context.shutdown() }
    let access = context.model
    access.sceneActive(protectedDataAvailable: true)
    await settled { access.phase == .welcome }
    access.openMaintenance(.backup)
    XCTAssertNil(access.maintenance)
    access.openMaintenance(.restore)
    guard case .restore(let restore) = access.maintenance else {
      return XCTFail("Restore route missing")
    }
    access.password = "do not configure"
    access.confirmation = access.password
    access.submit()
    XCTAssertTrue(context.runtime.setupPasswords.isEmpty)
    restore.selectDirectory(URL(fileURLWithPath: "/synthetic-backup"))
    restore.changePassword("source administrator")
    await restore.submit()?.value
    XCTAssertEqual(restore.state, .review)
    await restore.confirmRestore()?.value
    XCTAssertEqual(restore.state, .completed)
    XCTAssertEqual(access.phase, .locked)
    XCTAssertTrue(context.runtime.unlockPasswords.isEmpty)
    XCTAssertTrue(context.runtime.setupPasswords.isEmpty)
    access.closeMaintenance()
    XCTAssertNil(access.maintenance)
    XCTAssertEqual(restore.state, .revoked)
  }

  func testClosingReviewedRestoreWaitsForCleanupWithoutBlockingCoreRevocation() async throws {
    let context = Context(configured: false)
    defer { context.shutdown() }
    let access = context.model
    access.sceneActive(protectedDataAvailable: true)
    await settled { access.phase == .welcome }
    access.openMaintenance(.restore)
    guard case .restore(let restore) = access.maintenance else {
      return XCTFail("Restore route missing")
    }
    restore.selectDirectory(URL(fileURLWithPath: "/synthetic-backup"))
    restore.changePassword("source administrator")
    await restore.submit()?.value
    let review = try XCTUnwrap(context.runtime.maintenanceProbe.review)
    review.closeGate.enabled = true
    access.closeMaintenance()
    await review.closeGate.wait()
    XCTAssertNotNil(access.maintenance)
    XCTAssertEqual(restore.state, .cancelling)
    access.closeMaintenance()
    XCTAssertNotNil(access.maintenance)
    _ = try context.runtime.lock()
    await settled { access.maintenance == nil }
    review.closeGate.release()
    await settled { restore.state == .revoked }
    XCTAssertEqual(review.commits, 0)
    XCTAssertEqual(review.closes, 1)
  }

  func testMaintenanceDismissalPreservesSearchAndBackgroundClearsPasswords() async throws {
    let context = Context()
    defer { context.shutdown() }
    let access = context.model
    access.sceneActive(protectedDataAvailable: true)
    await settled { access.phase == .locked }
    access.password = "vault"
    access.submit()
    await settled { access.phase == .unlocked }
    let credentials = try XCTUnwrap(access.credentials)
    credentials.search("saved query")
    access.openMaintenance(.backup)
    guard case .backup(let backup) = access.maintenance else {
      return XCTFail("Backup route missing")
    }
    backup.changePassword("draft")
    access.closeMaintenance()
    XCTAssertTrue(backup.password.isEmpty)
    XCTAssertEqual(credentials.query, "saved query")
    access.openMaintenance(.administratorPassword)
    guard case .password(let password) = access.maintenance else {
      return XCTFail("Password route missing")
    }
    XCTAssertEqual(password.kind, .administrator)
    password.change(.current, value: "old")
    password.change(.newPassword, value: "new")
    access.setLockOnBackgroundEnabled(true)
    access.sceneBackground()
    XCTAssertNil(access.maintenance)
    XCTAssertEqual(password.state, .revoked)
    XCTAssertTrue(password.currentPassword.isEmpty && password.newPassword.isEmpty)
    access.openMaintenance(.restore)
    XCTAssertNil(access.maintenance)
  }

  func testConnectionsAreAvailableLockedAndDismissingThePageDoesNotStopHost() async throws {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked && model.connections?.state == .ready }
    model.openConnections()
    XCTAssertTrue(model.connectionsPresented)
    let connections = try XCTUnwrap(model.connections)
    model.connectionsPresented = false
    XCTAssertTrue(model.connections === connections)
    XCTAssertEqual(context.runtime.hostStore.stops, 0)
    XCTAssertEqual(context.runtime.hostStore.starts, 0)
    model.setLockOnBackgroundEnabled(true)
    model.sceneBackground()
    XCTAssertNil(connections.snapshot)
    XCTAssertEqual(connections.state, .suspended)
    model.sceneActive(protectedDataAvailable: true)
    await settled { connections.state == .ready }
    XCTAssertFalse(connections.vaultOpen)
    XCTAssertTrue(model.connections === connections)
  }

  func testWalletScreenLivesFromUnlockPreservesVaultSearchAndIsRevokedInBackground() async throws {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.openWallet()
    XCTAssertNil(model.wallet)
    model.password = "synthetic-vault"
    model.submit()
    await settled { model.phase == .unlocked && !model.busy }
    // The wallet model exists from unlock and loads before its screen is ever pushed.
    let credentials = try XCTUnwrap(model.credentials)
    let wallet = try XCTUnwrap(model.wallet)
    await settled { wallet.state == .ready }
    XCTAssertFalse(model.walletPresented)
    credentials.search("kept query")
    model.openWallet()
    XCTAssertTrue(model.walletPresented && model.wallet === wallet)
    model.closeWallet()
    XCTAssertFalse(model.walletPresented)
    XCTAssertTrue(model.wallet === wallet)
    XCTAssertEqual(credentials.query, "kept query")
    model.openWallet()
    model.setLockOnBackgroundEnabled(true)
    model.sceneBackground()
    XCTAssertFalse(model.walletPresented)
    XCTAssertNil(model.wallet)
    XCTAssertEqual(wallet.state, .revoked)
    XCTAssertNil(wallet.status)
  }

  func testAutoFillRouteSurvivesSettingsButClearsItsSnapshotOnBackground() async throws {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.password = "synthetic-vault"
    model.submit()
    await settled { model.phase == .unlocked && !model.busy }
    model.openAutoFill()
    let setup = try XCTUnwrap(model.autoFill)
    model.sceneInactive()
    XCTAssertEqual(setup.state, .suspended)
    model.setLockOnBackgroundEnabled(true)
    model.sceneBackground()
    XCTAssertTrue(model.autoFill === setup)
    XCTAssertNil(setup.status)
    XCTAssertEqual(model.phase, .locked)
    model.sceneActive(protectedDataAvailable: true)
    XCTAssertTrue(model.autoFill === setup)
    await settled { setup.state == .failed }
    model.closeAutoFill()
    XCTAssertNil(model.autoFill)
    XCTAssertEqual(model.phase, .locked)
  }

  func testPasskeysReturnPreservesCatalogAndLockRevokesChild() async {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    model.openPasskeys()
    XCTAssertNil(model.passkeys)
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.password = "synthetic-vault"
    model.submit()
    await settled { model.phase == .unlocked && !model.busy }
    let catalog = model.credentials
    catalog?.search("keep this search")
    model.openPasskeys()
    let first = model.passkeys
    XCTAssertNotNil(first)
    model.sceneInactive()
    XCTAssertTrue(model.privacyCovered)
    XCTAssertTrue(model.passkeys === first)
    model.sceneActive(protectedDataAvailable: true)
    XCTAssertTrue(model.passkeys === first)
    model.closePasskeys()
    XCTAssertEqual(first?.state, .revoked)
    XCTAssertTrue(model.credentials === catalog)
    XCTAssertEqual(catalog?.query, "keep this search")
    model.openPasskeys()
    let second = model.passkeys
    XCTAssertNotNil(second)
    model.lock()
    XCTAssertEqual(second?.state, .revoked)
    XCTAssertNil(model.passkeys)
    model.openPasskeys()
    XCTAssertNil(model.passkeys)
  }

  func testEmptyAndMismatchedSetupStayLocalThenSetupReturnsToVaultPassword() async throws {
    let context = Context(configured: false)
    defer { context.shutdown() }
    let model = context.model
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .welcome }
    model.continueWelcome()
    XCTAssertEqual(model.phase, .setup)
    model.submit()
    XCTAssertEqual(model.invalidField, .password)
    XCTAssertEqual(model.issue, .passwordRequired)
    XCTAssertEqual(context.runtime.setupPasswords, [])
    model.password = "synthetic-admin"
    model.confirmation = "different"
    model.submit()
    XCTAssertEqual(model.invalidField, .confirmation)
    XCTAssertEqual(model.issue, .mismatch)
    model.confirmation = "synthetic-admin"
    model.submit()
    XCTAssertEqual(model.password, "")
    XCTAssertEqual(model.confirmation, "")
    await settled { model.phase == .locked && !model.busy }
    XCTAssertEqual(context.runtime.setupPasswords, ["synthetic-admin"])
    XCTAssertEqual(context.runtime.unlockPasswords, [])
  }

  func testBackgroundRevokesBeforeDelayedUnlockCanPublishAndClearsFields() async throws {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    context.runtime.delayUnlock = true
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.password = "synthetic-vault"
    model.submit()
    await settled { context.runtime.unlockPending }
    XCTAssertNotNil(model.brandUnlockMotion)
    let generation = context.runtime.state.generation
    model.sceneInactive()
    XCTAssertTrue(model.privacyCovered)
    context.clipboard.copy("explicit export")
    model.setLockOnBackgroundEnabled(true)
    model.sceneBackground()
    XCTAssertEqual(context.clipboard.value, "explicit export")
    XCTAssertGreaterThan(context.runtime.state.generation, generation)
    XCTAssertEqual(model.password, "")
    XCTAssertEqual(model.confirmation, "")
    XCTAssertFalse(model.busy)
    XCTAssertNil(model.brandUnlockMotion)
    context.runtime.finishUnlock()
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    XCTAssertNotEqual(model.phase, .unlocked)
    XCTAssertFalse(model.privacyCovered)
  }

  func testInactiveSystemDialogCoversWithoutRevokingButProtectedDataLossLocks() async {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.password = "synthetic-vault"
    model.submit()
    await settled { model.phase == .unlocked && !model.busy }
    let credentials = model.credentials
    XCTAssertNotNil(credentials)
    credentials?.beginCreation()
    let draft = credentials?.creation
    draft?.change(.password, to: "synthetic transient draft")
    let generation = context.runtime.state.generation
    model.sceneInactive()
    XCTAssertTrue(model.privacyCovered)
    XCTAssertEqual(context.runtime.state.generation, generation)
    model.sceneActive(protectedDataAvailable: true)
    XCTAssertEqual(model.phase, .unlocked)
    context.clipboard.copy("explicit export")
    model.protectedDataLost()
    XCTAssertNil(context.clipboard.value)
    XCTAssertNil(model.credentials)
    XCTAssertEqual(credentials?.state, .revoked)
    XCTAssertNil(credentials?.creation)
    XCTAssertEqual(draft?.state, .revoked)
    XCTAssertEqual(draft?.value(.password), "")
    XCTAssertTrue(model.privacyCovered)
    XCTAssertGreaterThan(context.runtime.state.generation, generation)
    model.protectedDataRestored()
    XCTAssertEqual(model.phase, .locked)
    model.sceneInactive()
    model.protectedDataLost()
    model.protectedDataRestored()
    XCTAssertTrue(
      model.privacyCovered, "Protected data availability alone must not uncover an inactive scene")
    model.sceneActive(protectedDataAvailable: true)
    XCTAssertFalse(model.privacyCovered)
  }

  func testCancelClearsDraftAndRejectsLateUnlock() async {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    context.runtime.delayUnlock = true
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.password = "synthetic-vault"
    model.submit()
    await settled { context.runtime.unlockPending }
    XCTAssertNotNil(model.brandUnlockMotion)
    context.clipboard.copy("explicit export")
    model.cancelOperation()
    XCTAssertNil(model.brandUnlockMotion)
    XCTAssertNil(context.clipboard.value)
    context.runtime.finishUnlock()
    await settled { !model.busy }
    XCTAssertEqual(model.phase, .locked)
    XCTAssertEqual(model.password, "")
    XCTAssertEqual(context.runtime.state.phase, .locked)
    XCTAssertNil(model.brandUnlockMotion)
  }

  func testKeychainFailureHasNoResetAndRetryKeepsTheSameRuntime() async throws {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    context.runtime.unlockError = try rpcError("KEYSTORE_UNAVAILABLE")
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.password = "synthetic-vault"
    model.submit()
    await settled { model.phase == .unavailable }
    XCTAssertEqual(model.issue, .storage)
    XCTAssertEqual(model.password, "")
    XCTAssertEqual(context.runtime.state.phase, .inactive)
    context.runtime.unlockError = nil
    model.sceneActive(protectedDataAvailable: true)
    XCTAssertEqual(model.phase, .unavailable)
    model.retry()
    XCTAssertEqual(model.phase, .locked)
    XCTAssertEqual(context.openCount, 1)
  }

  func testOptionalPresenceSuccessNeverUnlocksAndDeniedCheckCanRetry() async {
    let context = Context(presenceEnabled: true)
    defer { context.shutdown() }
    let model = context.model
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .presenceRequired }
    context.presence.accepted = false
    model.authenticatePresence()
    await settled { !model.busy }
    XCTAssertEqual(model.phase, .presenceRequired)
    XCTAssertEqual(model.issue, .presence)
    XCTAssertEqual(context.runtime.unlockPasswords, [])
    XCTAssertEqual(context.runtime.hostStore.resumptions, [])
    context.presence.accepted = true
    model.authenticatePresence()
    await settled { model.phase == .locked }
    await settled { !context.runtime.hostStore.resumptions.isEmpty }
    XCTAssertEqual(context.runtime.hostStore.resumptions, [context.runtime.state.generation])
    XCTAssertEqual(context.runtime.unlockPasswords, [])
    model.setLockOnBackgroundEnabled(true)
    model.sceneBackground()
    model.sceneActive(protectedDataAvailable: true)
    XCTAssertEqual(model.phase, .presenceRequired)
  }

  func testDeviceAuthenticationIsOffByDefaultAndEnablingRequiresPresence() async {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    XCTAssertFalse(model.presenceEnabled)
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.password = "synthetic-vault"
    model.submit()
    await settled { model.phase == .unlocked && !model.busy }
    context.presence.accepted = false
    model.setPresenceEnabled(true)
    await settled { !model.busy }
    XCTAssertFalse(model.presenceEnabled)
    context.presence.accepted = true
    model.setPresenceEnabled(true)
    await settled { model.presenceEnabled }
    XCTAssertEqual(context.runtime.unlockPasswords.count, 1)
  }

  func testDelayedUnlockedEventCannotReopenPresentationAfterBackgroundReturn() async {
    let context = Context()
    defer { context.shutdown() }
    let model = context.model
    model.sceneActive(protectedDataAvailable: true)
    await settled { model.phase == .locked }
    model.password = "synthetic-vault"
    model.submit()
    await settled { model.phase == .unlocked && !model.busy }
    let stale = context.runtime.state
    model.setLockOnBackgroundEnabled(true)
    model.sceneBackground()
    model.sceneActive(protectedDataAvailable: true)
    await settled { context.runtime.hasEventListener }
    let calls = context.runtime.eventCalls
    context.runtime.deliverEvent(stale)
    await settled { context.runtime.eventCalls > calls }
    XCTAssertEqual(model.phase, .locked)
    XCTAssertEqual(model.password, "")
  }

  private func settled(_ predicate: () -> Bool, file: StaticString = #filePath, line: UInt = #line)
    async
  {
    let deadline = ContinuousClock.now + .seconds(2)
    while !predicate(), ContinuousClock.now < deadline { await Task.yield() }
    XCTAssertTrue(predicate(), "Expected asynchronous state transition", file: file, line: line)
  }

  private func rpcError(_ code: String) throws -> RPCFailure {
    let data = try JSONSerialization.data(withJSONObject: [
      "ok": false, "error": "synthetic", "code": code,
    ])
    do {
      _ = try JSONDecoder().decode(RPCResult<[String: String]>.self, from: data)
      throw NSError(domain: "Expected RPC failure", code: 1)
    } catch let error as RPCFailure { return error }
  }
}

@MainActor
private final class AccessPreviewHost<Content: View>: UIHostingController<Content> {
  var appeared: (() -> Void)?
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    appeared?()
    appeared = nil
  }
}

@MainActor
private final class Context {
  let runtime: TestRuntime
  let presence = TestPresence()
  let preferences: UserDefaults
  let suite = "com.chromvoid.iosair.access-tests." + UUID().uuidString
  var openCount = 0
  let clipboard = AccessClipboardProbe()
  let screenAwake = ScreenAwakeProbe()
  lazy var model = AccessModel(
    preferences: preferences, presence: presence, clipboard: clipboard, screenAwake: screenAwake
  ) {
    [unowned self] in
    openCount += 1
    return runtime
  }

  init(configured: Bool = true, presenceEnabled: Bool = false) {
    runtime = TestRuntime(configured: configured)
    preferences = UserDefaults(suiteName: suite)!
    if presenceEnabled { preferences.set(true, forKey: "air.presence.enabled") }
  }

  func shutdown() {
    model.shutdown()
    runtime.finishUnlock()
    preferences.removePersistentDomain(forName: suite)
  }
}

@MainActor
private final class TestPresence: PresenceChecking {
  var accepted = true
  func authenticate() async throws -> Bool { accepted }
  func cancel() {}
}

@MainActor
private final class TestRuntime: AccessRuntime, CredentialStore, PasskeyStore, AutoFillStore,
  WalletStore
{
  let maintenanceProbe = AccessMaintenanceProbe()
  var maintenance: any MaintenanceStore { maintenanceProbe }
  var storageBackups: any StorageBackupStore { maintenanceProbe }
  let eraseStore = StorageEraseTestStore()
  var storageErasure: any StorageEraseStore { eraseStore }
  var storageRestores: any StorageRestoreStore {
    maintenanceProbe.onRestore = { [weak self] in
      guard let self else { return }
      self.state = AirSnapshot(
        generation: self.state.generation, sequence: self.state.sequence,
        phase: .locked, cleanupPending: false, masterConfigured: true)
      self.update(.locked)
    }
    return maintenanceProbe
  }
  var wallet: any WalletStore { self }
  let walletSend: any WalletSendStore = WalletSendTestStore()
  let walletRecovery: any WalletRecoveryStore = WalletRecoveryTestStore()
  let walletHistory: any WalletHistoryStore = WalletHistoryTestStore()
  let walletContacts: any WalletAddressBookStore = WalletContactsTestStore()
  func deriveWalletAccount(_ request: WalletAccountsDeriveRequest, generation: UInt64)
    async throws -> WalletAccountsDeriveResponse
  { throw BridgeError.CapabilityUnavailable }
  func deriveWalletAddress(_ request: WalletAddressesDeriveRequest, generation: UInt64)
    async throws -> WalletAddressesDeriveResponse
  { throw BridgeError.CapabilityUnavailable }
  func walletStatus(generation: UInt64) async throws -> WalletStatusResponse {
    WalletStatusResponse(
      disabledReason: nil, enabled: true, initialized: false, networks: [], walletCount: 0)
  }
  func walletList(generation: UInt64) async throws -> WalletListResponse {
    WalletListResponse(wallets: [])
  }
  func walletAccounts(walletID: String?, generation: UInt64) async throws
    -> WalletAccountsListResponse
  {
    WalletAccountsListResponse(accounts: [], cachedBalances: [])
  }
  func walletBalance(accountID: String, generation: UInt64) async throws
    -> WalletBalanceGetResponse
  { throw BridgeError.CapabilityUnavailable }
  func generateWalletMnemonic(_ request: WalletHDGenerateMnemonicRequest, generation: UInt64)
    async throws -> WalletHDGenerateMnemonicResponse
  { throw BridgeError.CapabilityUnavailable }
  func createHDWallet(_ request: WalletHDCreateRequest, generation: UInt64) async throws
    -> WalletHDCreateResponse
  { throw BridgeError.CapabilityUnavailable }
  func importWallet(_ request: WalletImportCreateRequest, generation: UInt64) async throws
    -> WalletImportCreateResponse
  { throw BridgeError.CapabilityUnavailable }

  let hostStore = TestHostStore()
  var connections: any HostStore { hostStore }
  let fileStore = TestFileCatalogStore()
  var files: any FileCatalogStore { fileStore }
  var fileImports: any FileImportStore { fileStore }
  var autoFill: any AutoFillStore { self }
  func autoFillStatus(generation: UInt64) async throws -> AutoFillStatus {
    throw BridgeError.RuntimeUnavailable
  }

  func tagPage(offset: UInt32, generation: UInt64) async throws -> PassmanagerTagPageResponse {
    throw CredentialStoreError.invalidPage
  }
  func saveTag(sourceKey: String?, label: String, colorID: String, generation: UInt64) async throws
    -> CredentialTagSummary
  { throw CredentialStoreError.invalidPage }
  func deleteTag(key: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }

  func deleteCredential(id: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }

  func credentialDetail(id: String, generation: UInt64) async throws -> CredentialDetail {
    throw CredentialStoreError.invalidPage
  }
  func updateCredential(_ request: PassmanagerEntryUpdateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  { throw CredentialStoreError.invalidPage }
  func readCredentialSecret(id: String, type: String, generation: UInt64) async throws -> String {
    throw CredentialStoreError.invalidPage
  }
  func saveCredentialSecret(id: String, type: String, value: String, generation: UInt64)
    async throws
  { throw CredentialStoreError.invalidPage }

  var credentials: any CredentialStore { self }
  var passkeys: any PasskeyStore { self }
  func listPasskeys(generation: UInt64) async throws -> VaultPasskeysListResponse {
    VaultPasskeysListResponse(passkeys: [])
  }
  func deletePasskey(_ request: VaultPasskeyDeleteRequest, generation: UInt64) async throws
    -> VaultPasskeyDeleteResponse
  {
    throw CancellationError()
  }
  func createCredential(_ request: PassmanagerEntryCreateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  {
    throw CredentialStoreError.invalidPage
  }

  var readCredentialPage:
    (@MainActor (PassmanagerEntryPageRequest) async throws -> PassmanagerEntryPageResponse)?
  func credentialPage(
    _ request: PassmanagerEntryPageRequest, generation: UInt64
  )
    async throws
    -> PassmanagerEntryPageResponse
  {
    if let readCredentialPage { return try await readCredentialPage(request) }
    return PassmanagerEntryPageResponse(entries: [], nextOffset: nil, totalCount: nil)
  }
  var state: AirSnapshot
  var setupPasswords: [String] = []
  var unlockPasswords: [String] = []
  var delayUnlock = false
  var delayUnlockReturn = false
  var unlockError: Error?
  private var unlockContinuation: CheckedContinuation<Void, Never>?
  private var unlockReturnContinuation: CheckedContinuation<Void, Never>?
  private var listeners: [UUID: AsyncStream<AirEventBatch>.Continuation] = [:]
  var unlockPending: Bool { unlockContinuation != nil }
  var unlockReturnPending: Bool { unlockReturnContinuation != nil }
  var eventCalls = 0
  var autoLockConfigurations: [(seconds: UInt64, generation: UInt64)] = []
  var autoLockError: Error?
  var activityGenerations: [UInt64] = []
  var hasEventListener: Bool { !listeners.isEmpty }

  init(configured: Bool) {
    state = AirSnapshot(
      generation: 1, sequence: 1, phase: .locked, cleanupPending: false,
      masterConfigured: configured)
  }

  func snapshot() throws -> AirSnapshot { state }
  func setAutoLockTimeout(seconds: UInt64, generation: UInt64) throws {
    if let autoLockError { throw autoLockError }
    guard generation == state.generation, state.phase == .locked || state.phase == .unlocked else {
      throw BridgeError.SessionRevoked
    }
    autoLockConfigurations.append((seconds, generation))
  }
  func recordUserActivity(generation: UInt64) throws {
    guard generation == state.generation, state.phase == .unlocked else {
      throw BridgeError.SessionRevoked
    }
    activityGenerations.append(generation)
  }
  func activate() throws -> AirSnapshot {
    if state.phase == .inactive { update(.locked) }
    return state
  }
  func deactivate() throws -> AirSnapshot { revoke(.inactive) }
  func lock() throws -> AirSnapshot { revoke(.locked) }
  func close() throws -> AirSnapshot { revoke(.closed) }

  func events(after sequence: UInt64) async throws -> AirEventBatch {
    eventCalls += 1
    if sequence < state.sequence { return AirEventBatch(snapshot: state, events: [], gap: false) }
    let id = UUID()
    let stream = AsyncStream<AirEventBatch> { continuation in
      listeners[id] = continuation
      continuation.onTermination = { [weak self] _ in
        Task { @MainActor in self?.listeners[id] = nil }
      }
    }
    for await event in stream { return event }
    throw CancellationError()
  }

  func setupAdministrator(password: String) async throws {
    setupPasswords.append(password)
    state = AirSnapshot(
      generation: state.generation, sequence: state.sequence, phase: state.phase,
      cleanupPending: false, masterConfigured: true)
    update(.locked)
  }

  func unlock(password: String) async throws {
    unlockPasswords.append(password)
    let generation = state.generation
    if delayUnlock { await withCheckedContinuation { unlockContinuation = $0 } }
    if let unlockError { throw unlockError }
    guard state.generation == generation else { throw BridgeError.SessionRevoked }
    update(.unlocked)
    if delayUnlockReturn { await withCheckedContinuation { unlockReturnContinuation = $0 } }
  }

  func finishUnlock() {
    unlockContinuation?.resume()
    unlockContinuation = nil
    unlockReturnContinuation?.resume()
    unlockReturnContinuation = nil
  }

  private func revoke(_ phase: AirPhase) -> AirSnapshot {
    state = AirSnapshot(
      generation: state.generation + 1, sequence: state.sequence, phase: state.phase,
      cleanupPending: false, masterConfigured: state.masterConfigured)
    update(phase)
    return state
  }

  private func update(_ phase: AirPhase) {
    state = AirSnapshot(
      generation: state.generation, sequence: state.sequence + 1, phase: phase,
      cleanupPending: false, masterConfigured: state.masterConfigured)
    deliverEvent(state)
  }

  func deliverEvent(_ snapshot: AirSnapshot) {
    let batch = AirEventBatch(snapshot: snapshot, events: [], gap: false)
    let waiting = listeners.values
    listeners.removeAll()
    for continuation in waiting {
      continuation.yield(batch)
      continuation.finish()
    }
  }
}

@MainActor
private final class AccessClipboardProbe: CredentialClipboard {
  var value: String?
  func copy(_ value: String) { self.value = value }
  func clearOwned() { value = nil }
}

@MainActor
private final class AccessMaintenanceProbe: MaintenanceStore, StorageBackupStore,
  StorageRestoreStore
{
  var onRestore: () -> Void = {}
  var review: AccessRestoreReview?
  func rekeyVault(_ request: VaultRekeyRequest, generation: UInt64) async throws
    -> VaultRekeyResponse
  {
    throw BridgeError.CapabilityUnavailable
  }
  func rekeyMaster(_ request: MasterRekeyRequest, generation: UInt64) async throws
    -> MasterRekeyResponse
  {
    throw BridgeError.CapabilityUnavailable
  }
  func saveStorageBackup(
    to directory: URL, masterPassword: String, generation: UInt64,
    progress: @escaping @MainActor (StorageBackupProgress) -> Void
  ) async throws -> URL { directory.appendingPathComponent("synthetic-completed") }
  func reviewStorageBackup(
    at directory: URL, masterPassword: String, generation: UInt64,
    progress: @escaping @MainActor (StorageRestoreProgress) -> Void
  ) async throws -> any StorageRestoreReview {
    let result = AccessRestoreReview(onCommit: onRestore)
    review = result
    return result
  }
}

@MainActor
private final class AccessRestoreReview: StorageRestoreReview {
  let preview = AirRestorePreview(version: 2, chunkCount: 2, byteCount: 100)
  let closeGate = ContactsGate()
  let onCommit: () -> Void
  var commits = 0
  var closes = 0
  init(onCommit: @escaping () -> Void) { self.onCommit = onCommit }
  func commit() async throws {
    commits += 1
    onCommit()
  }
  func cancel() {}
  func close() async throws {
    closes += 1
    await closeGate.pause()
  }
}

@MainActor
private final class ScreenAwakeProbe: ScreenAwakeControlling {
  private(set) var awake = false
  func setAwake(_ awake: Bool) { self.awake = awake }
}
