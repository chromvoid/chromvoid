import SwiftUI
import UIKit

/// The ChromVoid Air colour roles (business/brand/color-system.md, "graphite and ice blue").
///
/// Both sets are authored in OKLCH on hue 232 (the same numbers as `packages/theme/src/brand.css`)
/// and rendered in Display P3, which carries more chroma than sRGB at the same lightness; a
/// colour outside P3 has its chroma reduced until it fits, and the system clips P3 to sRGB on
/// narrower displays. Every text/background pair keeps its WCAG contrast on the sRGB fallback.
/// `AccentColor` in the app asset catalog carries the same accent for system tint.
public enum AirPalette {
  /// Page ground behind grouped content: cool off-white, not the lilac system grey.
  public static let canvas = dynamic(oklch(0.978, 0.005, 248), oklch(0.158, 0.007, 258))
  /// Raised secondary surface (segmented fills, inactive chips).
  public static let surfaceSecondary = dynamic(oklch(0.958, 0.007, 234), oklch(0.275, 0.024, 246))
  /// Text, icons and links that identify an action; 5.4:1 on white.
  public static let accent = dynamic(oklch(0.52, 0.138, 232), darkAccent)
  /// Filled primary control; 4.7:1 with `onButton` text.
  public static let button = dynamic(oklch(0.55, 0.146, 232), darkAccent)
  public static let onButton = dynamic(oklch(1, 0, 0), oklch(0.277, 0.05, 232))
  /// Tinted container behind an avatar, a selected chip or an active tab.
  public static let container = dynamic(oklch(0.95, 0.030, 232), oklch(0.331, 0.055, 232))
  /// Text and glyphs on `container`; 8.3:1 in light.
  public static let onContainer = dynamic(oklch(0.42, 0.112, 232), oklch(0.903, 0.06, 232))
  /// Decorative cyan for gradients and illustration only, never behind body text.
  public static let bright = dynamic(oklch(0.66, 0.175, 232), darkAccent)

  /// Mark-only motion colours from business/brand/motion.md, authored in sRGB.
  static let brandSignal = dynamic(
    UIColor(red: 31.0 / 255, green: 194.0 / 255, blue: 240.0 / 255, alpha: 1),
    UIColor(red: 47.0 / 255, green: 224.0 / 255, blue: 1, alpha: 1))
  static let brandOpenRing = dynamic(
    UIColor(red: 11.0 / 255, green: 159.0 / 255, blue: 213.0 / 255, alpha: 1),
    UIColor(red: 132.0 / 255, green: 213.0 / 255, blue: 1, alpha: 1))

  /// The wallet card gradient in the brand family: a lit top-left corner falling into depth.
  public static let cardCyan: [Color] = [
    Color(uiColor: oklch(0.66, 0.175, 232)), Color(uiColor: oklch(0.50, 0.133, 232)),
    Color(uiColor: oklch(0.36, 0.096, 232)),
  ]

  /// The ice-blue accent of the dark set, on the light set's hue (sRGB fallback `#84D5FF`).
  private static let darkAccent = oklch(0.837, 0.105, 232)

  private static func dynamic(_ light: UIColor, _ dark: UIColor) -> Color {
    Color(uiColor: uiDynamic(light, dark))
  }
  private static func uiDynamic(_ light: UIColor, _ dark: UIColor) -> UIColor {
    UIColor { $0.userInterfaceStyle == .dark ? dark : light }
  }
  private static func oklch(_ l: Double, _ c: Double, _ h: Double) -> UIColor {
    OKLCH(l: l, c: c, h: h).displayP3
  }
}

extension View {
  /// Brand canvas behind a `List`/`Form` instead of the system grouped grey, which is a
  /// lilac-tinted grey that dulls the cyan accent next to it.
  public func airCanvas() -> some View {
    scrollContentBackground(.hidden).background(AirPalette.canvas.ignoresSafeArea())
  }
}

/// OKLCH → Display P3 with chroma-reducing gamut mapping (Björn Ottosson's OKLab matrices;
/// linear P3 via the Display P3 → XYZ D65 matrix).
public struct OKLCH {
  public var l: Double
  public var c: Double
  public var h: Double

  public init(l: Double, c: Double, h: Double) {
    self.l = l
    self.c = c
    self.h = h
  }

  public var displayP3: UIColor {
    var chroma = c
    var rgb = OKLCH.linearP3(l: l, c: chroma, h: h)
    if !OKLCH.inGamut(rgb) {
      var low = 0.0
      var high = chroma
      for _ in 0..<24 {
        let mid = (low + high) / 2
        if OKLCH.inGamut(OKLCH.linearP3(l: l, c: mid, h: h)) { low = mid } else { high = mid }
      }
      chroma = low
      rgb = OKLCH.linearP3(l: l, c: chroma, h: h)
    }
    return UIColor(
      displayP3Red: OKLCH.encode(rgb.0), green: OKLCH.encode(rgb.1), blue: OKLCH.encode(rgb.2),
      alpha: 1)
  }

  private static func linearP3(l: Double, c: Double, h: Double) -> (Double, Double, Double) {
    let a = c * cos(h * .pi / 180)
    let b = c * sin(h * .pi / 180)
    let lp = l + 0.3963377774 * a + 0.2158037573 * b
    let mp = l - 0.1055613458 * a - 0.0638541728 * b
    let sp = l - 0.0894841775 * a - 1.2914855480 * b
    let lms = (lp * lp * lp, mp * mp * mp, sp * sp * sp)
    let x = 1.2268798733 * lms.0 - 0.5578149965 * lms.1 + 0.2813910456 * lms.2
    let y = -0.0405801784 * lms.0 + 1.1122568696 * lms.1 - 0.0716766787 * lms.2
    let z = -0.0763812845 * lms.0 - 0.4214819784 * lms.1 + 1.5861632204 * lms.2
    return (
      2.4934969119 * x - 0.9313836179 * y - 0.4027107845 * z,
      -0.8294889696 * x + 1.7626640603 * y + 0.0236246858 * z,
      0.0358458302 * x - 0.0761724110 * y + 0.9568845240 * z
    )
  }
  private static func inGamut(_ rgb: (Double, Double, Double)) -> Bool {
    let tolerance = 0.0005
    return [rgb.0, rgb.1, rgb.2].allSatisfy { $0 >= -tolerance && $0 <= 1 + tolerance }
  }
  private static func encode(_ linear: Double) -> CGFloat {
    let v = min(max(linear, 0), 1)
    return CGFloat(v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1 / 2.4) - 0.055)
  }
}
