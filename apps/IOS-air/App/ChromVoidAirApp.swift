import AirPresentation
import SwiftUI

@main
struct ChromVoidAirApp: App {
  @State private var model = AccessModel()
  @State private var appearance = AppearancePreferences()

  var body: some Scene {
    WindowGroup {
      AirRootView(model: model, appearance: appearance)
    }
  }
}
