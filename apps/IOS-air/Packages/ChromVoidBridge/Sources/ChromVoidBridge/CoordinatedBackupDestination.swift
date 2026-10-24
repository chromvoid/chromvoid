import Foundation

/// The serial queue owns directory URLs, security scope and file handles. NSCondition
/// protects cancellation and the one pending write. Coordination never blocks MainActor
/// or a Swift task executor, and each artifact has its own nonnested accessor.
final class CoordinatedBackupDestination: @unchecked Sendable {
  private enum State { case idle, opening, writing, appending, finishing, failed }
  private enum Request {
    case append(Data, CheckedContinuation<Void, Error>)
    case finish(CheckedContinuation<Void, Error>)
  }
  private let selectedDirectory: URL
  let name = "ChromVoid Backup " + UUID().uuidString
  private let queue = DispatchQueue(
    label: "com.chromvoid.iosair.backup-destination", qos: .userInitiated)
  private let coordinator = NSFileCoordinator()
  private let condition = NSCondition()
  private var state: State = .idle
  private var stopping = false
  private var pending: Request?
  // Accessed only on queue, including final cleanup after an accessor returns.
  private var directory: URL?
  private var scoped = false
  private var closed = false

  init(directory: URL) { selectedDirectory = directory }

  func open() async throws {
    try await enqueue {
      try self.checkActive()
      guard self.directory == nil, !self.closed else { throw CocoaError(.fileWriteUnknown) }
      self.scoped = self.selectedDirectory.startAccessingSecurityScopedResource()
      try self.coordinate(self.selectedDirectory) { parent in
        let values = try parent.resourceValues(forKeys: [.isDirectoryKey])
        guard values.isDirectory == true else { throw CocoaError(.fileWriteInvalidFileName) }
        let destination = parent.appendingPathComponent(self.name + ".partial", isDirectory: true)
        try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: false)
        self.directory = destination
      }
    }
  }

  func openArtifact(name: String, size: UInt64) async throws {
    try await withCheckedThrowingContinuation { (reply: CheckedContinuation<Void, Error>) in
      condition.lock()
      guard state == .idle, !stopping else {
        condition.unlock()
        reply.resume(throwing: CancellationError())
        return
      }
      guard !name.isEmpty, name != ".", name != "..",
        !name.contains("/"), !name.contains("\\"), !name.contains("\0")
      else {
        condition.unlock()
        reply.resume(throwing: CocoaError(.fileWriteInvalidFileName))
        return
      }
      state = .opening
      condition.unlock()
      queue.async { self.accessArtifact(name: name, size: size, reply: reply) }
    }
  }

  func append(_ bytes: Data) async throws {
    try await submit { .append(bytes, $0) }
  }

  func finishArtifact() async throws {
    try await submit { .finish($0) }
  }

  private func submit(_ makeRequest: (CheckedContinuation<Void, Error>) -> Request) async throws {
    try await withCheckedThrowingContinuation { (reply: CheckedContinuation<Void, Error>) in
      condition.lock()
      defer { condition.unlock() }
      guard state == .writing, !stopping, pending == nil else {
        reply.resume(throwing: CancellationError())
        return
      }
      let request = makeRequest(reply)
      switch request {
      case .append: state = .appending
      case .finish: state = .finishing
      }
      pending = request
      condition.signal()
    }
  }

  func publish() async throws -> URL {
    try checkReadyToPublish()
    return try await enqueue {
      try self.checkActive()
      guard let directory = self.directory, !self.closed else {
        throw CocoaError(.fileWriteUnknown)
      }
      let destination = directory.deletingLastPathComponent().appendingPathComponent(
        self.name, isDirectory: true)
      var failure: Error?
      var coordinationError: NSError?
      var published: URL?
      self.coordinator.coordinate(
        writingItemAt: directory, options: .forMoving,
        writingItemAt: destination, options: [], error: &coordinationError
      ) { source, target in
        do {
          try self.checkActive()
          try FileManager.default.moveItem(at: source, to: target)
          self.directory = target
          published = target
        } catch { failure = error }
      }
      guard let published else {
        throw failure ?? coordinationError ?? CocoaError(.fileWriteUnknown)
      }
      return published
    }
  }

  func cancel() {
    condition.lock()
    stopping = true
    condition.signal()
    condition.unlock()
    coordinator.cancel()
  }

  /// Runs even for a canceled Swift task. Only this attempt's directory may be removed.
  func close(remove: Bool) async throws {
    cancel()
    try await enqueue {
      guard !self.closed else { return }
      defer {
        self.closed = true
        if self.scoped { self.selectedDirectory.stopAccessingSecurityScopedResource() }
        self.scoped = false
      }
      if remove, let directory = self.directory {
        var failure: Error?
        var coordinationError: NSError?
        var removed = false
        NSFileCoordinator().coordinate(
          writingItemAt: directory, options: .forDeleting, error: &coordinationError
        ) { target in
          do {
            if FileManager.default.fileExists(atPath: target.path) {
              try FileManager.default.removeItem(at: target)
            }
            removed = true
          } catch { failure = error }
        }
        guard removed else { throw failure ?? coordinationError ?? CocoaError(.fileWriteUnknown) }
      }
      self.directory = nil
    }
  }

  private func accessArtifact(name: String, size: UInt64, reply: CheckedContinuation<Void, Error>) {
    var opened = false
    var finishing: CheckedContinuation<Void, Error>?
    var failure: Error?
    do {
      try checkActive()
      guard let directory, !closed else { throw CocoaError(.fileWriteUnknown) }
      let destination = directory.appendingPathComponent(name, isDirectory: false)
      try coordinate(destination) { target in
        guard !FileManager.default.fileExists(atPath: target.path),
          FileManager.default.createFile(atPath: target.path, contents: nil)
        else { throw CocoaError(.fileWriteFileExists) }
        let file = try FileHandle(forWritingTo: target)
        defer { try? file.close() }
        self.condition.lock()
        if self.stopping {
          self.condition.unlock()
          throw CancellationError()
        }
        self.state = .writing
        opened = true
        reply.resume()
        self.condition.unlock()
        var written: UInt64 = 0
        while true {
          self.condition.lock()
          while self.pending == nil, !self.stopping { self.condition.wait() }
          if self.stopping {
            self.condition.unlock()
            throw CancellationError()
          }
          let request = self.pending
          self.pending = nil
          self.condition.unlock()
          switch request {
          case .append(let bytes, let response):
            do {
              guard UInt64(bytes.count) <= size - written else {
                throw CocoaError(.fileWriteUnknown)
              }
              try file.write(contentsOf: bytes)
              written += UInt64(bytes.count)
              try self.checkActive()
              self.condition.lock()
              self.state = .writing
              self.condition.unlock()
              response.resume()
            } catch {
              response.resume(throwing: error)
              throw error
            }
          case .finish(let response):
            finishing = response
            guard written == size else { throw CocoaError(.fileWriteUnknown) }
            try file.synchronize()
            try file.close()
            try self.checkActive()
            return
          case nil: throw CancellationError()
          }
        }
      }
    } catch { failure = error }
    condition.lock()
    state = failure == nil && !stopping ? .idle : .failed
    let abandoned = pending
    pending = nil
    condition.unlock()
    switch abandoned {
    case .append(_, let response), .finish(let response):
      response.resume(throwing: CancellationError())
    case nil: break
    }
    if !opened { reply.resume(throwing: failure ?? CancellationError()) }
    if let finishing {
      if let failure { finishing.resume(throwing: failure) } else { finishing.resume() }
    }
  }

  private func checkReadyToPublish() throws {
    condition.lock()
    defer { condition.unlock() }
    guard state == .idle, !stopping else { throw CocoaError(.fileWriteUnknown) }
  }

  private func checkActive() throws {
    condition.lock()
    defer { condition.unlock() }
    if stopping { throw CancellationError() }
  }

  private func coordinate(_ url: URL, accessor: (URL) throws -> Void) throws {
    var failure: Error?
    var coordinationError: NSError?
    var accessed = false
    coordinator.coordinate(writingItemAt: url, options: [], error: &coordinationError) { target in
      do {
        try accessor(target)
        accessed = true
      } catch { failure = error }
    }
    if !accessed { throw failure ?? coordinationError ?? CocoaError(.fileWriteUnknown) }
  }

  private func enqueue<Value: Sendable>(_ operation: @escaping @Sendable () throws -> Value)
    async throws -> Value
  {
    try await withCheckedThrowingContinuation { reply in
      queue.async { reply.resume(with: Result { try operation() }) }
    }
  }
}
