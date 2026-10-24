import SwiftUI

/// Consumed even under Reduce Motion: returning to the lock never replays the cold-start reveal.
@MainActor
enum BrandIntro {
  static var played = false
}

/// The existing brand artwork, separated into ribbon and core so each moves on its own geometry.
/// All frame values and access timing follow business/brand/motion.md.
struct BrandMarkView: View {
  var size: CGFloat = 56
  var animated = false
  var unlockMotion: BrandUnlockMotion?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var intro: Date?
  @State private var returning: Date?
  @State private var appearanceAnimating = false
  @State private var finishing = false

  private var animating: Bool {
    appearanceAnimating || finishing || (unlockMotion != nil && unlockMotion?.completedAt == nil)
  }

  private var appearanceEnd: Date? {
    if let intro { return intro.addingTimeInterval(1.44) }
    return returning?.addingTimeInterval(0.35)
  }

  var body: some View {
    TimelineView(.animation(paused: !animating)) { timeline in
      BrandMarkDrawing(
        size: size,
        frame: BrandMarkFrame(
          date: timeline.date, intro: intro, returning: returning,
          unlock: unlockMotion, reduceMotion: reduceMotion))
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
    .task {
      guard animated else { return }
      let first = !BrandIntro.played
      BrandIntro.played = true
      guard !reduceMotion else { return }
      if first { intro = Date() } else { returning = Date() }
    }
    .onChange(of: unlockMotion) { previous, current in
      // A lock can interrupt the shell's fade while this entry view is still mounted.
      if animated, !reduceMotion, previous?.completedAt != nil, current == nil {
        intro = nil
        returning = Date()
      }
    }
    .task(id: appearanceEnd) {
      guard let appearanceEnd else { return }
      appearanceAnimating = true
      try? await Task.sleep(for: .seconds(max(0, appearanceEnd.timeIntervalSinceNow)))
      if !Task.isCancelled { appearanceAnimating = false }
    }
    .task(id: unlockMotion) {
      guard let end = unlockMotion?.ringStartedAt, !reduceMotion else {
        finishing = false
        return
      }
      finishing = true
      try? await Task.sleep(
        for: .seconds(max(0, end.addingTimeInterval(0.55).timeIntervalSinceNow)))
      if !Task.isCancelled { finishing = false }
    }
  }
}

private struct BrandMarkDrawing: View {
  let size: CGFloat
  let frame: BrandMarkFrame
  private let anchor = UnitPoint(x: 143.0 / 256, y: 118.0 / 256)

  private var artwork: some View {
    Image("ChromVoidMark", bundle: .module).resizable().scaledToFit()
      .frame(width: size, height: size)
  }

  var body: some View {
    let unit = size / 256
    ZStack {
      Circle()
        .fill(Color(red: 0, green: 229.0 / 255, blue: 1))
        .frame(width: 42 * unit, height: 42 * unit)
        .blur(radius: 4 * unit)
        .scaleEffect(frame.auraScale)
        .opacity(frame.auraOpacity)
        .position(x: 143 * unit, y: 118 * unit)
      ZStack {
        artwork
        if let start = frame.signalStart {
          BrandSpiralTrace(
            start: max(0, start / 603), end: min(1, max(0, (start + 78) / 603)),
            width: 86
          )
          .fill(AirPalette.brandSignal)
          .blur(radius: 7 * unit)
          .opacity(frame.signalOpacity)
          // Alpha is the original ribbon, not an approximation by the centreline stroke.
          .mask(artwork)
        }
      }
      .mask {
        ZStack {
          BrandSpiralTrace(end: frame.trace, width: frame.width).fill(.white)
          Ellipse()
            .fill(.black)
            .frame(width: 60 * unit, height: 50 * unit)
            .rotationEffect(.degrees(-12))
            .position(x: 144 * unit, y: 120 * unit)
            .blendMode(.destinationOut)
        }
        .compositingGroup()
      }
      .rotationEffect(.degrees(frame.rotation), anchor: anchor)
      .scaleEffect(frame.spiralScale, anchor: anchor)
      .opacity(frame.spiralOpacity)
      ZStack {
        // Exclude the baked ring so its own opacity and scale can follow the appearance table.
        artwork.mask {
          Circle().frame(width: 34.1 * unit, height: 34.1 * unit)
            .position(x: 143 * unit, y: 118 * unit)
        }
        Circle()
          .stroke(Color(red: 152.0 / 255, green: 247.0 / 255, blue: 1), lineWidth: 0.9 * unit)
          .frame(width: 35 * unit, height: 35 * unit)
          .scaleEffect(frame.coreRingScale)
          .opacity(frame.coreRingOpacity)
          .position(x: 143 * unit, y: 118 * unit)
      }
      .scaleEffect(frame.coreScale, anchor: anchor)
      .opacity(frame.coreOpacity)
      if let ring = frame.ringProgress {
        // Grow the radius, not the stroked view: the outline remains two points throughout.
        Circle()
          .stroke(AirPalette.brandOpenRing, lineWidth: 2)
          .frame(width: 44 * unit * (1 + 3 * ring), height: 44 * unit * (1 + 3 * ring))
          .opacity(0.8 * (1 - ring))
          .position(x: 143 * unit, y: 118 * unit)
      }
    }
    .frame(width: size, height: size)
  }
}

/// The `spiralTrace` path of `chromvoid-icon.svg` as a stroked region, rotated −90° around the
/// artboard center and offset by the icon group translation, scaled to the view.
private struct BrandSpiralTrace: Shape {
  var start = 0.0
  var end = 1.0
  var width = 72.0

  private static let points: [(CGPoint, CGPoint, CGPoint)] = [
    (CGPoint(x: 32, y: 160), CGPoint(x: 30, y: 135), CGPoint(x: 34, y: 114)),
    (CGPoint(x: 40, y: 81), CGPoint(x: 59, y: 55), CGPoint(x: 88, y: 42)),
    (CGPoint(x: 120, y: 27), CGPoint(x: 154, y: 39), CGPoint(x: 180, y: 62)),
    (CGPoint(x: 205, y: 86), CGPoint(x: 211, y: 124), CGPoint(x: 198, y: 153)),
    (CGPoint(x: 184, y: 184), CGPoint(x: 153, y: 199), CGPoint(x: 122, y: 189)),
    (CGPoint(x: 93, y: 180), CGPoint(x: 75, y: 154), CGPoint(x: 79, y: 125)),
    (CGPoint(x: 82, y: 100), CGPoint(x: 102, y: 88), CGPoint(x: 131, y: 98)),
  ]

  func path(in rect: CGRect) -> Path {
    let scale = min(rect.width, rect.height) / 256
    var path = Path()
    path.move(to: CGPoint(x: 38, y: 178))
    for (control1, control2, end) in Self.points {
      path.addCurve(to: end, control1: control1, control2: control2)
    }
    let transform = CGAffineTransform(translationX: 15, y: -10)
      .translatedBy(x: 128, y: 128)
      .rotated(by: -.pi / 2)
      .translatedBy(x: -128, y: -128)
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
    return path.applying(transform)
      .trimmedPath(from: start, to: end)
      .strokedPath(StrokeStyle(lineWidth: width * scale, lineCap: .butt))
  }
}

/// A list row that navigates or opens a tool: label color for the title, accent for the symbol,
/// a trailing chevron. Keeps accent text for real actions such as Copy.
struct NavigationRow: View {
  let title: String
  let systemImage: String
  var detail: String? = nil

  var body: some View {
    HStack(spacing: 14) {
      Image(systemName: systemImage)
        .font(.body.weight(.medium))
        .foregroundStyle(Color.accentColor)
        .frame(width: 28)
      VStack(alignment: .leading, spacing: 3) {
        Text(title).foregroundStyle(.primary)
        if let detail, !detail.isEmpty {
          Text(detail).font(.caption).foregroundStyle(.secondary)
        }
      }
      Spacer(minLength: 8)
      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.tertiary)
        .accessibilityHidden(true)
    }
    .frame(minHeight: 44)
    .contentShape(Rectangle())
  }
}
