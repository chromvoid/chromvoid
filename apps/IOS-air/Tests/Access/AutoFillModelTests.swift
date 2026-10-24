import ChromVoidBridge
import Foundation
import XCTest

@testable import AirPresentation

final class AutoFillModelTests: XCTestCase {
  @MainActor
  func testSystemEnablementDoesNotClaimVaultOrProviderAuthorization() async throws {
    let store = SetupStoreDouble()
    let model = AutoFillModel(store: store)
    await model.synchronize(generation: 1, sequence: 1)?.value
    XCTAssertEqual(model.state, .ready)
    XCTAssertEqual(model.systemSummary, "Enabled in iOS")
    XCTAssertEqual(model.accessSummary, "Provider access is unavailable")
    XCTAssertEqual(model.status?.identities, .cleared)
    store.result = setupStatus(vaultOpen: false)
    await model.synchronize(generation: 2, sequence: 2)?.value
    XCTAssertEqual(model.accessSummary, "Vault is closed")
    model.suspend()
  }

  @MainActor
  func testLateStatusCannotReturnAfterBackgroundAndResumeReadsNewGeneration() async throws {
    let store = SetupStoreDouble()
    let model = AutoFillModel(store: store)
    let started = expectation(description: "status admitted")
    var resume: CheckedContinuation<Void, Never>?
    store.beforeRead = {
      await withCheckedContinuation {
        resume = $0
        started.fulfill()
      }
    }
    let loading = model.synchronize(generation: 1, sequence: 1)
    await fulfillment(of: [started], timeout: 2)
    model.suspend()
    store.beforeRead = nil
    resume?.resume()
    await loading?.value
    XCTAssertNil(model.status)
    XCTAssertEqual(model.state, .suspended)
    store.result = setupStatus(vaultOpen: false)
    await model.synchronize(generation: 8, sequence: 2)?.value
    XCTAssertEqual(store.generations.last, 8)
    XCTAssertEqual(model.state, .ready)
    XCTAssertEqual(model.accessSummary, "Vault is closed")
    model.suspend()
  }

  @MainActor
  func testReadFailureReplacesPreviouslyLoadedStatusAndRetryRecovers() async throws {
    let store = SetupStoreDouble()
    let model = AutoFillModel(store: store)
    await model.synchronize(generation: 1, sequence: 1)?.value
    XCTAssertNotNil(model.status)
    store.fail = true
    await model.reload()?.value
    XCTAssertEqual(model.state, .failed)
    XCTAssertNil(model.status)
    store.fail = false
    store.result = setupStatus(systemEnabled: false)
    await model.reload()?.value
    XCTAssertEqual(model.systemSummary, "Not enabled in iOS")
    model.suspend()
  }

  @MainActor
  func testSettingsFailureIsVisibleAndOpeningDoesNotEnableProvider() async {
    let store = SetupStoreDouble()
    let settings = SetupSettingsDouble()
    let model = AutoFillModel(store: store, settings: settings)
    await model.synchronize(generation: 1, sequence: 1)?.value
    settings.fail = true
    await model.openSettings()?.value
    XCTAssertTrue(model.settingsFailed)
    XCTAssertFalse(model.openingSettings)
    XCTAssertEqual(model.accessSummary, "Provider access is unavailable")
    settings.fail = false
    await model.openSettings()?.value
    XCTAssertFalse(model.settingsFailed)
    XCTAssertEqual(settings.opens, 2)
    model.suspend()
    XCTAssertNil(model.openSettings())
    settings.canOpen = false
    model.synchronize(generation: 2, sequence: 2)
    XCTAssertNil(model.openSettings())
    model.suspend()
  }
}

@MainActor
private final class SetupStoreDouble: AutoFillStore {
  var result: AutoFillStatus?
  var fail = false
  var beforeRead: (@MainActor () async -> Void)?
  var generations: [UInt64] = []
  func autoFillStatus(generation: UInt64) async throws -> AutoFillStatus {
    generations.append(generation)
    let result = result ?? setupStatus()
    await beforeRead?()
    if fail { throw BridgeError.RuntimeUnavailable }
    return result
  }
}

@MainActor
private final class SetupSettingsDouble: AutoFillSettingsOpening {
  var canOpen = true
  var fail = false
  var opens = 0
  func open() async throws {
    opens += 1
    if fail { throw BridgeError.RuntimeUnavailable }
  }
}

private func setupStatus(systemEnabled: Bool = true, vaultOpen: Bool = true) -> AutoFillStatus {
  let capability = CredentialProviderCapability(
    autofillFallback: false, oneTimeCodes: false, oneTimeCodesUnsupportedReason: nil,
    passkeysLite: true, passwordProvider: true, unsupportedReason: nil)
  let passkey = CredentialProviderPasskeysLiteStatus(
    create: "supported", credentialProviderPasskeysLiteStatusGet: "supported",
    unsupportedReason: nil)
  let core = CredentialProviderStatusResponse(
    capabilityMatrix: CredentialProviderCapabilityMatrix(
      android: capability, ios: capability, macos: capability, windows: capability),
    commandErrorMap: CredentialProviderCommandErrorMap(
      credentialProviderGetOneTimeCode: [], credentialProviderGetSecret: [],
      credentialProviderList: [],
      credentialProviderPasskeyCreate: [], credentialProviderPasskeyGet: [],
      credentialProviderPasskeyQuery: [],
      credentialProviderRecordUse: [], credentialProviderSearch: [],
      credentialProviderSessionClose: [],
      credentialProviderSessionOpen: [], credentialProviderStatus: []),
    enabled: true,
    passkeysLiteStatus: CredentialProviderPasskeysLiteStatusMatrix(
      android: passkey, ios: passkey, macos: passkey, windows: passkey),
    vaultOpen: vaultOpen)
  return AutoFillStatus(
    systemEnabled: systemEnabled, core: core, identities: .cleared, access: .unavailable)
}
