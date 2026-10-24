import SwiftUI

/// What tells a field apart from a printed value. A form whose fields look like the detail
/// page reads as a page, not a form: the same caption, the same text, nothing to tap. Every
/// editable field wears a filled, outlined box, and the box takes the accent while its field
/// holds focus.
extension View {
  /// A field on an ordinary form row. `tall` fields (the UIKit secret input keeps its own
  /// 44pt minimum) take no vertical padding of their own.
  func airInput(focused: Bool = false, tall: Bool = false) -> some View {
    modifier(AirInputAffordance(focused: focused, onCard: false, tall: tall))
  }

  /// A field on the card face, where the box is drawn in light over the network's colour.
  func airCardInput(focused: Bool = false) -> some View {
    modifier(AirInputAffordance(focused: focused, onCard: true, tall: false))
  }
}

private struct AirInputAffordance: ViewModifier {
  let focused: Bool
  let onCard: Bool
  var tall = false

  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: onCard ? 8 : 10, style: .continuous)
    content
      .padding(.horizontal, onCard ? 8 : 12)
      .padding(.vertical, onCard ? 5 : (tall ? 0 : 9))
      .background {
        shape.fill(
          onCard
            ? AnyShapeStyle(Color.white.opacity(focused ? 0.28 : 0.16))
            : AnyShapeStyle(AirPalette.surfaceSecondary))
      }
      .overlay {
        shape.strokeBorder(border, lineWidth: focused ? 1.5 : 1)
      }
      .animation(AirMotion.feedback, value: focused)
  }

  private var border: Color {
    if onCard { return .white.opacity(focused ? 0.85 : 0.35) }
    return focused ? AirPalette.accent.opacity(0.7) : Color.primary.opacity(0.12)
  }
}
