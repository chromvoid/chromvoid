import AirPresentation
import ChromVoidBridge
import Foundation
import XCTest

@MainActor
final class ConnectionsModelTests: XCTestCase {
  func testPairingExpiryExplainsRestartAndDoesNotMasqueradeAsNetworkFailure() async {
    let store = TestHostStore()
    store.current = makeHostSnapshot(phase: .pairingExpired)
    let model = ConnectionsModel(store: store, deviceLabel: "Phone")
    defer { model.suspend() }
    await model.synchronize(generation: 1, vaultOpen: true)?.value
    XCTAssertEqual(model.hostSummary, "Pairing code expired")
    XCTAssertEqual(model.hostFailureMessage, "Start pairing again to get a new code.")
    XCTAssertFalse(model.activeHost)
    XCTAssertNil(model.invitationURL)
    model.pair()
    XCTAssertEqual(model.hostSummary, "Ready to pair")
    XCTAssertNil(model.hostFailureMessage)
    XCTAssertNotNil(model.invitationURL)
    store.current = makeHostSnapshot(sequence: 2, phase: .error)
    await model.reload()?.value
    XCTAssertEqual(model.hostSummary, "Connection interrupted")
    XCTAssertEqual(
      model.hostFailureMessage, "Check your connection and relay address, then try again.")
  }

  func testForegroundAdmissionResumesOnceAndPageReloadNeverRestartsHost() async {
    let store = TestHostStore()
    let model = ConnectionsModel(store: store, deviceLabel: "Phone")
    defer { model.suspend() }
    await model.synchronize(generation: 4, vaultOpen: false)?.value
    await model.synchronize(generation: 4, vaultOpen: true)?.value
    await model.reload()?.value
    XCTAssertEqual(store.resumptions, [4])
    model.suspend()
    await model.synchronize(generation: 8, vaultOpen: false)?.value
    XCTAssertEqual(store.resumptions, [4, 8])
    XCTAssertEqual(store.starts, 0)
    XCTAssertEqual(store.pairings, 0)
  }

  func testMetadataFailureDoesNotClaimHostStoppedAndExplicitStopRemainsAvailable() async {
    let store = TestHostStore()
    store.current = makeHostSnapshot(sequence: 2, phase: .ready)
    store.failPreferences = true
    let model = ConnectionsModel(store: store, deviceLabel: "Phone")
    defer { model.suspend() }
    await model.synchronize(generation: 1, vaultOpen: false)?.value
    XCTAssertEqual(model.state, .failed)
    XCTAssertEqual(model.hostSummary, "Host status unavailable")
    model.stop()
    XCTAssertEqual(store.stops, 1)
    XCTAssertEqual(model.hostSummary, "Host stopped")
  }

  func testOldPairingEventCannotRestoreCodeAfterExplicitStop() async {
    let store = TestHostStore()
    let model = ConnectionsModel(store: store, deviceLabel: "Phone")
    defer { model.suspend() }
    await model.synchronize(generation: 1, vaultOpen: false)?.value
    let readingPeers = expectation(description: "old event waits for metadata")
    let nextEvent = expectation(description: "old event was handled")
    var releasePeers: CheckedContinuation<Void, Never>?
    var releaseEvent: CheckedContinuation<Void, Never>?
    store.beforePeers = {
      await withCheckedContinuation {
        releasePeers = $0
        readingPeers.fulfill()
      }
    }
    store.beforeEvents = { sequence in
      if sequence == 1 {
        await withCheckedContinuation {
          releaseEvent = $0
          nextEvent.fulfill()
        }
      }
    }
    store.publish(makeHostSnapshot(sequence: 1, phase: .pairing))
    await fulfillment(of: [readingPeers], timeout: 2)
    model.stop()
    store.beforePeers = nil
    releasePeers?.resume()
    await fulfillment(of: [nextEvent], timeout: 2)
    XCTAssertEqual(model.snapshot?.phase, .idle)
    XCTAssertNil(model.snapshot?.pairingPin)
    model.suspend()
    releaseEvent?.resume()
  }

  func testLoadingDoesNotStartHostAndPairingUsesTypedValidationAndDesktopInvitation() async throws {
    let store = TestHostStore()
    let model = ConnectionsModel(store: store, deviceLabel: "Phone")
    defer { model.suspend() }
    await model.synchronize(generation: 4, vaultOpen: false)?.value
    XCTAssertEqual(model.state, .ready)
    XCTAssertEqual(store.starts, 0)
    XCTAssertEqual(store.pairings, 0)
    XCTAssertFalse(model.vaultOpen)
    store.rejectRelay = true
    model.pair()
    XCTAssertEqual(model.issue, .relay)
    XCTAssertEqual(model.validationRevision, 1)
    store.rejectRelay = false
    model.pair()
    XCTAssertEqual(store.generations, [4])
    let url = try XCTUnwrap(model.invitationURL)
    let parts = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
    XCTAssertEqual(parts.scheme, "chromvoid")
    XCTAssertEqual(parts.host, "pair-mobile")
    let fields = Dictionary(
      uniqueKeysWithValues: (parts.queryItems ?? []).map { ($0.name, $0.value) })
    XCTAssertEqual(fields["device_label"], "Phone & desktop")
    XCTAssertEqual(fields["relay_base_url"], "wss://relay.example.test")
    XCTAssertEqual(fields["platform"], "ios")
    model.stop()
    XCTAssertNil(model.snapshot?.pairingPin)
    XCTAssertNil(model.invitationURL)
    XCTAssertEqual(store.stops, 1)
  }

  func testBackgroundDropsLateLoadAndDoesNotIssueAnotherHostStop() async {
    let store = TestHostStore()
    let model = ConnectionsModel(store: store, deviceLabel: "Phone")
    let entered = expectation(description: "preferences loading")
    var release: CheckedContinuation<Void, Never>?
    store.beforePreferences = {
      await withCheckedContinuation {
        release = $0
        entered.fulfill()
      }
    }
    let loading = model.synchronize(generation: 1, vaultOpen: true)
    await fulfillment(of: [entered], timeout: 2)
    model.suspend()
    release?.resume()
    await loading?.value
    XCTAssertNil(model.snapshot)
    XCTAssertFalse(model.vaultOpen)
    XCTAssertEqual(model.state, .suspended)
    XCTAssertEqual(store.stops, 0)
    store.beforePreferences = nil
    await model.synchronize(generation: 8, vaultOpen: false)?.value
    model.start()
    XCTAssertEqual(store.generations, [8])
    model.suspend()
  }

  func testHostEventDuringMetadataLoadIsNotLost() async {
    let store = TestHostStore()
    let model = ConnectionsModel(store: store, deviceLabel: "Phone")
    defer { model.suspend() }
    let entered = expectation(description: "preferences loading")
    var release: CheckedContinuation<Void, Never>?
    store.beforePreferences = {
      await withCheckedContinuation {
        release = $0
        entered.fulfill()
      }
    }
    let loading = model.synchronize(generation: 1, vaultOpen: false)
    await fulfillment(of: [entered], timeout: 2)
    store.publish(makeHostSnapshot(sequence: 1, phase: .pairing))
    release?.resume()
    await loading?.value
    let deadline = ContinuousClock.now + .seconds(2)
    while model.snapshot?.phase != .pairing, ContinuousClock.now < deadline { await Task.yield() }
    XCTAssertEqual(model.snapshot?.phase, .pairing)
  }

  func testRevokeRequiresConfirmationAndFailureKeepsTheDeviceAvailableForRetry() async {
    let store = TestHostStore()
    let peer = AirHostPeer(peerId: "desktop", label: "Computer", platform: "desktop")
    store.peers = [peer]
    let model = ConnectionsModel(store: store, deviceLabel: "Phone")
    defer { model.suspend() }
    await model.synchronize(generation: 1, vaultOpen: true)?.value
    model.requestRevoke(peer)
    XCTAssertTrue(store.revocations.isEmpty)
    model.revokeCandidate = nil
    XCTAssertNil(model.confirmRevoke())
    store.failRevoke = true
    model.requestRevoke(peer)
    await model.confirmRevoke()?.value
    XCTAssertEqual(model.issue, .revoke)
    XCTAssertEqual(model.peers, [peer])
    store.failRevoke = false
    model.requestRevoke(peer)
    await model.confirmRevoke()?.value
    XCTAssertEqual(store.revocations, ["desktop", "desktop"])
    XCTAssertTrue(model.peers.isEmpty)
    XCTAssertNil(model.issue)
  }
}

@MainActor
final class TestHostStore: HostStore {
  var current = makeHostSnapshot()
  var peers: [AirHostPeer] = []
  var starts = 0
  var pairings = 0
  var stops = 0
  var generations: [UInt64] = []
  var revocations: [String] = []
  var rejectRelay = false
  var failRevoke = false
  var failPreferences = false
  var beforePreferences: (() async -> Void)?
  var beforePeers: (() async -> Void)?
  var beforeEvents: ((UInt64) async -> Void)?
  private var waiters: [UUID: (UInt64, CheckedContinuation<AirHostSnapshot, Error>)] = [:]

  func hostSnapshot() throws -> AirHostSnapshot { current }
  func hostPreferences() async throws -> AirHostPreferences {
    await beforePreferences?()
    if failPreferences { throw BridgeError.HostUnavailable }
    return AirHostPreferences(relayUrl: nil, enabled: false)
  }
  func trustedHostPeers() async throws -> [AirHostPeer] {
    await beforePeers?()
    return peers
  }
  func hostEvents(after sequence: UInt64) async throws -> AirHostSnapshot {
    await beforeEvents?(sequence)
    try Task.checkCancellation()
    if current.sequence > sequence { return current }
    let id = UUID()
    return try await withTaskCancellationHandler {
      try Task.checkCancellation()
      return try await withCheckedThrowingContinuation { waiters[id] = (sequence, $0) }
    } onCancel: {
      Task { @MainActor [weak self] in
        self?.waiters.removeValue(forKey: id)?.1.resume(throwing: CancellationError())
      }
    }
  }
  func publish(_ snapshot: AirHostSnapshot) {
    current = snapshot
    for (id, waiter) in waiters where waiter.0 < snapshot.sequence {
      waiters.removeValue(forKey: id)?.1.resume(returning: snapshot)
    }
  }
  func startHost(generation: UInt64, relayURL: String, deviceLabel: String) throws
    -> AirHostSnapshot
  {
    starts += 1
    generations.append(generation)
    publish(makeHostSnapshot(sequence: current.sequence + 1, phase: .ready))
    return current
  }
  func pairHost(generation: UInt64, relayURL: String, deviceLabel: String) throws -> AirHostSnapshot
  {
    if rejectRelay { throw BridgeError.InvalidRelayUrl }
    pairings += 1
    generations.append(generation)
    publish(makeHostSnapshot(sequence: current.sequence + 1, phase: .pairing))
    return current
  }
  var resumptions: [UInt64] = []
  func resumeHost(generation: UInt64, deviceLabel: String) async throws -> AirHostSnapshot {
    resumptions.append(generation)
    return current
  }
  func stopHost() throws -> AirHostSnapshot {
    stops += 1
    publish(makeHostSnapshot(sequence: current.sequence + 1))
    return current
  }
  func revokeHostPeer(id: String) async throws {
    revocations.append(id)
    if failRevoke { throw BridgeError.HostUnavailable }
    peers.removeAll { $0.peerId == id }
  }
}

private func makeHostSnapshot(sequence: UInt64 = 0, phase: AirHostPhase = .idle) -> AirHostSnapshot
{
  AirHostSnapshot(
    sequence: sequence, phase: phase, connectionState: .idle, relayUrl: nil,
    deviceId: nil, deviceLabel: nil, pairingPin: phase == .pairing ? "654321" : nil,
    pairingOffer: phase == .pairing
      ? AirHostPairingOffer(
        sessionId: "synthetic", relayBaseUrl: "wss://relay.example.test",
        deviceLabel: "Phone & desktop", expiresAtMs: 4_000_000_000_000) : nil,
    presenceExpiresAtMs: nil, connectedPeers: [], error: nil)
}
