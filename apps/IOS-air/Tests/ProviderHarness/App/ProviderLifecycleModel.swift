import AuthenticationServices
import ChromVoidBridge
import Foundation
import OSLog
import Observation
import SwiftUI

@MainActor
@Observable
final class ProviderLifecycleModel {
  private(set) var status = "Locked"
  private(set) var events: [String] = []
  private(set) var providerStatus = "AutoFill state not checked"
  private(set) var requestingProvider = false
  @ObservationIgnored private var lastProviderRequest: Date?
  @ObservationIgnored private var harness: FixtureHarness?
  private let logger = Logger(
    subsystem: "com.chromvoid.iosair.dev.provider-harness", category: "lifecycle")

  init() {
    do {
      harness = try FixtureHarness(expectedFingerprint: BuildFingerprint.expected)
      record("host_started_locked")
    } catch { status = "Bridge unavailable" }
  }

  func activate() {
    do {
      let harness = try requireHarness()
      let request = Data(
        #"{"v":1,"command":"vault:unlock","data":{"password":"synthetic-lifecycle-only"}}"#.utf8)
      _ = try harness.execute(request: request)
      try refresh()
      record("synthetic_session_activated")
    } catch { status = "Bridge unavailable" }
  }

  func inactive() { record("scene_inactive") }

  func background() {
    do {
      _ = try requireHarness().execute(
        request: Data(#"{"v":1,"command":"vault:lock","data":{}}"#.utf8))
      try refresh()
      record("scene_background_fixture_locked")
    } catch {
      status = "Bridge unavailable"
      record("background_bridge_error")
    }
  }

  func resume() {
    do {
      try refresh()
      record("scene_active")
    } catch { status = "Bridge unavailable" }
    Task { await refreshProviderState() }
  }

  func requestProvider() {
    guard !requestingProvider else { return }
    if let lastProviderRequest, Date().timeIntervalSince(lastProviderRequest) < 10 {
      providerStatus = "Wait 10 seconds before requesting again."
      return
    }
    guard #available(iOS 18.0, *) else {
      providerStatus = "Enable Air Provider Probe in the system AutoFill settings."
      return
    }
    lastProviderRequest = Date()
    requestingProvider = true
    record("provider_enable_requested")
    Task {
      let enabled = await ASSettingsHelper.requestToTurnOnCredentialProviderExtension()
      record(enabled ? "provider_enable_confirmed" : "provider_enable_not_confirmed")
      await refreshProviderState()
      requestingProvider = false
    }
  }

  private func refreshProviderState() async {
    let state = await ASCredentialIdentityStore.shared.state()
    providerStatus = state.isEnabled ? "AutoFill enabled" : "AutoFill not enabled"
    record(state.isEnabled ? "provider_store_enabled" : "provider_store_disabled")
  }

  private func refresh() throws {
    let data = try requireHarness().execute(
      request: Data(#"{"v":1,"command":"vault:status","data":{}}"#.utf8))
    let response = try JSONDecoder().decode(RPCResult<VaultStatusResponse>.self, from: data)
    status = response.value.isUnlocked ? "Synthetic session active" : "Locked"
  }

  private func requireHarness() throws -> FixtureHarness {
    guard let harness else { throw BridgeError.FixtureUnavailable }
    return harness
  }

  private func record(_ event: String) {
    // Only literal lifecycle events; no request, domain, username or secret values.
    logger.notice("\(event, privacy: .public)")
    events.append(event)
    if events.count > 30 { events.removeFirst() }
  }
}
