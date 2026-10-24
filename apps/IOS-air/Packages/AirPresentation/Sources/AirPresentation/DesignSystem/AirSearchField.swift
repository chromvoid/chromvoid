import SwiftUI
import UIKit

/// The vault's own search field. The system one is drawn by iOS in a fill made for the grouped
/// grey background; on this canvas it reads as a dark bar (L* 93 against a page at 98) and
/// turns white on focus, and iOS 26 ignores every documented way to recolour it. This one is
/// an ordinary text field in the brand's surface colour: it shows the ring on focus instead of
/// changing its fill, and it never takes the navigation items away while it is being typed in.
struct AirSearchField: View {
  @AirLocalizedCopy private var copy
  /// The copy key of the placeholder.
  let prompt: String
  @Binding var text: String
  /// Accessibility identifier of the field; its clear button takes `<identifier>Clear`.
  let identifier: String
  /// Called when the field is cleared by its own button, for a screen that also dismisses.
  var onClear: (() -> Void)? = nil
  @FocusState private var focused: Bool

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .font(.body)
        .foregroundStyle(focused ? AirPalette.accent : Color.secondary)
        .accessibilityHidden(true)
      TextField(copy.text(prompt), text: $text)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.search)
        .focused($focused)
        .accessibilityLabel(copy.text(prompt))
        .accessibilityIdentifier(identifier)
      if !text.isEmpty {
        Button {
          text = ""
          onClear?()
        } label: {
          Image(systemName: "xmark.circle.fill")
            .font(.body)
            .foregroundStyle(Color.secondary)
            .frame(width: 32, height: 32)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(copy.text("Clear search"))
        .accessibilityIdentifier(identifier + "Clear")
        .transition(.opacity)
      }
    }
    .padding(.leading, 12)
    .padding(.trailing, text.isEmpty ? 12 : 2)
    .frame(height: 40)
    .background {
      Capsule(style: .continuous).fill(AirPalette.surfaceSecondary)
    }
    .overlay {
      Capsule(style: .continuous)
        .strokeBorder(focused ? AirPalette.accent.opacity(0.5) : .clear, lineWidth: 1.5)
    }
    .animation(AirMotion.feedback, value: focused)
    .animation(AirMotion.feedback, value: text.isEmpty)
  }
}

/// Closing the keyboard from a screen that owns its own search field. `dismissSearch` only
/// speaks to `.searchable`, so a screen with its own field asks the responder chain instead.
enum AirKeyboard {
  @MainActor static func dismiss() {
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
  }
}

extension View {
  /// The field as the first row of a `List`: on the canvas, not in a boxed row, and scrolling
  /// away with the content as the system field does.
  func airSearchRow() -> some View {
    listRowBackground(Color.clear)
      .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 8, trailing: 16))
      .listRowSeparator(.hidden)
  }
}

#if DEBUG
  private struct AirSearchFieldPreview: View {
    @State private var query = ""
    var body: some View {
      List {
        Section {
          AirSearchField(
            prompt: "Name, username, website or tag", text: $query, identifier: "preview_search"
          )
          .airSearchRow()
        }
        Section { Text(verbatim: query.isEmpty ? "Everything" : "Matching " + query) }
      }
      .airCanvas()
    }
  }

  #Preview("Search field") { AirSearchFieldPreview() }
#endif
