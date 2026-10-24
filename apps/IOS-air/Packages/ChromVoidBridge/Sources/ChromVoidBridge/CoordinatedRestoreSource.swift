import Foundation

/// The queue owns snapshot descriptors and security scope; the lock only guards cancellation.
/// Foundation unlinks each upload snapshot after its accessor, while the opened descriptor
/// remains valid for bounded reads outside coordination. No directory ZIP is requested.
final class CoordinatedRestoreSource: @unchecked Sendable {
  private struct Artifact {
    let file: FileHandle
    let size: UInt64
    var remaining: UInt64
  }
  private let directory: URL
  private let queue = DispatchQueue(
    label: "com.chromvoid.iosair.restore-source", qos: .userInitiated)
  private let coordinator = NSFileCoordinator()
  private let lock = NSLock()
  private var cancelled = false
  // Queue-owned after initialization.
  private var files: [AirRestoreArtifact: Artifact] = [:]
  private var missing: Set<AirRestoreArtifact> = []
  private var scoped = false
  private var closed = false
  private var opened = false

  init(directory: URL) { self.directory = directory }

  deinit {
    let files = files
    let scoped = scoped
    let directory = directory
    queue.async {
      for artifact in files.values { try? artifact.file.close() }
      if scoped { directory.stopAccessingSecurityScopedResource() }
    }
  }

  func open(_ specs: [AirRestoreArtifactSpec]) async throws -> UInt64 {
    try await enqueue {
      try self.checkActive()
      guard !self.opened, !self.closed, !specs.isEmpty else { throw CocoaError(.fileReadUnknown) }
      self.opened = true
      self.scoped = self.directory.startAccessingSecurityScopedResource()
      guard try self.directory.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true else {
        throw CocoaError(.fileReadInvalidFileName)
      }
      var total: UInt64 = 0
      for spec in specs {
        try self.checkActive()
        guard !spec.name.isEmpty, spec.name != ".", spec.name != "..",
          !spec.name.contains("/"), !spec.name.contains("\\"), !spec.name.contains("\0"),
          self.files[spec.artifact] == nil, !self.missing.contains(spec.artifact)
        else { throw CocoaError(.fileReadInvalidFileName) }
        let url = self.directory.appendingPathComponent(spec.name)
        let attributes: [FileAttributeKey: Any]
        do {
          attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        } catch let error as CocoaError
          where !spec.required
          && (error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile)
        {
          self.missing.insert(spec.artifact)
          continue
        }
        guard attributes[.type] as? FileAttributeType == .typeRegular else {
          throw CocoaError(.fileReadUnsupportedScheme)
        }
        var failure: Error?
        var coordinationError: NSError?
        self.coordinator.coordinate(
          readingItemAt: url, options: .forUploading, error: &coordinationError
        ) { snapshot in
          do {
            try self.checkActive()
            let file = try FileHandle(forReadingFrom: snapshot)
            do {
              let size = try file.seekToEnd()
              guard size <= spec.maximumBytes else { throw BridgeError.RestoreInputTooLarge }
              try file.seek(toOffset: 0)
              self.files[spec.artifact] = Artifact(file: file, size: size, remaining: size)
            } catch {
              try? file.close()
              throw error
            }
          } catch { failure = error }
        }
        guard let artifact = self.files[spec.artifact] else {
          throw failure ?? coordinationError ?? CocoaError(.fileReadUnknown)
        }
        let (next, overflow) = total.addingReportingOverflow(artifact.size)
        guard !overflow else { throw BridgeError.RestoreInputTooLarge }
        total = next
      }
      try self.checkActive()
      return total
    }
  }

  func read(_ kind: AirRestoreArtifact, maximum: UInt64) async throws -> Data? {
    try await enqueue {
      try self.checkActive()
      guard !self.closed, maximum > 0, maximum <= UInt64(Int.max) else {
        throw CocoaError(.fileReadUnknown)
      }
      if self.missing.contains(kind) { return nil }
      guard var artifact = self.files[kind] else { throw CocoaError(.fileReadUnknown) }
      guard artifact.remaining > 0 else { return Data() }
      let count = Int(min(maximum, artifact.remaining))
      guard let bytes = try artifact.file.read(upToCount: count), !bytes.isEmpty else {
        throw CocoaError(.fileReadCorruptFile)
      }
      artifact.remaining -= UInt64(bytes.count)
      self.files[kind] = artifact
      try self.checkActive()
      return bytes
    }
  }

  func cancel() {
    lock.lock()
    cancelled = true
    lock.unlock()
    coordinator.cancel()
  }

  func close() async throws {
    cancel()
    try await enqueue {
      guard !self.closed else { return }
      self.closed = true
      var failure: Error?
      for artifact in self.files.values {
        do { try artifact.file.close() } catch { failure = failure ?? error }
      }
      self.files = [:]
      self.missing = []
      if self.scoped { self.directory.stopAccessingSecurityScopedResource() }
      self.scoped = false
      if let failure { throw failure }
    }
  }

  private func checkActive() throws {
    lock.lock()
    defer { lock.unlock() }
    if cancelled { throw CancellationError() }
  }

  private func enqueue<T: Sendable>(_ operation: @escaping @Sendable () throws -> T) async throws
    -> T
  {
    try await withCheckedThrowingContinuation { reply in
      queue.async { reply.resume(with: Result { try operation() }) }
    }
  }
}
