import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

public struct ImageAnimation: Sendable {
  public let source: ImageAnimationSource
  public let frameCount: Int
  /// Nil means the file requests indefinite repetition; otherwise total plays.
  public let playCount: Int?
}

public struct ImageAnimationFrame: Sendable {
  public let image: CGImage
  public let duration: TimeInterval
}

/// ImageIO and its encoded input stay on one actor. Frames are decoded on demand, never all at once.
public actor ImageAnimationSource {
  private var source: CGImageSource?
  private var format: Format?

  private enum Format {
    case gif, png
    var dictionary: CFString {
      self == .gif ? kCGImagePropertyGIFDictionary : kCGImagePropertyPNGDictionary
    }
    var delay: CFString {
      self == .gif ? kCGImagePropertyGIFUnclampedDelayTime : kCGImagePropertyAPNGUnclampedDelayTime
    }
    var clampedDelay: CFString {
      self == .gif ? kCGImagePropertyGIFDelayTime : kCGImagePropertyAPNGDelayTime
    }
    var loop: CFString {
      self == .gif ? kCGImagePropertyGIFLoopCount : kCGImagePropertyAPNGLoopCount
    }
  }

  func prepare(_ data: Data) throws -> DecodedImagePreview {
    try Task.checkCancellation()
    guard data.count <= ImagePreviewDecoder.maximumSourceBytes else {
      throw ImagePreviewError.tooLarge
    }
    guard
      let source = CGImageSourceCreateWithData(
        data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
      CGImageSourceGetStatus(source) == .statusComplete
    else { throw ImagePreviewError.unsupported }
    let count = CGImageSourceGetCount(source)
    let type = CGImageSourceGetType(source).map { $0 as String }
    let format: Format? =
      type == UTType.gif.identifier ? .gif : type == UTType.png.identifier ? .png : nil
    let poster = try Self.decode(source, index: 0)
    var animation: ImageAnimation?
    if count > 1, let format {
      self.source = source
      self.format = format
      let properties = CGImageSourceCopyProperties(source, nil) as? [String: Any]
      let details = properties?[format.dictionary as String] as? [String: Any]
      let loops = (details?[format.loop as String] as? NSNumber)?.intValue
      // GIF stores additional repetitions; APNG stores total plays. Missing metadata plays once.
      let plays: Int?
      if let loops {
        plays = loops == 0 ? nil : max(1, loops + (format == .gif ? 1 : 0))
      } else {
        plays = 1
      }
      animation = ImageAnimation(source: self, frameCount: count, playCount: plays)
    }
    try Task.checkCancellation()
    return DecodedImagePreview(
      image: poster, frameCount: count, animation: animation, details: ImageDetails.read(source))
  }

  public func frame(at index: Int) throws -> ImageAnimationFrame {
    try Task.checkCancellation()
    guard let source, let format, (0..<CGImageSourceGetCount(source)).contains(index) else {
      throw ImagePreviewError.incomplete
    }
    let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [String: Any]
    let details = properties?[format.dictionary as String] as? [String: Any]
    let delay =
      (details?[format.delay as String] as? NSNumber)?.doubleValue
      ?? (details?[format.clampedDelay as String] as? NSNumber)?.doubleValue ?? 0.1
    // Match the common browser treatment of absent/near-zero delays; avoid a busy decode loop.
    let duration = delay.isFinite && delay >= 0.011 ? delay : 0.1
    let image = try Self.decode(source, index: index)
    try Task.checkCancellation()
    return ImageAnimationFrame(image: image, duration: duration)
  }

  public func close() {
    source = nil
    format = nil
  }

  private static func decode(_ source: CGImageSource, index: Int) throws -> CGImage {
    defer { CGImageSourceRemoveCacheAtIndex(source, index) }
    guard
      let image = CGImageSourceCreateThumbnailAtIndex(
        source, index,
        [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: ImagePreviewDecoder.maximumPixelSize,
          kCGImageSourceShouldCacheImmediately: true,
        ] as CFDictionary)
    else { throw ImagePreviewError.unsupported }
    return image
  }
}
