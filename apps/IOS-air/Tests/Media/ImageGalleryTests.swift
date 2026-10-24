import AirPresentation
import ChromVoidBridge
import CoreGraphics
import Foundation
import ImageIO
import Testing
import UIKit
import UniformTypeIdentifiers

@Suite @MainActor
struct ImageGalleryTests {
  @Test func navigationRetainsOnlyNeighborsAndRevokesEvictedPreviews() async throws {
    let model = gallery(TestFileCatalogStore(), ids: [9, 4, 7, 2], next: nil)
    #expect(model.items.map(\.id) == [9, 4, 7, 2])
    let first = try #require(model.previews[9])
    #expect(!model.canGoBack && model.canGoForward)
    model.next()
    #expect(model.selectedID == 4 && model.previews.count == 3)
    model.next()
    await model.windowSettling?.value
    #expect(model.selectedID == 7 && model.previews.count == 3)
    #expect(first.state == .revoked && first.name.isEmpty)
    model.next()
    await model.windowSettling?.value
    #expect(!model.canGoForward && model.selectedID == 2)
    model.previous()
    await model.windowSettling?.value
    #expect(model.selectedID == 7)
    let retained = Array(model.previews.values)
    model.revoke()
    model.select(9)
    #expect(model.items.isEmpty && model.previews.isEmpty && !model.canGoForward)
    #expect(retained.allSatisfy { $0.state == .revoked && $0.name.isEmpty })
  }

  @Test func nextTraversesNonImagePagesUsingOriginalCoreQueryAndVersion() async {
    let store = TestFileCatalogStore()
    store.page = { request in
      let offset = request.offset ?? 0
      return page(
        items: [item(offset == 50 ? 100 : 8, name: offset == 50 ? "note.md" : "Portrait.png")],
        offset: offset, next: offset == 50 ? 100 : nil)
    }
    let model = gallery(store, ids: [9], next: 50)
    await model.next()?.value
    #expect(model.items.map(\.id) == [9, 8] && model.selectedID == 8)
    #expect(!model.canGoForward)
    #expect(store.requests.map(\.offset) == [50, 100])
    #expect(
      store.requests.allSatisfy {
        $0.expectedVersion == 7 && $0.path == "/Trip" && $0.filter?.query == "photo"
          && $0.filter?.includeHidden == false && $0.sort?.by == "date"
          && $0.sort?.direction == "desc"
      })
    model.revoke()
  }

  @Test func prefetchPreservesSelectionAndAllowsNavigationAmongLoadedImages() async {
    let store = TestFileCatalogStore()
    let gate = GalleryPageGate()
    store.page = { _ in
      await gate.wait()
      return page(items: [item(2)], offset: 50, next: nil)
    }
    let model = gallery(store, ids: [9, 4, 7], next: 50)
    #expect(model.prefetchNext() == nil)
    model.select(4)
    await model.windowSettling?.value
    let work = model.prefetchNext()
    await gate.started()
    #expect(model.canGoForward)
    model.next()
    #expect(model.selectedID == 7)
    gate.release()
    await work?.value
    await model.windowSettling?.value
    #expect(model.selectedID == 7 && model.items.map(\.id) == [9, 4, 7, 2])
    #expect(model.canGoForward && model.previews.count == 3)
    model.next()
    #expect(model.selectedID == 2 && !model.canGoForward)
    model.revoke()
  }

  @Test func neighboursStartReadingOnlyAfterTheVisibleImageFinishes() async {
    let store = TestFileCatalogStore()
    let gate = GalleryPageGate()
    let log = GalleryReadLog()
    store.reader = { nodeID in
      GalleryGatedReader(nodeID: nodeID, gate: nodeID == 9 ? gate : nil, log: log)
    }
    let model = gallery(store, ids: [4, 9, 7], next: nil)
    await gate.started()
    #expect(model.previews.count == 3 && model.previews[9]?.state == .loading)
    #expect(model.previews[4]?.state == .idle && model.previews[7]?.state == .idle)
    #expect(log.nodes == [9])
    let visible = model.previews[9]?.currentLoad
    gate.release()
    await visible?.value
    for _ in 0..<20 where log.nodes.count < 3 { await Task.yield() }
    #expect(log.nodes.first == 9 && Set(log.nodes.dropFirst()) == [4, 7])
    #expect(model.previews[4]?.state != .idle && model.previews[7]?.state != .idle)
    model.revoke()
  }

  @Test func storedPreviewIsUsedFirstAndEnsuredAfterTheOriginal() async throws {
    let original = try galleryJPEG(width: 900, height: 700)
    let preview = try galleryJPEG(width: 600, height: 400)
    let store = TestFileCatalogStore()
    let log = GalleryReadLog()
    store.reader = { nodeID in
      GalleryGatedReader(nodeID: nodeID, gate: nil, log: log, bytes: original)
    }
    var calls: [(DerivativeTier, Bool)] = []
    store.derivative = { _, tier, ensure in
      calls.append((tier, ensure))
      guard !ensure else {
        return DerivativeBytes(name: "p.jpg", mimeType: "image/jpeg", bytes: preview)
      }
      return DerivativeBytes(name: "p.jpg", mimeType: "image/jpeg", bytes: preview)
    }
    let stored = gallery(store, ids: [9], next: nil, names: "Photo.jpg", size: 2 * 1024 * 1024)
    let fromStore = try #require(stored.previews[9])
    await fromStore.currentLoad?.value
    #expect(fromStore.state == .ready && fromStore.image?.width == 600)
    #expect(log.nodes.isEmpty && calls.map(\.1) == [false])
    #expect(fromStore.details == nil)
    fromStore.loadDetails()
    for _ in 0..<200 where fromStore.details == nil { try await Task.sleep(for: .milliseconds(5)) }
    #expect(fromStore.details?.pixelWidth == 900 && log.nodes == [9])
    stored.revoke()

    calls = []
    store.derivative = { _, tier, ensure in
      calls.append((tier, ensure))
      guard ensure else { throw BridgeError.CapabilityUnavailable }
      return DerivativeBytes(name: "p.jpg", mimeType: "image/jpeg", bytes: preview)
    }
    let missing = gallery(store, ids: [9], next: nil, names: "Photo.jpg", size: 2 * 1024 * 1024)
    let fromOriginal = try #require(missing.previews[9])
    await fromOriginal.currentLoad?.value
    #expect(fromOriginal.state == .ready && fromOriginal.image?.width == 900)
    #expect(fromOriginal.details?.pixelWidth == 900 && log.nodes == [9, 9])
    for _ in 0..<200 where calls.count < 2 { try await Task.sleep(for: .milliseconds(5)) }
    #expect(calls.map(\.1) == [false, true] && calls.allSatisfy { $0.0 == .preview })
    missing.revoke()
  }

  @Test func gpsAndCameraRecordsAreReadFromFullBytesAndFromTheFileHead() async throws {
    let moscow = try galleryJPEG(
      width: 900, height: 700,
      properties: [
        kCGImagePropertyTIFFDictionary: [
          kCGImagePropertyTIFFMake: "Apple", kCGImagePropertyTIFFModel: "iPhone 13 mini",
        ],
        kCGImagePropertyExifDictionary: [
          kCGImagePropertyExifDateTimeOriginal: "2026:09:11 14:05:09",
          kCGImagePropertyExifOffsetTimeOriginal: "+03:00",
          kCGImagePropertyExifFNumber: 1.6, kCGImagePropertyExifExposureTime: 1.0 / 120,
          kCGImagePropertyExifISOSpeedRatings: [64], kCGImagePropertyExifFocalLength: 5.1,
          kCGImagePropertyExifLensModel: "iPhone 13 mini back camera 5.1mm f/1.6",
        ],
        kCGImagePropertyGPSDictionary: [
          kCGImagePropertyGPSLatitude: 55.7558, kCGImagePropertyGPSLatitudeRef: "N",
          kCGImagePropertyGPSLongitude: 37.6173, kCGImagePropertyGPSLongitudeRef: "E",
          kCGImagePropertyGPSAltitude: 156.0,
        ],
      ])
    #expect(moscow.count > 65536)
    let full = try await ImagePreviewDecoder.decode(moscow).details
    #expect(full.pixelWidth == 900 && full.pixelHeight == 700)
    #expect(full.cameraMake == "Apple" && full.cameraModel == "iPhone 13 mini")
    #expect(full.lens == "iPhone 13 mini back camera 5.1mm f/1.6")
    #expect(full.fNumber == 1.6 && full.iso == 64 && full.focalLength == 5.1)
    #expect(full.exposureTime.map { abs($0 - 1.0 / 120) < 1e-6 } == true)
    #expect(full.latitude.map { abs($0 - 55.7558) < 1e-4 } == true)
    #expect(full.longitude.map { abs($0 - 37.6173) < 1e-4 } == true)
    #expect(full.taken == Date(timeIntervalSince1970: 1_789_124_709))
    #expect(full.hasLocation && full.hasCamera)

    // Only the first 64 KiB chunk reaches the information sheet when the poster came from a
    // stored preview; GPS lives in the EXIF segment at the file head.
    let store = TestFileCatalogStore()
    let log = GalleryReadLog()
    store.reader = { nodeID in
      GalleryGatedReader(nodeID: nodeID, gate: nil, log: log, bytes: moscow)
    }
    store.derivative = { _, _, _ in
      DerivativeBytes(
        name: "p.jpg", mimeType: "image/jpeg", bytes: try galleryJPEG(width: 300, height: 200))
    }
    let model = gallery(store, ids: [9], next: nil, names: "Moscow.jpg", size: 2 * 1024 * 1024)
    let preview = try #require(model.previews[9])
    await preview.currentLoad?.value
    #expect(preview.image?.width == 300 && preview.details == nil)
    preview.loadDetails()
    for _ in 0..<200 where preview.details == nil { try await Task.sleep(for: .milliseconds(5)) }
    let head = try #require(preview.details)
    #expect(head.pixelWidth == 900)
    #expect(head.latitude.map { abs($0 - 55.7558) < 1e-4 } == true)
    #expect(head.longitude.map { abs($0 - 37.6173) < 1e-4 } == true)
    #expect(head.cameraModel == "iPhone 13 mini" && head.taken == full.taken)
    model.revoke()

    let southWest = try galleryJPEG(
      width: 120, height: 80,
      properties: [
        kCGImagePropertyGPSDictionary: [
          kCGImagePropertyGPSLatitude: 33.8688, kCGImagePropertyGPSLatitudeRef: "S",
          kCGImagePropertyGPSLongitude: 70.6693, kCGImagePropertyGPSLongitudeRef: "W",
        ]
      ])
    let signed = try await ImagePreviewDecoder.decode(southWest).details
    #expect(signed.latitude.map { abs($0 + 33.8688) < 1e-4 } == true)
    #expect(signed.longitude.map { abs($0 + 70.6693) < 1e-4 } == true)
    #expect(!signed.hasCamera && signed.taken == nil)

    let plain = try await ImagePreviewDecoder.decode(try galleryJPEG(width: 40, height: 30)).details
    #expect(!plain.hasLocation && plain.latitude == nil && plain.longitude == nil)
  }

  @Test func changedFolderDoesNotMixCatalogVersions() async {
    let store = TestFileCatalogStore()
    store.page = { _ in page(items: [item(3)], offset: 50, next: nil, version: 8) }
    let model = gallery(store, ids: [9], next: 50)
    await model.next()?.value
    #expect(model.items.map(\.id) == [9] && model.selectedID == 9)
    #expect(model.issue == "This folder changed. Close the gallery and refresh Files.")
    #expect(!model.canGoForward)
    model.revoke()
  }

  @Test func latePageCannotRestoreGalleryAfterLock() async {
    let store = TestFileCatalogStore()
    let gate = GalleryPageGate()
    store.page = { _ in
      await gate.wait()
      return page(items: [item(3)], offset: 50, next: nil)
    }
    let model = gallery(store, ids: [9], next: 50)
    let work = model.next()
    await gate.started()
    model.revoke()
    gate.release()
    await work?.value
    #expect(model.items.isEmpty && model.previews.isEmpty && model.issue == nil)
    #expect(!model.canGoForward && !model.loadingMore)
  }

  @Test func cachedPosterReopensWithoutAnotherRead() async throws {
    let store = TestFileCatalogStore()
    let log = GalleryReadLog()
    let png = try #require(
      UIGraphicsImageRenderer(size: CGSize(width: 40, height: 30)).image { context in
        UIColor.systemTeal.setFill()
        context.fill(CGRect(x: 0, y: 0, width: 40, height: 30))
      }.pngData())
    store.reader = { nodeID in GalleryGatedReader(nodeID: nodeID, gate: nil, log: log, bytes: png) }
    let posters = ImagePosterCache()
    let first = gallery(store, ids: [9], next: nil, posters: posters)
    let preview = try #require(first.previews[9])
    await preview.currentLoad?.value
    let width = try #require(preview.image?.width)
    #expect(preview.state == .ready && width >= 40)
    #expect(log.nodes == [9] && posters.count == 1)
    first.revoke()
    #expect(preview.image == nil && posters.count == 1)
    let second = gallery(store, ids: [9], next: nil, posters: posters)
    #expect(second.previews[9]?.state == .ready && second.previews[9]?.image?.width == width)
    #expect(log.nodes == [9])
    posters.removeAll()
    let third = gallery(store, ids: [9], next: nil, posters: posters)
    #expect(third.previews[9]?.state == .loading)
    await third.previews[9]?.currentLoad?.value
    #expect(log.nodes == [9, 9] && third.previews[9]?.state == .ready)
    second.revoke()
    third.revoke()
  }

  @Test func embeddedThumbnailStandsInWhileTheFullImageStillReads() async throws {
    let jpeg = try galleryJPEG(width: 900, height: 700)
    #expect(jpeg.count > 65536)
    let store = TestFileCatalogStore()
    let gate = GalleryPageGate()
    let log = GalleryReadLog()
    store.reader = { nodeID in GalleryGatedReader(nodeID: nodeID, gate: gate, log: log, bytes: jpeg)
    }
    let model = gallery(store, ids: [9], next: nil, posters: nil)
    let preview = try #require(model.previews[9])
    await gate.started()
    for _ in 0..<200 where preview.placeholder == nil {
      try await Task.sleep(for: .milliseconds(5))
    }
    #expect(preview.placeholder != nil && preview.image == nil && preview.state == .loading)
    gate.release()
    await preview.currentLoad?.value
    #expect(preview.state == .ready && preview.image != nil && preview.placeholder == nil)
    model.revoke()
    #expect(preview.placeholder == nil)
  }

  private func gallery(
    _ store: TestFileCatalogStore, ids: [Int], next: Int?, posters: ImagePosterCache? = nil,
    names: String = "Image.png", size: Int = 1
  ) -> ImageGalleryModel {
    ImageGalleryModel(
      store: store, generation: 3, items: ids.map { item($0, name: names, size: size) },
      selectedID: 9,
      continuation: CatalogFolderPageRequest(
        expectedVersion: 7,
        filter: CatalogFolderFilter(
          fileTypes: [], includeHidden: false, includeTextContent: false, query: "photo",
          recursive: false),
        limit: 50, offset: next, path: "/Trip",
        sort: CatalogFolderSort(by: "date", direction: "desc")),
      posters: posters)
  }
}

private func item(_ id: Int, name: String = "Image.png", size: Int = 1) -> CatalogListItem {
  CatalogListItem(
    createdAt: 1, isDir: false, mediaInfo: nil, mediaInspectedRevision: 0, mimeType: nil,
    name: name, nodeID: id, parentPath: "/Trip", path: "/Trip/" + name, size: size,
    sourceRevision: 1, updatedAt: 1)
}

private func page(
  items: [CatalogListItem], offset: Int, next: Int?, version: Int = 7
) -> CatalogFolderPageResponse {
  CatalogFolderPageResponse(
    currentPath: "/Trip",
    filterCounts: CatalogFolderFilterCounts(all: 120, images: 2, markdown: 118),
    items: items, limit: 50, nextOffset: next, offset: offset, reloadRequired: false,
    totalCount: 120, version: version)
}

@MainActor
private final class GalleryPageGate {
  private var pending: CheckedContinuation<Void, Never>?
  private var observer: CheckedContinuation<Void, Never>?
  private var began = false
  func wait() async {
    await withCheckedContinuation {
      pending = $0
      began = true
      observer?.resume()
      observer = nil
    }
  }
  func started() async {
    if began { return }
    await withCheckedContinuation { observer = $0 }
  }
  func release() {
    pending?.resume()
    pending = nil
  }
}

@MainActor
private final class GalleryReadLog {
  var nodes: [UInt64] = []
}

/// Records the order of reads. Without bytes every read fails; with bytes it serves 64 KiB chunks.
/// A gate holds either the first failing read or the second chunk of a served file open once.
@MainActor
private final class GalleryGatedReader: FileReading {
  let maximumChunkBytes: UInt64 = 65536
  private let nodeID: UInt64
  private let gate: GalleryPageGate?
  private let log: GalleryReadLog
  private let bytes: Data?
  private var gated = false
  init(nodeID: UInt64, gate: GalleryPageGate?, log: GalleryReadLog, bytes: Data? = nil) {
    self.nodeID = nodeID
    self.gate = gate
    self.log = log
    self.bytes = bytes
  }
  func read(offset: UInt64, length: UInt64) async throws -> FileReadChunk {
    if offset == 0 { log.nodes.append(nodeID) }
    guard let bytes else {
      if let gate { await gate.wait() }
      throw BridgeError.RuntimeUnavailable
    }
    if offset > 0, !gated, let gate {
      gated = true
      await gate.wait()
    }
    let start = Int(offset)
    let end = min(bytes.count, start + Int(length))
    return FileReadChunk(
      metadata: SourceMetadataResponse(
        mediaInfo: nil, mediaInspectedRevision: 0, mimeType: "image/jpeg", name: "Image.jpg",
        nodeID: Int(nodeID), nodeType: 0, size: bytes.count, sourceRevision: 1,
        sourceRevisionInitialized: true),
      bytes: bytes.subdata(in: start..<end))
  }
  func cancel() throws {}
}

/// Noisy RGB JPEG with an embedded EXIF thumbnail, large enough to span several read chunks.
private func galleryJPEG(
  width: Int, height: Int, properties: [CFString: Any] = [:]
) throws -> Data {
  var pixels = [UInt8](repeating: 0, count: width * height * 4)
  var seed: UInt64 = 0x9E37_79B9_7F4A_7C15
  for index in stride(from: 0, to: pixels.count, by: 4) {
    seed = seed &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
    pixels[index] = UInt8(truncatingIfNeeded: seed >> 56)
    pixels[index + 1] = UInt8(truncatingIfNeeded: seed >> 48)
    pixels[index + 2] = UInt8(truncatingIfNeeded: seed >> 40)
    pixels[index + 3] = 255
  }
  let provider = try #require(CGDataProvider(data: Data(pixels) as CFData))
  let image = try #require(
    CGImage(
      width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
      provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent))
  let output = NSMutableData()
  let destination = try #require(
    CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil))
  var options: [CFString: Any] = [
    kCGImageDestinationLossyCompressionQuality: 0.9, kCGImageDestinationEmbedThumbnail: true,
  ]
  for (key, value) in properties { options[key] = value }
  CGImageDestinationAddImage(destination, image, options as CFDictionary)
  #expect(CGImageDestinationFinalize(destination))
  return output as Data
}
