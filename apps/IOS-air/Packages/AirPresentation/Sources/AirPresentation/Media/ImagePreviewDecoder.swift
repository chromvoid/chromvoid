import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

public enum ImagePreviewError: Error { case tooLarge, unsupported, incomplete }

public struct DecodedImagePreview: Sendable {
  public let image: CGImage
  public let frameCount: Int
  public let animation: ImageAnimation?
  public let details: ImageDetails
}

/// Apple image decoding only. Core owns file identity, bytes and session authority.
public enum ImagePreviewDecoder {
  public static let maximumSourceBytes = 32 * 1024 * 1024
  public static let maximumPixelSize = 2048

  public static func supports(name: String, mimeType: String?) -> Bool {
    let type =
      mimeType.flatMap { UTType(mimeType: $0) }
      ?? UTType(filenameExtension: (name as NSString).pathExtension)
    return type?.conforms(to: .image) == true
  }

  /// The thumbnail a camera embedded in the file head, if any; never derived from the pixels.
  /// A partial head without one returns nil, so the caller keeps its ordinary progress state.
  public static func embeddedThumbnail(_ head: Data, maximumPixelSize: Int = 512) -> CGImage? {
    let source = CGImageSourceCreateIncremental([kCGImageSourceShouldCache: false] as CFDictionary)
    CGImageSourceUpdateData(source, head as CFData, false)
    guard CGImageSourceGetCount(source) > 0 else { return nil }
    return CGImageSourceCreateThumbnailAtIndex(
      source, 0,
      [
        kCGImageSourceCreateThumbnailFromImageIfAbsent: false,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: maximumPixelSize,
        kCGImageSourceShouldCache: false,
      ] as CFDictionary)
  }

  public static func decode(_ data: Data) async throws -> DecodedImagePreview {
    let source = ImageAnimationSource()
    return try await source.prepare(data)
  }
}
