import AirPresentation
import ChromVoidBridge
import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers

@Suite @MainActor
struct ImagePreviewTests {
  @Test func realDecoderDownsamplesAndRejectsMalformedData() async throws {
    let decoded = try await ImagePreviewDecoder.decode(png(width: 4096, height: 1024))
    #expect(decoded.image.width == 2048 && decoded.image.height == 512)
    #expect(decoded.frameCount == 1)
    await #expect(throws: ImagePreviewError.self) {
      try await ImagePreviewDecoder.decode(Data("not an image".utf8))
    }
  }

  @Test func readsInChunksAndReleasesImageAndReaderOnRevoke() async throws {
    let store = ImageReadProbe(bytes: try png(width: 40, height: 20))
    let model = ImagePreviewModel(store: store, nodeID: 4, generation: 3, name: "Image.png")
    await model.load()?.value
    #expect(model.state == .ready && model.image?.width == 40)
    #expect(store.offsets.count > 1 && store.cancelled)
    model.revoke()
    #expect(model.image == nil && model.name.isEmpty && model.state == .revoked)
    #expect(model.load() == nil)
  }

  @Test func declaredOversizedFileIsRejectedBeforeReadingItsBody() async throws {
    let store = ImageReadProbe(bytes: Data([1]))
    store.declaredSize = ImagePreviewDecoder.maximumSourceBytes + 1
    let model = ImagePreviewModel(store: store, nodeID: 4, generation: 3, name: "Large.png")
    await model.load()?.value
    #expect(model.state == .failed && model.image == nil)
    #expect(store.offsets == [0] && store.cancelled)
    #expect(model.issue == "This image is too large to preview in memory.")
  }

  @Test func lateDecodeCannotRestoreAnImageAfterLock() async throws {
    let store = ImageReadProbe(bytes: try png(width: 20, height: 10))
    let gate = ImageDecodeGate()
    let decoded = try await ImagePreviewDecoder.decode(store.bytes)
    let model = ImagePreviewModel(
      store: store, nodeID: 4, generation: 3, name: "Image.png",
      decode: { _ in
        await gate.wait()
        return decoded
      })
    let loading = model.load()
    await gate.started()
    model.revoke()
    #expect(store.cancelled && model.image == nil)
    gate.release()
    await loading?.value
    #expect(model.state == .revoked && model.image == nil && model.issue == nil)
  }

  @Test func realRustFileRoundtripFeedsNativeImageDecoder() async throws {
    try await withMediaRuntime { client in
      if !(try client.snapshot().masterConfigured) {
        try await client.setupAdministrator(password: "air-synthetic-administrator")
      }
      try await client.unlock(password: "air-image-" + UUID().uuidString)
      let generation = try client.snapshot().generation
      let bytes = try png(width: 64, height: 32)
      let writer = try client.beginFileWrite(
        AirFileWriteTarget(
          parentPath: "/", name: "Image.png", mimeType: "image/png", byteCount: UInt64(bytes.count)),
        generation: generation)
      _ = try await writer.append(bytes)
      let file = try await writer.finish()
      let model = ImagePreviewModel(
        store: client, nodeID: UInt64(file.nodeID), generation: generation, name: "Image.png")
      await model.load()?.value
      #expect(model.state == .ready && model.image?.width == 64)
      _ = try client.lock()
      model.revoke()
      #expect(model.image == nil && model.state == .revoked)
      #expect(throws: BridgeError.self) {
        try client.openFileReader(nodeID: UInt64(file.nodeID), generation: generation)
      }
    }
  }

  private func png(width: Int, height: Int) throws -> Data {
    let context = try #require(
      CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
    context.setFillColor(CGColor(red: 0.1, green: 0.6, blue: 0.7, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    let image = try #require(context.makeImage())
    let data = NSMutableData()
    let destination = try #require(
      CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil))
    CGImageDestinationAddImage(destination, image, nil)
    #expect(CGImageDestinationFinalize(destination))
    return data as Data
  }
}

@MainActor
private final class ImageReadProbe: FileReadStore, FileReading {
  let bytes: Data
  let maximumChunkBytes: UInt64 = 32
  var declaredSize: Int
  var cancelled = false
  var offsets: [UInt64] = []
  init(bytes: Data) {
    self.bytes = bytes
    declaredSize = bytes.count
  }
  func openFileReader(nodeID: UInt64, generation: UInt64) throws -> any FileReading {
    #expect(nodeID == 4 && generation == 3)
    cancelled = false
    return self
  }
  func cancel() throws { cancelled = true }
  func read(offset: UInt64, length: UInt64) async throws -> FileReadChunk {
    #expect(!cancelled && length <= maximumChunkBytes)
    offsets.append(offset)
    let start = Int(offset)
    return FileReadChunk(
      metadata: SourceMetadataResponse(
        mediaInfo: nil, mediaInspectedRevision: 0, mimeType: "image/png",
        name: "Image.png", nodeID: 4, nodeType: 0, size: declaredSize, sourceRevision: 1,
        sourceRevisionInitialized: true),
      bytes: bytes.subdata(in: start..<min(start + Int(length), bytes.count)))
  }
}

@MainActor
private final class ImageDecodeGate {
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
