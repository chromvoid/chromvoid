import Foundation

/// A user-requested external copy, never a preview cache. Close after the system handoff.
/// Revocation removes our copy; it cannot retract data another process already consumed.
@MainActor
public final class FileExportCopy: Identifiable {
  public let id = UUID()
  public let generation: UInt64
  public private(set) var url: URL?
  public private(set) var metadata: SourceMetadataResponse?
  private let file = ExportScratchFile()
  private var revoked = false
  private var cleanup: Task<Void, Error>?

  init(generation: UInt64) { self.generation = generation }
  deinit {
    let file = file
    Task { try? await file.remove() }
  }

  func open(name: String) async throws {
    try checkActive()
    try await file.open(name: name)
    try checkActive()
  }

  func append(_ bytes: Data) async throws {
    try checkActive()
    try await file.append(bytes)
    try checkActive()
  }

  func finish(metadata: SourceMetadataResponse) async throws {
    try checkActive()
    let destination = try await file.finish()
    try checkActive()
    self.metadata = metadata
    url = destination
  }

  private func checkActive() throws {
    try Task.checkCancellation()
    guard !revoked else { throw BridgeError.SessionRevoked }
  }

  public func revoke() {
    revoked = true
    url = nil
    metadata = nil
    if cleanup == nil { cleanup = Task { [file] in try await file.remove() } }
  }

  /// Await deletion even when the caller's Swift task was canceled.
  public func close() async throws {
    revoke()
    try await cleanup?.value
  }
}

/// Disk work is serialized outside MainActor. This namespace is reserved for explicit exports.
actor ExportScratchFile {
  static var root: URL {
    FileManager.default.temporaryDirectory.appendingPathComponent(
      "ChromVoidAir-ExplicitExports", isDirectory: true)
  }
  private let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
  private var destination: URL?
  private var handle: FileHandle?
  private var removed = false

  /// Trusted bootstrap only, before this process can create any export resource.
  static func removeAbandoned() throws {
    if FileManager.default.fileExists(atPath: root.path) {
      try FileManager.default.removeItem(at: root)
    }
  }

  func open(name: String) throws {
    guard !removed, destination == nil, !name.isEmpty,
      name != ".", name != "..", !name.contains("/"), !name.contains("\0")
    else { throw CocoaError(.fileWriteInvalidFileName) }
    let manager = FileManager.default
    try manager.createDirectory(
      at: directory, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete, .posixPermissions: 0o700])
    var directoryURL = directory
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try directoryURL.setResourceValues(values)
    let target = directory.appendingPathComponent(name, isDirectory: false)
    // The fresh UUID directory belongs exclusively to this export; there is no overwrite path.
    guard
      manager.createFile(
        atPath: target.path, contents: nil,
        attributes: [.protectionKey: FileProtectionType.complete, .posixPermissions: 0o600])
    else { throw CocoaError(.fileWriteUnknown) }
    destination = target
    handle = try FileHandle(forWritingTo: target)
  }

  func append(_ bytes: Data) throws {
    guard !removed, let handle else { throw CocoaError(.fileWriteUnknown) }
    try handle.write(contentsOf: bytes)
  }

  func finish() throws -> URL {
    guard !removed, let handle, let destination else { throw CocoaError(.fileWriteUnknown) }
    try handle.synchronize()
    try handle.close()
    self.handle = nil
    return destination
  }

  func remove() throws {
    removed = true
    // Attempt deletion even if closing the descriptor fails.
    defer { handle = nil }
    try? handle?.close()
    if FileManager.default.fileExists(atPath: directory.path) {
      try FileManager.default.removeItem(at: directory)
    }
    destination = nil
  }
}

final class WeakFileExportCopy {
  weak var value: FileExportCopy?
  init(_ value: FileExportCopy) { self.value = value }
}
