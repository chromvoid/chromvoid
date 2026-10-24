import Foundation

/// Timeline from business/brand/motion.md. The same timestamps drive the mark and shell admission;
/// presentation never delays the authoritative unlock or depends on the vault's contents.
struct BrandUnlockMotion: Equatable {
  let startedAt: Date
  var completedAt: Date? = nil

  var ringStartedAt: Date? {
    guard let completedAt else { return nil }
    let cycle = Self.cycleTime(completedAt.timeIntervalSince(startedAt))
    return completedAt.addingTimeInterval(cycle < 1.15 ? 0.22 : 0)
  }

  static func cycleTime(_ elapsed: TimeInterval) -> TimeInterval {
    max(0, elapsed).truncatingRemainder(dividingBy: 1.4)
  }

  static func signalStart(at elapsed: TimeInterval) -> Double {
    -78 + 681 * pow(min(cycleTime(elapsed) / 1.15, 1), 1.6)
  }
}

/// A sampled frame makes the prescribed curves exact and lets an interrupted run continue from
/// its current path position. SwiftUI only renders it; no repeating spring or completion polling.
struct BrandMarkFrame {
  var trace = 1.0
  var width = 72.0
  var spiralOpacity = 1.0
  var rotation = 0.0
  var spiralScale = 1.0
  var coreScale = 1.0
  var coreOpacity = 1.0
  var auraOpacity = 0.05
  var auraScale = 1.0
  var coreRingOpacity = 0.58
  var coreRingScale = 1.0
  var signalStart: Double?
  var signalOpacity = 0.0
  var ringProgress: Double?

  init(
    date: Date, intro: Date? = nil, returning: Date? = nil,
    unlock: BrandUnlockMotion? = nil, reduceMotion: Bool = false
  ) {
    if !reduceMotion {
      if let intro {
        let t = date.timeIntervalSince(intro)
        trace = Self.bezier(Self.progress(t, duration: 1.08), x1: 0.45, x2: 0.55, y1: 0)
        width = 10 + 62 * Self.easeOut(Self.progress(t - 0.08, duration: 0.78))
        spiralOpacity = Self.progress(t, duration: 0.14)
        let scene = Self.easeOut(Self.progress(t, duration: 1.05))
        rotation = -8 * (1 - scene)
        spiralScale = 0.88 + 0.12 * scene
        let aura = Self.easeOut(Self.progress(t - 0.82, duration: 0.48))
        auraOpacity = 0.05 * aura
        auraScale = 0.8 + 0.2 * aura
        coreScale = 0.18 + 0.82 * Self.backOut(Self.progress(t - 0.9, duration: 0.54), s: 1.25)
        coreOpacity = Self.easeOut(Self.progress(t - 0.9, duration: 0.16))
        let ring = Self.easeOut(Self.progress(t - 1.02, duration: 0.34))
        coreRingOpacity = 1 - 0.42 * ring
        coreRingScale = 0.88 + 0.12 * ring
      } else if let returning {
        coreScale =
          0.85 + 0.15
          * Self.backOut(
            Self.progress(date.timeIntervalSince(returning), duration: 0.35), s: 1)
      }
    }
    guard let unlock else { return }
    let elapsed = max(0, date.timeIntervalSince(unlock.startedAt))
    if reduceMotion {
      if unlock.completedAt == nil {
        coreOpacity = 1 - 0.4 * (0.5 - 0.5 * cos(2 * .pi * elapsed / 2.4))
      }
      return
    }
    if let completed = unlock.completedAt, let ringStart = unlock.ringStartedAt {
      if date < ringStart {
        let start = BrandUnlockMotion.signalStart(at: completed.timeIntervalSince(unlock.startedAt))
        let u = Self.progress(date.timeIntervalSince(completed), duration: 0.22)
        signalStart = start + (603 - start) * u * u
        let fadeTime =
          BrandUnlockMotion.cycleTime(completed.timeIntervalSince(unlock.startedAt))
          + max(0, date.timeIntervalSince(completed))
        signalOpacity = 0.85 * Self.progress(fadeTime, duration: 0.14)
      } else {
        let t = date.timeIntervalSince(ringStart)
        if t < 0.55 { ringProgress = Self.easeOut(Self.progress(t, duration: 0.55)) }
        respond(t, duration: 0.22, scale: 0.06, aura: 0.2)
      }
    } else {
      let cycle = BrandUnlockMotion.cycleTime(elapsed)
      if cycle < 1.15 {
        signalStart = BrandUnlockMotion.signalStart(at: elapsed)
        signalOpacity = 0.85 * Self.progress(cycle, duration: 0.14)
      }
      // The 260 ms response overlaps the next 1400 ms cycle by its final 10 ms.
      if cycle >= 1.15 {
        respond(cycle - 1.15, duration: 0.26, scale: 0.07, aura: 0.22)
      } else if elapsed >= 1.4, cycle < 0.01 {
        respond(cycle + 0.25, duration: 0.26, scale: 0.07, aura: 0.22)
      }
    }
  }

  private mutating func respond(_ t: Double, duration: Double, scale: Double, aura: Double) {
    let k = sin(.pi * Self.progress(t, duration: duration))
    coreScale *= 1 + scale * k
    auraOpacity += aura * k
  }

  private static func progress(_ t: Double, duration: Double) -> Double {
    min(max(t / duration, 0), 1)
  }

  private static func backOut(_ x: Double, s: Double) -> Double {
    1 + (s + 1) * pow(x - 1, 3) + s * pow(x - 1, 2)
  }

  private static func easeOut(_ x: Double) -> Double {
    bezier(x, x1: 0.5, x2: 0.89, y1: 1)
  }

  /// Invert the cubic's time coordinate; SwiftUI's built-in ease curves have different handles.
  private static func bezier(_ x: Double, x1: Double, x2: Double, y1: Double) -> Double {
    guard x > 0, x < 1 else { return x }
    var low = 0.0
    var high = 1.0
    for _ in 0..<18 {
      let u = (low + high) / 2
      let time = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u
      if time < x { low = u } else { high = u }
    }
    let u = (low + high) / 2
    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u + u * u * u
  }
}
