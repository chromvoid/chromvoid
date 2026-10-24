import SwiftUI
import UIKit

extension View {
  /// Keeps the control a form is about to submit above the keyboard. iOS lifts only the focused
  /// field into view, so a button below it ends up under the keyboard; the form scrolls to the
  /// button itself as the keyboard appears. Put the matching `.id(anchor)` on that row and apply
  /// this to the `Form`/`ScrollView` inside a `ScrollViewReader`.
  func keepsSubmitVisible(_ anchor: some Hashable, in scroll: ScrollViewProxy) -> some View {
    onReceive(
      NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
    ) { _ in
      withAnimation(AirMotion.layout) { scroll.scrollTo(anchor, anchor: .bottom) }
    }
  }
}
