import ChromVoidBridge
import CoreGraphics
import Foundation
import ImageIO
import Testing
import UIKit
import UniformTypeIdentifiers

@testable import AirPresentation

@Suite @MainActor
struct ImageAnimationTests {
  @Test(arguments: [false, true])
  func realImageIOFramesPreserveTimingColorsAndLoopSemantics(png: Bool) async throws {
    let decoded = try await ImagePreviewDecoder.decode(animation(png: png, loops: 1))
    let sequence = try #require(decoded.animation)
    #expect(sequence.frameCount == 2 && sequence.playCount == (png ? 1 : 2))
    let first = try await sequence.source.frame(at: 0)
    let second = try await sequence.source.frame(at: 1)
    #expect(abs(first.duration - 0.08) < 0.0001 && abs(second.duration - 0.16) < 0.0001)
    #expect(first.image.width == 64 && second.image.width == 64)
    #expect(try pixel(first.image)[1] > 200)
    #expect(try pixel(second.image)[0] > 200 && pixel(second.image)[1] < 20)
    await sequence.source.close()
    await #expect(throws: ImagePreviewError.self) { try await sequence.source.frame(at: 0) }
  }

  @Test func pauseResumeAndRevokeRejectLateFrameClockCompletion() async throws {
    let bytes = try animation(png: false, loops: 0)
    let gate = AnimationClockGate()
    let model = ImagePreviewModel(
      store: AnimationReadStore(bytes: bytes), nodeID: 4, generation: 3, name: "Image.gif",
      waitForFrame: { await gate.wait($0) })
    await model.load()?.value
    #expect(model.canAnimate && !model.isPlaying && !model.firstFrameOnly)
    let play = model.play()
    await gate.started(count: 1)
    #expect(model.isPlaying && model.play() == nil)
    model.pause()
    let paused = model.image
    gate.release()
    await play?.value
    #expect(!model.isPlaying && model.image === paused)
    let resumed = model.play()
    await gate.started(count: 2)
    gate.release()
    await gate.started(count: 3)
    #expect(try pixel(#require(model.image))[0] > 200)
    model.revoke()
    #expect(model.image == nil && !model.isPlaying && !model.canAnimate)
    gate.release()
    await resumed?.value
    #expect(model.image == nil && model.state == .revoked && model.play() == nil)
    #expect(gate.delays == [0.08, 0.08, 0.16])
  }

  @Test func finiteAnimationStopsOnLastFrameAndCanReplay() async throws {
    let model = ImagePreviewModel(
      store: AnimationReadStore(bytes: try animation(png: true, loops: 1)), nodeID: 4,
      generation: 3, name: "Image.png", waitForFrame: { _ in })
    await model.load()?.value
    await model.play()?.value
    #expect(!model.isPlaying && model.canAnimate)
    #expect(try pixel(#require(model.image))[0] > 200)
    await model.play()?.value
    #expect(!model.isPlaying && model.issue == nil)
    model.revoke()
  }

  @Test func frameReplacementKeepsZoomButNewImageIdentityResetsIt() async throws {
    let decoded = try await ImagePreviewDecoder.decode(animation(png: true, loops: 1))
    let sequence = try #require(decoded.animation)
    let next = try await sequence.source.frame(at: 1)
    let view = ImageZoomScrollView()
    view.frame = CGRect(x: 0, y: 0, width: 320, height: 320)
    let identity = UUID()
    view.display(decoded.image, name: "Animated.png", identity: identity)
    view.layoutIfNeeded()
    let fit = view.minimumZoomScale
    view.setZoomScale(fit * 2, animated: false)
    view.display(next.image, name: "Animated.png", identity: identity)
    view.layoutIfNeeded()
    #expect(abs(view.zoomScale - fit * 2) < 0.001)
    view.display(next.image, name: "Another.png", identity: UUID())
    view.layoutIfNeeded()
    #expect(abs(view.zoomScale - fit) < 0.001)
    view.clear()
    await sequence.source.close()
  }

  private func animation(png: Bool, loops: Int) throws -> Data {
    let data = NSMutableData()
    let destination = try #require(
      CGImageDestinationCreateWithData(
        data, (png ? UTType.png.identifier : UTType.gif.identifier) as CFString, 2, nil))
    let dictionary = png ? kCGImagePropertyPNGDictionary : kCGImagePropertyGIFDictionary
    let loop = png ? kCGImagePropertyAPNGLoopCount : kCGImagePropertyGIFLoopCount
    let delay = png ? kCGImagePropertyAPNGDelayTime : kCGImagePropertyGIFDelayTime
    CGImageDestinationSetProperties(destination, [dictionary: [loop: loops]] as CFDictionary)
    for index in 0..<2 {
      let context = try #require(
        CGContext(
          data: nil, width: 64, height: 32, bitsPerComponent: 8, bytesPerRow: 64 * 4,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
      context.setFillColor(index == 0 ? UIColor.green.cgColor : UIColor.red.cgColor)
      context.fill(CGRect(x: 0, y: 0, width: 64, height: 32))
      let image = try #require(context.makeImage())
      CGImageDestinationAddImage(
        destination, image,
        [dictionary: [delay: index == 0 ? 0.08 : 0.16]] as CFDictionary)
    }
    #expect(CGImageDestinationFinalize(destination))
    return data as Data
  }

  private func pixel(_ image: CGImage) throws -> [UInt8] {
    let context = try #require(
      CGContext(
        data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
          | CGBitmapInfo.byteOrder32Big.rawValue))
    context.draw(image, in: CGRect(x: 0, y: 0, width: 1, height: 1))
    let bytes = try #require(context.data).assumingMemoryBound(to: UInt8.self)
    return Array(UnsafeBufferPointer(start: bytes, count: 4))
  }
}

@MainActor
private final class AnimationClockGate {
  var delays: [TimeInterval] = []
  private var pending: CheckedContinuation<Void, Never>?
  private var observer: CheckedContinuation<Void, Never>?
  private var target = 0
  func wait(_ delay: TimeInterval) async {
    delays.append(delay)
    await withCheckedContinuation {
      pending = $0
      if delays.count >= target {
        observer?.resume()
        observer = nil
      }
    }
  }
  func started(count: Int) async {
    if delays.count >= count { return }
    target = count
    await withCheckedContinuation { observer = $0 }
  }
  func release() {
    pending?.resume()
    pending = nil
  }
}

@MainActor
private final class AnimationReadStore: FileReadStore, FileReading {
  let maximumChunkBytes: UInt64 = 65536
  let bytes: Data
  init(bytes: Data) { self.bytes = bytes }
  func openFileReader(nodeID: UInt64, generation: UInt64) throws -> any FileReading {
    #expect(nodeID == 4 && generation == 3)
    return self
  }
  func cancel() throws {}
  func read(offset: UInt64, length: UInt64) async throws -> FileReadChunk {
    #expect(offset == 0 && bytes.count <= length)
    return FileReadChunk(
      metadata: SourceMetadataResponse(
        mediaInfo: nil, mediaInspectedRevision: 0, mimeType: "image/gif", name: "Image.gif",
        nodeID: 4,
        nodeType: 0, size: bytes.count, sourceRevision: 1, sourceRevisionInitialized: true),
      bytes: bytes)
  }
}
