import Foundation
import XCTest

@testable import ChromVoidBridge

final class ProviderIdentityTests: XCTestCase {
  @MainActor
  func testLateLoadCannotPublishAfterRevocation() async {
    let store = IdentityStoreDouble()
    let sync = ProviderIdentitySync(store: store)
    let started = expectation(description: "load admitted")
    var resume: CheckedContinuation<Void, Never>?
    let load = sync.refresh {
      await withCheckedContinuation {
        resume = $0
        started.fulfill()
      }
      return [self.identity()]
    }
    await fulfillment(of: [started], timeout: 2)
    sync.clear()
    resume?.resume()
    await load.value
    await sync.settled()
    XCTAssertTrue(store.identities.isEmpty)
    XCTAssertEqual(store.replacements, 0)
    XCTAssertEqual(sync.state, .cleared)
    XCTAssertEqual(sync.access, .unknown)
  }

  @MainActor
  func testClearFollowsAnAlreadySubmittedSave() async {
    let store = IdentityStoreDouble()
    let sync = ProviderIdentitySync(store: store)
    let started = expectation(description: "save submitted")
    var resume: CheckedContinuation<Void, Never>?
    store.beforeReplace = {
      await withCheckedContinuation {
        resume = $0
        started.fulfill()
      }
    }
    sync.refresh { [self.identity()] }
    await fulfillment(of: [started], timeout: 2)
    sync.clear()
    resume?.resume()
    await sync.settled()
    XCTAssertTrue(store.identities.isEmpty)
    XCTAssertEqual(store.operations, ["replace", "clear"])
    XCTAssertEqual(sync.state, .cleared)
  }

  @MainActor
  func testFreshLoadDoesNotDiscardPendingRevocationClear() async {
    let store = IdentityStoreDouble()
    let sync = ProviderIdentitySync(store: store)
    let saving = expectation(description: "old save")
    var resumeSave: CheckedContinuation<Void, Never>?
    store.beforeReplace = {
      await withCheckedContinuation {
        resumeSave = $0
        saving.fulfill()
      }
    }
    sync.refresh { [self.identity()] }
    await fulfillment(of: [saving], timeout: 2)
    sync.clear()
    let fresh = sync.refresh { [self.identity("new")] }
    await fresh.value
    store.beforeReplace = nil
    resumeSave?.resume()
    await sync.settled()
    XCTAssertEqual(store.identities.map(\.recordIdentifier), ["new"])
    XCTAssertEqual(store.operations, ["replace", "clear", "replace"])
  }

  @MainActor
  func testFailedLoadClearsAndFailedStoreDoesNotReportSuccess() async {
    let store = IdentityStoreDouble()
    let sync = ProviderIdentitySync(store: store)
    sync.refresh { [self.identity()] }
    await sync.settled()
    XCTAssertEqual(sync.state, .synchronized(1))
    XCTAssertEqual(sync.access, .authorized)
    sync.refresh { throw RPCFailure(code: "ACCESS_DENIED") }
    await sync.settled()
    XCTAssertEqual(sync.access, .unavailable)
    XCTAssertEqual(sync.state, .cleared)
    sync.refresh { throw BridgeError.CapabilityUnavailable }
    await sync.settled()
    XCTAssertTrue(store.identities.isEmpty)
    store.failReplace = true
    sync.refresh { [self.identity()] }
    await sync.settled()
    XCTAssertEqual(sync.state, .failed)
    XCTAssertTrue(store.identities.isEmpty)
    store.failClear = true
    store.identities = [identity("retained")]
    sync.clear()
    await sync.settled()
    XCTAssertEqual(sync.state, .failed)
    XCTAssertEqual(store.identities.map(\.recordIdentifier), ["retained"])
    store.enabled = false
    let operations = store.operations
    sync.refresh { [self.identity()] }
    await sync.settled()
    XCTAssertEqual(sync.state, .disabled)
    XCTAssertEqual(store.operations, operations)
  }

  @MainActor
  func testRuntimeSynchronizesCoreChangesAndClearsOnBackground() async throws {
    #if AIR_FIXTURE
      let root = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(
        "Library/Application Support/ChromVoidAir"
      ).path
      let runtime = try await Task.detached {
        try openProviderTestRuntime(
          expectedFingerprint: BuildFingerprint.expected, storageRoot: root)
      }.value
      let store = IdentityStoreDouble()
      let host = RuntimeClient(runtime: runtime, identityStore: store)
      defer { _ = try? host.close() }
      _ = try host.activate()
      if !(try host.snapshot().masterConfigured) {
        try await host.setupAdministrator(password: "air-synthetic-administrator")
      }
      try await host.unlock(password: "air-identity-" + UUID().uuidString)
      let generation = try host.snapshot().generation
      let urls = try JSONDecoder().decode(
        JSONAny.self,
        from: Data(#"[{"value":"https://identity.test","match":"host"}]"#.utf8))
      let before = try host.snapshot().sequence
      _ = try await host.createCredential(
        PassmanagerEntryCreateRequest(
          createdTs: nil, entryID: "identity-login", entryType: "login", groupPath: nil,
          iconRef: nil, otps: nil, paymentCard: nil,
          secrets: PassmanagerEntryCreateSecrets(
            cardCvv: nil, cardPan: nil, note: nil, password: "synthetic"),
          tagKeys: nil, tags: nil, title: "Identity account", updatedTs: nil,
          urls: urls, username: "alice"), generation: generation)
      guard try host.snapshot().sequence > before else {
        return XCTFail("Core creation must emit a domain event")
      }
      let afterCreate = try host.snapshot().sequence
      _ = try await host.events(after: before)
      await host.settleProviderIdentities()
      XCTAssertEqual(try host.snapshot().sequence, afterCreate)
      XCTAssertEqual(host.providerIdentityState, .synchronized(1))
      XCTAssertEqual(store.identities.map(\.recordIdentifier), ["identity-login"])
      XCTAssertEqual(store.identities.first?.domain, "identity.test")
      XCTAssertEqual(store.identities.first?.username, "alice")
      let setup = try await host.autoFillStatus(generation: generation)
      XCTAssertEqual(setup.systemEnabled, true)
      XCTAssertTrue(setup.core.vaultOpen)
      XCTAssertEqual(setup.access, .authorized)
      XCTAssertEqual(setup.identities, .synchronized(1))
      store.enabled = false
      let disabled = try await host.autoFillStatus(generation: generation)
      XCTAssertEqual(disabled.systemEnabled, false)
      XCTAssertEqual(disabled.identities, .disabled)
      XCTAssertEqual(disabled.access, .authorized)
      store.enabled = true
      let beforeDelete = try host.snapshot().sequence
      try await host.deleteCredential(id: "identity-login", generation: generation)
      guard try host.snapshot().sequence > beforeDelete else {
        return XCTFail("Core deletion must emit a domain event")
      }
      _ = try await host.events(after: beforeDelete)
      await host.settleProviderIdentities()
      XCTAssertTrue(store.identities.isEmpty)
      XCTAssertEqual(host.providerIdentityState, .synchronized(0))
      _ = try host.deactivate()
      await host.settleProviderIdentities()
      XCTAssertTrue(store.identities.isEmpty)
      XCTAssertEqual(host.providerIdentityState, .cleared)
    #else
      throw XCTSkip("The provider test runtime requires the isolated fixture test host")
    #endif
  }

  private func identity(_ id: String = "account") -> AirPasswordIdentity {
    AirPasswordIdentity(recordIdentifier: id, username: "alice", domain: "example.test")
  }
}

@MainActor
private final class IdentityStoreDouble: ProviderIdentityStore {
  var enabled = true
  var identities: [AirPasswordIdentity] = []
  var operations: [String] = []
  var replacements = 0
  var failReplace = false
  var failClear = false
  var beforeReplace: (() async -> Void)?
  var onClear: (() -> Void)?

  func isEnabled() async -> Bool { enabled }
  func replace(_ identities: [AirPasswordIdentity]) async throws {
    await beforeReplace?()
    operations.append("replace")
    replacements += 1
    if failReplace { throw BridgeError.RuntimeUnavailable }
    self.identities = identities
  }
  func removeAll() async throws {
    operations.append("clear")
    if failClear { throw BridgeError.RuntimeUnavailable }
    identities = []
    onClear?()
  }
}
