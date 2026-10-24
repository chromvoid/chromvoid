import SwiftUI
import UIKit

/// Motion vocabulary shared by every screen. One curve for layout, one for feedback, and a
/// toast that floats over content instead of pushing it around. Everything here degrades to
/// a cross-fade under Reduce Motion.
///
/// Both are `Spring`s without overshoot: a list that settles past its place and comes back
/// reads as slow even at a short duration, and several of them running at once (a search that
/// swaps whole sections) read as one long elastic move. Durations are Apple's `smooth`/`snappy`
/// shape, shortened: content is close to where it was, so it does not need half a second.
enum AirMotion {
  /// Rows and sections that appear, grow or leave.
  static let layout: Animation = .smooth(duration: 0.2)
  /// Small confirmations: a symbol swap, a toast, a value that changed.
  static let feedback: Animation = .snappy(duration: 0.18, extraBounce: 0.05)
  /// A change too big to follow: the list swaps what it is showing (search opens or clears),
  /// so the old content does not slide out of the way; it is simply replaced.
  static let none: Animation? = nil
}

enum AirHaptics {
  /// A value landed on the clipboard or a short action completed.
  static func confirm() {
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
  }
}

extension View {
  /// Keeps the navigation items on screen while a search field is focused. Without it the
  /// system hides them to make room and snaps them back on blur, which reads as a glitch
  /// next to the animated list underneath.
  @ViewBuilder func keepsToolbarDuringSearch() -> some View {
    if #available(iOS 17.1, *) {
      searchPresentationToolbarBehavior(.avoidHidingContent)
    } else {
      self
    }
  }

  /// Cross-fades one SF Symbol into another in place (iOS 17); plain swap before that.
  @ViewBuilder func symbolReplace() -> some View {
    if #available(iOS 17.0, *) {
      contentTransition(.symbolEffect(.replace))
    } else {
      self
    }
  }

  /// Rolls changed digits instead of redrawing the whole number.
  func numericText() -> some View {
    contentTransition(.numericText())
  }

  /// Animates layout changes driven by `value` with the shared layout spring.
  func airLayout<V: Equatable>(_ value: V) -> some View {
    animation(AirMotion.layout, value: value)
  }

  /// A short confirmation floating above the bottom edge. `text == nil` hides it. The overlay
  /// takes no layout space, so the content underneath never shifts.
  func airToast(_ text: String?, systemImage: String, identifier: String) -> some View {
    modifier(AirToastModifier(text: text, systemImage: systemImage, identifier: identifier))
  }

  /// Marks the row a zoom navigation transition grows out of (iOS 18).
  @ViewBuilder func zoomSource(id: String, in namespace: Namespace.ID) -> some View {
    if #available(iOS 18.0, *) {
      matchedTransitionSource(id: id, in: namespace)
    } else {
      self
    }
  }

  /// The pushed screen that zooms out of its row (iOS 18).
  @ViewBuilder func zoomDestination(id: String, in namespace: Namespace.ID) -> some View {
    if #available(iOS 18.0, *) {
      navigationTransition(.zoom(sourceID: id, in: namespace))
    } else {
      self
    }
  }
}

private struct AirToastModifier: ViewModifier {
  let text: String?
  let systemImage: String
  let identifier: String
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content
      .overlay(alignment: .bottom) {
        if let text {
          // The identifier sits on the text so it stays a static text element for tests.
          Label {
            Text(text).accessibilityIdentifier(identifier)
          } icon: {
            Image(systemName: systemImage)
          }
          .font(.footnote.weight(.medium))
          .lineLimit(2)
          .multilineTextAlignment(.leading)
          .padding(.horizontal, 16)
          .padding(.vertical, 11)
          // Background only: an overlay would turn the label into a container element and
          // hide its identifier from accessibility and UI tests.
          .background {
            ZStack {
              Capsule().fill(.regularMaterial)
              Capsule().strokeBorder(.quaternary, lineWidth: 0.5)
            }
          }
          .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
          .padding(.horizontal, 20)
          .padding(.bottom, 12)
          .transition(
            reduceMotion
              ? .opacity
              : .move(edge: .bottom).combined(with: .opacity).combined(with: .scale(scale: 0.96))
          )
        }
      }
      .animation(AirMotion.feedback, value: text)
  }
}
