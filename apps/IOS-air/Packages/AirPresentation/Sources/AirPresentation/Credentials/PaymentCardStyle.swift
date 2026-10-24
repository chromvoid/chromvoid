import SwiftUI

/// The look of a card network. Colours are authored in OKLCH and rendered in Display P3, as
/// `AirPalette` is: saturated where P3 allows, clipped to sRGB on older displays. Each card is
/// a lit top-left corner falling into depth, with the network's second colour glowing from the
/// far corner, so the white type keeps its contrast over every part of the face.
struct PaymentCardStyle {
  /// Lit corner, core, depth.
  let base: [Color]
  /// The network's second colour, and how strongly it shows: a warm glow over graphite or a
  /// complementary hue turns muddy when it is as strong as a glow within the same family.
  let glow: Color
  let glowStrength: Double

  init(_ brand: PaymentCardBrand?) {
    switch brand {
    case .visa:
      // Visa blue (#1434CB) brought forward into an electric blue over indigo.
      self.init(
        (0.60, 0.20, 258), (0.45, 0.23, 264), (0.27, 0.15, 270), glow: (0.78, 0.13, 215))
    case .mastercard:
      // Neutral graphite with a faint ember of the network's orange.
      self.init(
        (0.34, 0.006, 260), (0.23, 0.005, 260), (0.14, 0.004, 260), glow: (0.64, 0.21, 38),
        strength: 0.3)
    case .mir:
      self.init(
        (0.60, 0.15, 158), (0.45, 0.12, 166), (0.29, 0.08, 182), glow: (0.78, 0.12, 215))
    case .amex:
      self.init(
        (0.64, 0.14, 238), (0.47, 0.15, 250), (0.30, 0.12, 263), glow: (0.90, 0.05, 210))
    case .unionpay:
      self.init(
        (0.58, 0.20, 22), (0.42, 0.16, 16), (0.27, 0.10, 10), glow: (0.68, 0.12, 200),
        strength: 0.3)
    case .jcb:
      self.init(
        (0.60, 0.14, 160), (0.44, 0.11, 195), (0.29, 0.10, 255), glow: (0.66, 0.19, 25),
        strength: 0.25)
    case .discover:
      self.init((0.68, 0.17, 55), (0.53, 0.18, 42), (0.33, 0.12, 36), glow: (0.88, 0.12, 85))
    case .dinersclub:
      self.init(
        (0.56, 0.06, 245), (0.40, 0.05, 250), (0.25, 0.03, 255), glow: (0.80, 0.08, 220))
    case .maestro:
      self.init(
        (0.48, 0.13, 255), (0.32, 0.09, 258), (0.19, 0.04, 260), glow: (0.66, 0.20, 25),
        strength: 0.3)
    case .none:
      // No network yet: the brand's graphite and ice blue.
      self.init(
        (0.44, 0.03, 240), (0.31, 0.025, 245), (0.19, 0.015, 250), glow: (0.66, 0.175, 232))
    }
  }

  private init(
    _ lit: (Double, Double, Double), _ core: (Double, Double, Double),
    _ depth: (Double, Double, Double), glow: (Double, Double, Double), strength: Double = 0.5
  ) {
    base = [lit, core, depth].map { Color(uiColor: OKLCH(l: $0.0, c: $0.1, h: $0.2).displayP3) }
    self.glow = Color(uiColor: OKLCH(l: glow.0, c: glow.1, h: glow.2).displayP3)
    glowStrength = strength
  }

  /// A shadow in the card's own depth colour: it reads as the card lifting, not a grey smudge.
  var shadow: Color { base[2].opacity(0.45) }
}

/// The face without its type: shared by the static card and the card that is the form.
struct PaymentCardBackground: View {
  let brand: PaymentCardBrand?

  var body: some View {
    let style = PaymentCardStyle(brand)
    let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
    GeometryReader { geometry in
      let size = geometry.size
      ZStack {
        LinearGradient(colors: style.base, startPoint: .topLeading, endPoint: .bottomTrailing)
        RadialGradient(
          colors: [style.glow.opacity(style.glowStrength), style.glow.opacity(0)],
          center: UnitPoint(x: 1.05, y: 1.1), startRadius: 0, endRadius: size.width * 0.8)
        // Quiet rings from the far corner, the pattern printed cards carry.
        ForEach(0..<3, id: \.self) { ring in
          Circle()
            .stroke(.white.opacity(0.07), lineWidth: 1)
            .frame(width: size.width * (0.55 + 0.3 * CGFloat(ring)))
            .position(x: size.width * 0.98, y: size.height * 1.02)
        }
        // A soft sheen over the top, as light falls on a real card.
        LinearGradient(
          stops: [
            .init(color: .white.opacity(0.20), location: 0),
            .init(color: .white.opacity(0.05), location: 0.35),
            .init(color: .clear, location: 0.6),
          ],
          startPoint: .topLeading, endPoint: .bottom)
      }
    }
    .clipShape(shape)
    .overlay {
      shape.strokeBorder(
        LinearGradient(
          colors: [.white.opacity(0.38), .white.opacity(0.06)], startPoint: .topLeading,
          endPoint: .bottomTrailing),
        lineWidth: 0.75)
    }
    .accessibilityHidden(true)
  }
}

#if DEBUG
  #Preview("Networks") {
    ScrollView {
      VStack(spacing: 16) {
        ForEach([nil] + PaymentCardBrand.allCases.map(Optional.some), id: \.self) { brand in
          PaymentCardFace(
            brand: brand, last4: "4242", holder: "Alice Miller", month: 6, year: 2031)
        }
      }
      .padding()
    }
    .background(AirPalette.canvas)
  }
#endif
