import ChromVoidBridge
import Foundation
import Observation

/// Application-scoped presentation. Leaving the page never stops the Rust host.
@MainActor
@Observable
public final class ConnectionsModel {
  public enum State { case loading, ready, failed, suspended }
  public enum Issue: String {
    case unavailable = "Connections could not be loaded. Try again."
    case relay = "Enter a valid secure relay URL."
    case operation = "The host operation could not finish. Try again."
    case revoke = "The device could not be fully removed. Try again."
  }
  public private(set) var state = State.suspended
  public private(set) var snapshot: AirHostSnapshot?
  public private(set) var peers: [AirHostPeer] = []
  public private(set) var vaultOpen = false
  public private(set) var busy = false
  public private(set) var issue: Issue?
  public private(set) var validationRevision = 0
  public private(set) var savedEnabled = false
  public var relayURL = "wss://relay.chromvoid.com"
  public var revokeCandidate: AirHostPeer?

  private let store: any HostStore
  private let deviceLabel: String
  private let clipboard: any CredentialClipboard
  @ObservationIgnored private var generation: UInt64?
  private let work = ModelWork()
  private let observer = ModelWork()

  public init(
    store: any HostStore, deviceLabel: String,
    clipboard: any CredentialClipboard = SystemCredentialClipboard()
  ) {
    self.store = store
    self.deviceLabel = deviceLabel
    self.clipboard = clipboard
  }

  public var activeHost: Bool { snapshot?.phase == .pairing || snapshot?.phase == .ready }
  /// Existing desktop invitation URI; Foundation owns URL escaping for display/sharing.
  public var invitationURL: URL? {
    guard let offer = snapshot?.pairingOffer else { return nil }
    var url = URLComponents()
    url.scheme = "chromvoid"
    url.host = "pair-mobile"
    url.queryItems = [
      URLQueryItem(name: "session_id", value: offer.sessionId),
      URLQueryItem(name: "relay_base_url", value: offer.relayBaseUrl),
      URLQueryItem(name: "device_label", value: offer.deviceLabel),
      URLQueryItem(name: "expires_at_ms", value: String(offer.expiresAtMs)),
      URLQueryItem(name: "platform", value: "ios"),
    ]
    return url.url
  }
  public func copyPairingCode() {
    guard let pin = snapshot?.pairingPin, state == .ready else { return }
    clipboard.copy(pin)
  }
  public var hostSummary: String {
    switch snapshot?.phase {
    case .pairing: snapshot?.pairingPin == nil ? "Preparing connection…" : "Ready to pair"
    case .ready: snapshot?.connectedPeers.isEmpty == false ? "Device connected" : "Listening"
    case .error: "Connection interrupted"
    case .pairingExpired: "Pairing code expired"
    case .idle: savedEnabled ? "Host paused" : "Host stopped"
    case .none:
      state == .failed
        ? "Host status unavailable" : (state == .suspended ? "Host paused" : "Checking host…")
    }
  }
  public var hostFailureMessage: String? {
    switch snapshot?.phase {
    case .pairingExpired: "Start pairing again to get a new code."
    case .error: "Check your connection and relay address, then try again."
    default: nil
    }
  }
  public func isConnected(peerID: String) -> Bool {
    snapshot?.connectedPeers.contains(where: { $0.peerId == peerID }) == true
  }

  @discardableResult
  public func synchronize(generation: UInt64, vaultOpen: Bool) -> Task<Void, Never>? {
    self.vaultOpen = vaultOpen
    guard self.generation != generation || state == .suspended else { return nil }
    self.generation = generation
    return reload(resume: true)
  }

  @discardableResult
  public func reload() -> Task<Void, Never>? { reload(resume: false) }

  private func reload(resume: Bool) -> Task<Void, Never>? {
    guard let generation else { return nil }
    observer.cancel()
    snapshot = nil
    peers = []
    busy = false
    revokeCandidate = nil
    issue = nil
    state = .loading
    return work.start { [weak self, store, deviceLabel] run in
      do {
        let snapshot: AirHostSnapshot
        if resume {
          snapshot = try await store.resumeHost(generation: generation, deviceLabel: deviceLabel)
        } else {
          snapshot = try store.hostSnapshot()
        }
        let preferences = try await store.hostPreferences()
        let peers = try await store.trustedHostPeers()
        guard let self, run.isCurrent else { return }
        self.savedEnabled = preferences.enabled
        if let relay = preferences.relayUrl { self.relayURL = relay }
        self.peers = peers
        self.snapshot = snapshot
        self.state = .ready
        self.observe(after: snapshot.sequence)
      } catch {
        guard let self, run.isCurrent else { return }
        self.state = .failed
        self.issue = .unavailable
      }
    }
  }

  public func start() { begin(pairing: false) }
  public func pair() { begin(pairing: true) }
  public func submitRelay() { begin(pairing: peers.isEmpty) }
  private func begin(pairing: Bool) {
    guard state == .ready, !busy, !activeHost, let generation else { return }
    issue = nil
    do {
      snapshot =
        try pairing
        ? store.pairHost(generation: generation, relayURL: relayURL, deviceLabel: deviceLabel)
        : store.startHost(generation: generation, relayURL: relayURL, deviceLabel: deviceLabel)
    } catch BridgeError.InvalidRelayUrl {
      issue = .relay
      validationRevision += 1
    } catch {
      issue = .operation
    }
  }

  public func stop() {
    guard generation != nil, !busy else { return }
    do {
      snapshot = try store.stopHost()
      savedEnabled = false
      issue = nil
    } catch { issue = .operation }
  }

  public func requestRevoke(_ peer: AirHostPeer) {
    guard state == .ready, !busy else { return }
    revokeCandidate = peer
  }

  @discardableResult
  public func confirmRevoke() -> Task<Void, Never>? {
    guard let peer = revokeCandidate, state == .ready, !busy else { return nil }
    revokeCandidate = nil
    busy = true
    issue = nil
    return work.start { [weak self, store] run in
      do {
        try await store.revokeHostPeer(id: peer.peerId)
        let peers = try await store.trustedHostPeers()
        let snapshot = try store.hostSnapshot()
        guard let self, run.isCurrent else { return }
        self.peers = peers
        self.snapshot = snapshot
      } catch {
        guard let self, run.isCurrent else { return }
        self.issue = .revoke
      }
      self?.busy = false
    }
  }

  public func suspend() {
    work.cancel()
    observer.cancel()
    generation = nil
    snapshot = nil
    peers = []
    revokeCandidate = nil
    busy = false
    vaultOpen = false
    issue = nil
    state = .suspended
  }

  private func observe(after sequence: UInt64) {
    observer.start { [weak self, store] run in
      var sequence = sequence
      do {
        while run.isCurrent {
          let snapshot = try await store.hostEvents(after: sequence)
          let peers = try await store.trustedHostPeers()
          guard let self, run.isCurrent else { return }
          sequence = snapshot.sequence
          // A completed Stop/start may already have returned a newer authoritative snapshot.
          guard snapshot.sequence >= (self.snapshot?.sequence ?? 0) else { continue }
          self.peers = peers
          self.snapshot = snapshot
          if snapshot.phase == .ready { self.savedEnabled = true }
        }
      } catch {
        guard let self, run.isCurrent else { return }
        self.snapshot = nil
        self.state = .failed
        self.issue = .unavailable
      }
    }
  }
}
