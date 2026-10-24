import Foundation
import UniformTypeIdentifiers

/// One synchronous coordinated accessor stays alive on a private queue until close/cancel.
/// NSCondition protects every cross-thread field; FileHandle lives only in that accessor.
/// Foundation explicitly permits coordinator.cancel on any thread. This is the sole reason
/// for unchecked Sendable: no file I/O or waiting occupies MainActor or a Swift task executor.
final class CoordinatedDocumentSource: DocumentImportSource, @unchecked Sendable {
  typealias Metadata = DocumentSourceMetadata
  private struct Read {
    let count: Int
    let reply: CheckedContinuation<Data, Error>
  }
  private enum State { case idle, opening, reading, closed }
  private let url: URL
  private let queue = DispatchQueue(
    label: "com.chromvoid.iosair.document-source", qos: .userInitiated)
  private let coordinator = NSFileCoordinator()
  private let condition = NSCondition()
  private var state: State = .idle
  private var stopping = false
  private var pending: Read?
  private var closing: [CheckedContinuation<Void, Never>] = []

  init(url: URL) { self.url = url }

  func open() async throws -> Metadata {
    try await withCheckedThrowingContinuation { reply in
      condition.lock()
      guard state == .idle, !stopping else {
        condition.unlock()
        reply.resume(throwing: CancellationError())
        return
      }
      state = .opening
      condition.unlock()
      queue.async { self.access(reply) }
    }
  }

  func read(upToCount count: Int) async throws -> Data {
    try await withCheckedThrowingContinuation { reply in
      condition.lock()
      defer { condition.unlock() }
      guard state == .reading, !stopping else {
        reply.resume(throwing: CancellationError())
        return
      }
      guard pending == nil, count > 0 else {
        reply.resume(throwing: CocoaError(.fileReadUnknown))
        return
      }
      pending = Read(count: count, reply: reply)
      condition.signal()
    }
  }

  func cancel() {
    condition.lock()
    stopping = true
    condition.signal()
    condition.unlock()
    coordinator.cancel()
  }

  /// Awaited after success or failure. No source security scope or accessor outlives this call.
  func close() async {
    cancel()
    await withCheckedContinuation { reply in
      condition.lock()
      defer { condition.unlock() }
      if state == .idle || state == .closed {
        state = .closed
        reply.resume()
      } else {
        closing.append(reply)
      }
    }
  }

  private func access(_ reply: CheckedContinuation<Metadata, Error>) {
    let scoped = url.startAccessingSecurityScopedResource()
    var opened = false
    var failure: Error?
    var coordinationError: NSError?
    coordinator.coordinate(readingItemAt: url, options: [], error: &coordinationError) { source in
      do {
        let attributes = try FileManager.default.attributesOfItem(atPath: source.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular,
          let size = attributes[.size] as? NSNumber
        else { throw CocoaError(.fileReadUnsupportedScheme) }
        let file = try FileHandle(forReadingFrom: source)
        defer { try? file.close() }
        let metadata = Metadata(
          name: source.lastPathComponent, size: size.uint64Value,
          mimeType: UTType(filenameExtension: source.pathExtension)?.preferredMIMEType)
        condition.lock()
        if stopping {
          condition.unlock()
          throw CancellationError()
        }
        state = .reading
        opened = true
        reply.resume(returning: metadata)
        condition.unlock()
        serve(file)
      } catch { failure = error }
    }
    if scoped { url.stopAccessingSecurityScopedResource() }
    if !opened {
      reply.resume(throwing: failure ?? coordinationError ?? CocoaError(.fileReadUnknown))
    }
    condition.lock()
    state = .closed
    pending?.reply.resume(throwing: CancellationError())
    pending = nil
    let waiters = closing
    closing = []
    condition.unlock()
    for waiter in waiters { waiter.resume() }
  }

  private func serve(_ file: FileHandle) {
    while true {
      condition.lock()
      while pending == nil && !stopping { condition.wait() }
      if stopping {
        condition.unlock()
        return
      }
      let request = pending
      pending = nil
      condition.unlock()
      guard let request else { return }
      let result = Result { try file.read(upToCount: request.count) ?? Data() }
      condition.lock()
      if stopping {
        request.reply.resume(throwing: CancellationError())
      } else {
        request.reply.resume(with: result)
      }
      condition.unlock()
    }
  }
}
