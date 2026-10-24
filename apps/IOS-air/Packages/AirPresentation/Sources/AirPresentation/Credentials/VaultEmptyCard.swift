import SwiftUI

/// The vault root with nothing in it: one brand card in the language of the wallet card and
/// the landing, with the two ways to get a first password in. Replaces the plain empty text;
/// the `emptyVault` identifier stays on a text so the existing checks keep working.
struct VaultEmptyCard: View {
  @AirLocalizedCopy private var copy
  let addPassword: () -> Void
  let importCredentials: () -> Void

  var body: some View {
    ZStack(alignment: .topLeading) {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .fill(
          LinearGradient(
            colors: AirPalette.cardCyan, startPoint: .topLeading, endPoint: .bottomTrailing))
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .strokeBorder(.white.opacity(0.18), lineWidth: 0.5)
      Image("ChromVoidContour", bundle: .module)
        .resizable()
        .scaledToFit()
        .frame(width: 168, height: 168)
        .foregroundStyle(.white.opacity(0.22))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .offset(x: 36, y: -30)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 0) {
        Text(copy.text("ChromVoid · on this device"))
          .font(.system(size: 11, weight: .semibold))
          .textCase(.uppercase).tracking(0.6).opacity(0.75)
        Text(copy.text("This vault is empty"))
          .font(.title2.weight(.semibold))
          .padding(.top, 4)
          .accessibilityIdentifier("emptyVault")
        Text(copy.text("Add your first password, or bring them over from another manager."))
          .font(.subheadline)
          .opacity(0.88)
          .padding(.top, 6)
          .fixedSize(horizontal: false, vertical: true)
        HStack(spacing: 10) {
          Button(action: addPassword) {
            Label(copy.text("Add password"), systemImage: "plus")
              .font(.subheadline.weight(.semibold))
              .padding(.horizontal, 14).padding(.vertical, 9)
              .background(.white, in: Capsule())
              .foregroundStyle(AirPalette.cardCyan[2])
          }
          .accessibilityIdentifier("emptyVaultAdd")
          Button(action: importCredentials) {
            Label(copy.text("Import"), systemImage: "square.and.arrow.down")
              .font(.subheadline.weight(.semibold))
              .padding(.horizontal, 14).padding(.vertical, 9)
              .background(.white.opacity(0.16), in: Capsule())
              .overlay(Capsule().strokeBorder(.white.opacity(0.45), lineWidth: 0.5))
          }
          .accessibilityIdentifier("emptyVaultImport")
        }
        .buttonStyle(.plain)
        .padding(.top, 18)
      }
      .padding(18)
      .frame(maxWidth: .infinity, alignment: .leading)
      .foregroundStyle(.white)
    }
    .shadow(color: .black.opacity(0.18), radius: 14, y: 8)
    .padding(.vertical, 6)
  }
}

#if DEBUG
  #Preview("Empty vault") {
    List {
      Section {
        VaultEmptyCard(addPassword: {}, importCredentials: {})
          .listRowInsets(EdgeInsets())
          .listRowBackground(Color.clear)
      }
    }
    .airCanvas()
  }
#endif
