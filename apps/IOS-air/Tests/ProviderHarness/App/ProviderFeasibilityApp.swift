import SwiftUI

#if !AIR_FIXTURE
  #error("Provider feasibility harness is a fixture-only target")
#endif

@main
struct ProviderFeasibilityApp: App {
  @State private var model = ProviderLifecycleModel()

  var body: some Scene {
    WindowGroup {
      NavigationStack {
        List {
          Section("Lifecycle probe · synthetic data") {
            Text(
              "This harness observes app and extension lifecycle only. It cannot provide passwords or establish production AutoFill support."
            )
            Button("Activate synthetic session", action: model.activate)
              .accessibilityIdentifier("activateProviderFixture")
            Text(model.status)
              .accessibilityIdentifier("providerFixtureStatus")
          }
          Section("Procedure") {
            Text(
              "Activate the synthetic session, switch to Safari and request AutoFill with Air Provider Probe. Return here to inspect background lock. Repeat after terminating the host app."
            )
          }
          Section("System AutoFill") {
            Button("Enable AutoFill", action: model.requestProvider)
              .disabled(model.requestingProvider)
              .accessibilityIdentifier("enableProviderFixture")
            Text(model.providerStatus)
              .accessibilityIdentifier("providerSystemStatus")
          }
          Section("Safe lifecycle observations") {
            ForEach(Array(model.events.enumerated()), id: \.offset) { _, event in
              Text(event).font(.footnote.monospaced())
            }
          }
        }
        .navigationTitle("Air Provider Probe")
        .onReceive(NotificationCenter.default.publisher(for: UIScene.willDeactivateNotification)) {
          _ in model.inactive()
        }
        .onReceive(
          NotificationCenter.default.publisher(for: UIScene.didEnterBackgroundNotification)
        ) { _ in model.background() }
        .onReceive(NotificationCenter.default.publisher(for: UIScene.didActivateNotification)) {
          _ in model.resume()
        }
      }
    }
  }
}
