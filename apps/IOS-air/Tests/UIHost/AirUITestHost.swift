import AirPresentation
import ChromVoidBridge
import SwiftUI

/// Test-host composition; the product app has no fixture launch path.
@main
struct AirUITestHost: App {
  @State private var model = AirUITestHost.makeAccessModel()
  @State private var appearance = AppearancePreferences()
  @State private var prepared = false
  @State private var failure: String?

  var body: some Scene {
    WindowGroup {
      Group {
        if prepared {
          AirRootView(model: model, appearance: appearance)
        } else if let failure {
          Text("Synthetic passkey fixture setup failed: " + failure).accessibilityIdentifier(
            "fixtureFailed")
        } else {
          ProgressView().task { await prepare() }
        }
      }
    }
  }

  /// The storage root the ordinary runtime opens; every fixture seeds or opens the same root.
  private static var storageRoot: String {
    URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)
      .appendingPathComponent("Library/Application Support/ChromVoidAir", isDirectory: true)
      .path
  }

  /// `AIR_TEST_WALLET_FIXTURE=setup|send` replaces the ordinary runtime with the matching
  /// offline wallet fixture runtime (fixture builds only); the vault is still set up and
  /// unlocked through the ordinary access UI.
  @MainActor
  private static func makeAccessModel() -> AccessModel {
    #if AIR_FIXTURE
      // `AIR_TEST_DETAIL_DELAY=<seconds>` makes credential pages load slowly, so a UI test can
      // watch what a page's toolbar does while it waits.
      RuntimeClient.slowCredentialDetail = ProcessInfo.processInfo.environment[
        "AIR_TEST_DETAIL_DELAY"
      ].flatMap(Double.init)
      switch ProcessInfo.processInfo.environment["AIR_TEST_WALLET_FIXTURE"] {
      case "setup": return AccessModel(openRuntime: { try await openWalletFixture(send: false) })
      case "send": return AccessModel(openRuntime: { try await openWalletFixture(send: true) })
      default: break
      }
    #endif
    return AccessModel()
  }

  #if AIR_FIXTURE
    @MainActor
    private static func openWalletFixture(send: Bool) async throws -> any AccessRuntime {
      let root = storageRoot
      let runtime = try await Task.detached { () throws -> AirRuntime in
        if send {
          return try openWalletSendTestRuntime(
            expectedFingerprint: BuildFingerprint.expected, storageRoot: root)
        }
        return try openWalletTestRuntime(
          expectedFingerprint: BuildFingerprint.expected, storageRoot: root)
      }.value
      return RuntimeClient(runtime: runtime)
    }
  #endif

  @MainActor
  private func prepare() async {
    do {
      #if AIR_FIXTURE
        if let password = ProcessInfo.processInfo.environment["AIR_TEST_PASSKEY_PASSWORD"] {
          let root = Self.storageRoot
          try await Task.detached {
            try await preparePasskeyUiFixture(
              expectedFingerprint: BuildFingerprint.expected,
              storageRoot: root, password: password)
          }.value
        }
      #endif
      prepared = true
    } catch {
      // Bridge errors carry fixed safe categories, never source credentials or RPC payloads.
      failure = (error as? BridgeError).map { String(describing: $0) } ?? "Unknown error"
    }
  }
}
