import ChromVoidBridge
import SwiftUI

struct CredentialCatalogRow: View {
  @AirLocalizedCopy private var copy
  var model: CredentialsModel
  let entry: CredentialSummary

  var namespace: Namespace.ID? = nil

  private var copied: Bool {
    if case .copied(let id, _) = model.quickCopyState, id == entry.id { return true }
    return false
  }
  /// Core omits the flag only on older pages; nothing there has codes.
  private var hasCodes: Bool { entry.hasCodes ?? false }
  /// Login and website on one line; either may be absent.
  private var detail: String {
    [entry.username, entry.website ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
  }

  var body: some View {
    HStack(spacing: 12) {
      Button {
        model.select(entry.id)
      } label: {
        HStack(spacing: 14) {
          CredentialMonogram(
            title: entry.title, entryType: entry.entryType,
            icon: model.icons.icon(for: entry.iconRef)
          )
          VStack(alignment: .leading, spacing: 3) {
            Text(entry.title.isEmpty ? copy.text("Untitled credential") : entry.title)
              .font(.headline)
            if !detail.isEmpty || hasCodes {
              HStack(spacing: 5) {
                if hasCodes {
                  Image(systemName: "timer")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(AirPalette.accent)
                    .accessibilityLabel(copy.text("Has one-time codes"))
                }
                if !detail.isEmpty {
                  Text(detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
              }
            }
            if entry.groupPath != "/" && !entry.groupPath.isEmpty {
              Text(entry.groupPath).font(.caption).foregroundStyle(.secondary)
            }
          }
          .accessibilityElement(children: .combine)
          Spacer(minLength: 0)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .modifier(ZoomSource(id: entry.id, namespace: namespace))
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("openCredential_" + entry.id)
      if let label = model.quickCopyLabel(for: entry) {
        Button {
          model.copyPrimarySecret(entry.id)
        } label: {
          Group {
            if model.quickCopyState == .loading(entry.id) {
              ProgressView()
            } else {
              // The button itself confirms the copy; the row keeps its height.
              Image(systemName: copied ? "checkmark" : "doc.on.doc")
                .symbolReplace()
                .foregroundStyle(copied ? Color.green : Color.accentColor)
            }
          }.frame(width: 44, height: 44)
        }
        .buttonStyle(.borderless)
        .disabled(model.isQuickCopying)
        .accessibilityLabel(copy.text(label))
        .accessibilityIdentifier("quickCopyCredential_" + entry.id)
      }
    }
    .listRowBackground(Color.clear)
    .animation(AirMotion.feedback, value: copied)
    .task(id: model.quickCopyState) {
      guard case .copied(let id, let receipt) = model.quickCopyState, id == entry.id else { return }
      try? await Task.sleep(for: .seconds(3))
      if !Task.isCancelled { model.clearQuickCopyFeedback(receipt) }
    }
  }
}

private struct ZoomSource: ViewModifier {
  let id: String
  let namespace: Namespace.ID?
  func body(content: Content) -> some View {
    if let namespace {
      content.zoomSource(id: id, in: namespace)
    } else {
      content
    }
  }
}

/// The picture of a credential in a list: its stored icon when it has one, otherwise an
/// initial-letter badge in the brand container. Payment cards keep their symbol.
struct CredentialMonogram: View {
  let title: String
  let entryType: String
  var icon: CredentialIconCache.Icon? = nil
  var size: CGFloat = 40

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
        .fill(icon?.background ?? AirPalette.container)
      if let icon {
        Image(uiImage: icon.image)
          .resizable()
          .interpolation(.high)
          .scaledToFit()
          .frame(width: size * 0.62, height: size * 0.62)
      } else if entryType == "payment_card" {
        Image(systemName: "creditcard").font(.system(size: size * 0.42, weight: .medium))
      } else if let initial = title.trimmingCharacters(in: .whitespacesAndNewlines).first {
        Text(String(initial).uppercased())
          .font(.system(size: size * 0.46, weight: .semibold, design: .rounded))
      } else {
        Image(systemName: "key").font(.system(size: size * 0.42, weight: .medium))
      }
    }
    .foregroundStyle(AirPalette.onContainer)
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}
