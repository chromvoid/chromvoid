import AVFoundation
import Foundation
import UniformTypeIdentifiers

/// AVFoundation callbacks are explicitly installed on DispatchQueue.main. At most two bounded reads are active.
@MainActor
final class MediaAssetLoader: NSObject, AVAssetResourceLoaderDelegate {
  let asset: AVURLAsset
  private let source: MediaByteSource
  private var pending: [AVAssetResourceLoadingRequest] = []
  private struct Active {
    let request: AVAssetResourceLoadingRequest
    let task: Task<Void, Never>
  }
  // A tail/seek request can progress while AVFoundation also asks for the remaining stream.
  private var active: [UUID: Active] = [:]
  private var revoked = false
  var onFailure: ((Error) -> Void)?

  init(source: MediaByteSource) throws {
    self.source = source
    guard let url = URL(string: "chromvoid-media://\(UUID().uuidString)/asset") else {
      throw MediaReadError.invalidRange
    }
    asset = AVURLAsset(
      url: url,
      options: [
        AVURLAssetReferenceRestrictionsKey: AVAssetReferenceRestrictions.forbidAll.rawValue
      ])
    super.init()
    asset.resourceLoader.setDelegate(self, queue: .main)
  }

  deinit { for request in active.values { request.task.cancel() } }

  nonisolated func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest
  ) -> Bool {
    MainActor.assumeIsolated { enqueue(loadingRequest) }
  }

  nonisolated func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader, didCancel loadingRequest: AVAssetResourceLoadingRequest
  ) {
    MainActor.assumeIsolated {
      pending.removeAll { $0 === loadingRequest }
      for (id, request) in active where request.request === loadingRequest {
        request.task.cancel()
        source.cancelRead(id: id)
      }
    }
  }

  private func enqueue(_ request: AVAssetResourceLoadingRequest) -> Bool {
    guard !revoked, request.request.url == asset.url, let metadata = source.metadata,
      let size = Int64(exactly: metadata.size)
    else {
      request.finishLoading(with: URLError(.resourceUnavailable))
      return true
    }
    if let information = request.contentInformationRequest {
      let type =
        metadata.mimeType.flatMap { UTType(mimeType: $0) }
        ?? UTType(filenameExtension: (metadata.name as NSString).pathExtension)
      information.contentType = type?.identifier
      information.contentLength = size
      information.isByteRangeAccessSupported = true
    }
    pending.append(request)
    startNext()
    return true
  }

  private func startNext() {
    guard !revoked, active.count < 2 else { return }
    pending.removeAll { $0.isCancelled || $0.isFinished }
    guard !pending.isEmpty else { return }
    let request = pending.removeFirst()
    let id = UUID()
    let work = Task { [weak self, source] in
      defer {
        self?.active.removeValue(forKey: id)
        self?.startNext()
      }
      do {
        if let data = request.dataRequest {
          guard let metadata = source.metadata, let size = UInt64(exactly: metadata.size),
            let offset = UInt64(exactly: max(data.requestedOffset, data.currentOffset)),
            let requestedOffset = UInt64(exactly: data.requestedOffset),
            let requestedLength = UInt64(exactly: data.requestedLength), offset <= size
          else { throw MediaReadError.invalidRange }
          let consumed = offset - requestedOffset
          let length =
            data.requestsAllDataToEndOfResource
            ? size - offset
            : requestedLength - min(consumed, requestedLength)
          try await source.read(id: id, offset: offset, length: length) { bytes in
            if !request.isCancelled, self?.revoked == false { data.respond(with: bytes) }
          }
        }
        try Task.checkCancellation()
        if !request.isCancelled, self?.revoked == false { request.finishLoading() }
      } catch {
        guard !Task.isCancelled, !request.isCancelled, self?.revoked == false else { return }
        request.finishLoading(with: error)
        self?.onFailure?(error)
      }
    }
    active[id] = Active(request: request, task: work)
    startNext()
  }

  func revoke() {
    revoked = true
    for request in active.values { request.task.cancel() }
    source.revoke()
    for request in pending + active.values.map(\.request)
    where !request.isCancelled && !request.isFinished {
      request.finishLoading(with: URLError(.cancelled))
    }
    pending.removeAll()
    active.removeAll()
    onFailure = nil
    asset.cancelLoading()
    asset.resourceLoader.setDelegate(nil, queue: nil)
  }
}
