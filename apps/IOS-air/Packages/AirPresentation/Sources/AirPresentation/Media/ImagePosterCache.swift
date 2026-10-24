import CoreGraphics
import Foundation

/// Decoded posters of the current unlocked, foreground Files session. Memory only: nothing is
/// written to disk, and the owning session empties it whenever it is revoked (lock, background,
/// protected-data loss). Keys pin the Core source revision, so an edited file never shows stale
/// pixels. Bounded by bytes and entries; the least recently shown poster leaves first.
@MainActor
public final class ImagePosterCache {
  public struct Key: Hashable {
    public let nodeID: UInt64
    public let sourceRevision: UInt64
    public init(nodeID: UInt64, sourceRevision: UInt64) {
      self.nodeID = nodeID
      self.sourceRevision = sourceRevision
    }
  }
  public struct Poster {
    public let image: CGImage
    public let details: ImageDetails?
    public init(image: CGImage, details: ImageDetails?) {
      self.image = image
      self.details = details
    }
  }
  private struct Entry {
    let poster: Poster
    let bytes: Int
    var lastUse: UInt64
  }
  public let maximumBytes: Int
  public let maximumEntries: Int
  private var entries: [Key: Entry] = [:]
  private var bytes = 0
  private var clock: UInt64 = 0

  public init(maximumBytes: Int = 48 * 1024 * 1024, maximumEntries: Int = 8) {
    self.maximumBytes = maximumBytes
    self.maximumEntries = maximumEntries
  }

  public var count: Int { entries.count }

  public func poster(for key: Key) -> Poster? {
    guard let entry = entries[key] else { return nil }
    clock += 1
    entries[key]?.lastUse = clock
    return entry.poster
  }

  public func store(_ poster: Poster, for key: Key) {
    let size = poster.image.bytesPerRow * poster.image.height
    guard size <= maximumBytes else { return }
    if let previous = entries.removeValue(forKey: key) { bytes -= previous.bytes }
    clock += 1
    entries[key] = Entry(poster: poster, bytes: size, lastUse: clock)
    bytes += size
    while bytes > maximumBytes || entries.count > maximumEntries,
      let victim = entries.min(by: { $0.value.lastUse < $1.value.lastUse })
    {
      entries.removeValue(forKey: victim.key)
      bytes -= victim.value.bytes
    }
  }

  public func removeAll() {
    entries = [:]
    bytes = 0
  }
}
