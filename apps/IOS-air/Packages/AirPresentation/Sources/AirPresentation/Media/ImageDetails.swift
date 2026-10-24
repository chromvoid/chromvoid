import CoreGraphics
import Foundation
import ImageIO

/// What the encoded image itself says about the photo: pixel size, colour and the camera's
/// EXIF/GPS records. Read from the bytes once at decode time; nothing is inferred or stored.
public struct ImageDetails: Sendable, Equatable {
  public var pixelWidth: Int?
  public var pixelHeight: Int?
  public var colorModel: String?
  public var depth: Int?
  public var hasAlpha: Bool?
  public var cameraMake: String?
  public var cameraModel: String?
  public var lens: String?
  public var software: String?
  /// EXIF `DateTimeOriginal`, parsed with the file's own offset when it carries one.
  public var taken: Date?
  public var exposureTime: Double?
  public var fNumber: Double?
  public var iso: Int?
  public var focalLength: Double?
  public var latitude: Double?
  public var longitude: Double?

  public init() {}

  public var hasCamera: Bool {
    cameraMake != nil || cameraModel != nil || lens != nil || exposureTime != nil
      || fNumber != nil || iso != nil || focalLength != nil
  }
  public var hasLocation: Bool { latitude != nil && longitude != nil }

  /// Records from the file head alone; a camera file keeps its EXIF there.
  static func read(head: Data) -> ImageDetails? {
    let source = CGImageSourceCreateIncremental([kCGImageSourceShouldCache: false] as CFDictionary)
    CGImageSourceUpdateData(source, head as CFData, false)
    guard CGImageSourceGetCount(source) > 0 else { return nil }
    let details = read(source)
    return details.pixelWidth == nil ? nil : details
  }

  static func read(_ source: CGImageSource) -> ImageDetails {
    var details = ImageDetails()
    guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    else { return details }
    details.pixelWidth = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue
    details.pixelHeight = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue
    details.colorModel = properties[kCGImagePropertyColorModel] as? String
    details.depth = (properties[kCGImagePropertyDepth] as? NSNumber)?.intValue
    details.hasAlpha = (properties[kCGImagePropertyHasAlpha] as? NSNumber)?.boolValue
    if let tiff = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any] {
      details.cameraMake = trimmed(tiff[kCGImagePropertyTIFFMake])
      details.cameraModel = trimmed(tiff[kCGImagePropertyTIFFModel])
      details.software = trimmed(tiff[kCGImagePropertyTIFFSoftware])
    }
    if let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any] {
      details.lens = trimmed(exif[kCGImagePropertyExifLensModel])
      details.exposureTime = (exif[kCGImagePropertyExifExposureTime] as? NSNumber)?.doubleValue
      details.fNumber = (exif[kCGImagePropertyExifFNumber] as? NSNumber)?.doubleValue
      details.iso = (exif[kCGImagePropertyExifISOSpeedRatings] as? [NSNumber])?.first?.intValue
      details.focalLength = (exif[kCGImagePropertyExifFocalLength] as? NSNumber)?.doubleValue
      details.taken = Self.date(
        exif[kCGImagePropertyExifDateTimeOriginal] as? String,
        offset: exif[kCGImagePropertyExifOffsetTimeOriginal] as? String)
    }
    if let gps = properties[kCGImagePropertyGPSDictionary] as? [CFString: Any],
      let latitude = (gps[kCGImagePropertyGPSLatitude] as? NSNumber)?.doubleValue,
      let longitude = (gps[kCGImagePropertyGPSLongitude] as? NSNumber)?.doubleValue
    {
      let south = (gps[kCGImagePropertyGPSLatitudeRef] as? String) == "S"
      let west = (gps[kCGImagePropertyGPSLongitudeRef] as? String) == "W"
      details.latitude = south ? -latitude : latitude
      details.longitude = west ? -longitude : longitude
    }
    return details
  }

  private static func trimmed(_ value: Any?) -> String? {
    guard let text = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
      !text.isEmpty
    else { return nil }
    return text
  }

  /// EXIF stores local wall-clock time as `yyyy:MM:dd HH:mm:ss`; the offset field, when present,
  /// pins it to an instant. Without one the device's current zone is assumed.
  static func date(_ text: String?, offset: String?) -> Date? {
    guard let text else { return nil }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.dateFormat = "yyyy:MM:dd HH:mm:ss"
    if let offset, let zone = zone(offset) { formatter.timeZone = zone }
    return formatter.date(from: text)
  }

  private static func zone(_ offset: String) -> TimeZone? {
    let parts = offset.split(separator: ":")
    guard parts.count == 2, let hours = Int(parts[0]), let minutes = Int(parts[1]) else {
      return nil
    }
    let sign = offset.hasPrefix("-") ? -1 : 1
    return TimeZone(secondsFromGMT: sign * (abs(hours) * 3600 + minutes * 60))
  }
}

/// Catalog facts the Files list already holds for an image, shown beside the decoded details.
public struct ImageCatalogFacts: Sendable, Equatable {
  public let path: String?
  public let size: Int
  public let mimeType: String?
  /// Milliseconds since the Unix epoch, as Core records them.
  public let createdAt: Int
  public let updatedAt: Int
  public init(path: String?, size: Int, mimeType: String?, createdAt: Int, updatedAt: Int) {
    self.path = path
    self.size = size
    self.mimeType = mimeType
    self.createdAt = createdAt
    self.updatedAt = updatedAt
  }
}
