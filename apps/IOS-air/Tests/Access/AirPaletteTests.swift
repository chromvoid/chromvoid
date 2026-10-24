import AirPresentation
import UIKit
import XCTest

final class AirPaletteTests: XCTestCase {
  private func components(
    _ color: UIColor, style: UIUserInterfaceStyle, space: CFString
  ) -> [CGFloat] {
    let resolved = color.resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
    let converted = resolved.cgColor.converted(
      to: CGColorSpace(name: space)!, intent: .defaultIntent, options: nil)!
    return Array(converted.components!.prefix(3))
  }

  func testAccentMatchesTheBrandTokensInDisplayP3() {
    // oklch(52% 0.138 232) from packages/theme/src/brand.css.
    let accent = components(
      UIColor(AirPalette.accent), style: .light, space: CGColorSpace.displayP3)
    XCTAssertEqual(accent[0], 0.016, accuracy: 0.005)
    XCTAssertEqual(accent[1], 0.446, accuracy: 0.005)
    XCTAssertEqual(accent[2], 0.647, accuracy: 0.005)
  }

  func testOutOfGamutChromaIsReducedInsteadOfClipped() {
    // Chroma far beyond what P3 holds at this lightness: the mapped colour stays on hue, so
    // red remains the smallest channel and blue the largest, and no channel saturates.
    let wild = components(
      OKLCH(l: 0.55, c: 0.4, h: 232).displayP3, style: .light, space: CGColorSpace.displayP3)
    XCTAssertLessThan(wild[0], wild[1])
    XCTAssertLessThan(wild[1], wild[2])
    XCTAssertLessThan(wild[2], 0.999)
    XCTAssertGreaterThanOrEqual(wild[0], 0)
  }

  func testDarkAccentMatchesTheBrandTokensInDisplayP3() {
    // oklch(83.7% 0.105 232) from packages/theme/src/brand.css: the light set's hue.
    let dark = components(
      UIColor(AirPalette.accent), style: .dark, space: CGColorSpace.displayP3)
    XCTAssertEqual(dark[0], 0.577, accuracy: 0.005)
    XCTAssertEqual(dark[1], 0.830, accuracy: 0.005)
    XCTAssertEqual(dark[2], 0.995, accuracy: 0.005)
  }
}
