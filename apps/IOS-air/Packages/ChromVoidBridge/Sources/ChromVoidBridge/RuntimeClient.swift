import AirProviderTransport
import Foundation

/// MainActor owns request ordering and presentation admission. Rust owns the session.
@MainActor
public final class RuntimeClient {
  /// Seconds a credential page pretends to take to load. The fixture UI test host sets this
  /// before the first read so a test can see a page while it is still loading; nothing in the
  /// shipped app assigns it, and it stays nil there.
  public nonisolated(unsafe) static var slowCredentialDetail: Double?

  let runtime: any AirRuntimeProtocol
  private var nextRequestID: UInt64 = 0
  var providerServer: ProviderMessagePortServer?
  let providerIdentities: ProviderIdentitySync?
  var fileExports: [WeakFileExportCopy] = []
  var storageBackups: [WeakStorageBackupDestination] = []
  var storageRestores: [WeakStorageRestoreSource] = []

  deinit { providerServer?.stop() }

  public init(runtime: any AirRuntimeProtocol) {
    self.runtime = runtime
    providerIdentities = SystemProviderIdentityStore.forEmbeddedProvider().map(
      ProviderIdentitySync.init)
    providerIdentities?.clear()
  }

  init(runtime: any AirRuntimeProtocol, identityStore: any ProviderIdentityStore) {
    self.runtime = runtime
    providerIdentities = ProviderIdentitySync(store: identityStore)
    providerIdentities?.clear()
  }

  public static func open() async throws -> RuntimeClient {
    // Match Rust's process HOME: NSHomeDirectory may use the /var alias on a device.
    guard let home = ProcessInfo.processInfo.environment["HOME"] else {
      throw BridgeError.InvalidStorageRoot
    }
    let root = URL(fileURLWithPath: home, isDirectory: true)
      .appendingPathComponent("Library/Application Support/ChromVoidAir", isDirectory: true).path
    let runtime = try await Task.detached {
      try ExportScratchFile.removeAbandoned()
      return try AirRuntime(expectedFingerprint: BuildFingerprint.expected, storageRoot: root)
    }.value
    if Task.isCancelled {
      _ = try? runtime.shutdown()
      throw CancellationError()
    }
    return RuntimeClient(runtime: runtime)
  }

  /// Returns the application-owned Rust controller without starting network activity.
  public func host() throws -> AirHost { try runtime.host() }

  public func snapshot() throws -> AirSnapshot { try runtime.snapshot() }
  public func setAutoLockTimeout(seconds: UInt64, generation: UInt64) throws {
    try runtime.setAutoLockTimeout(generation: generation, timeoutSeconds: seconds)
  }
  public func recordUserActivity(generation: UInt64) throws {
    try runtime.recordUserActivity(generation: generation)
  }
  public func activate() throws -> AirSnapshot {
    let snapshot = try runtime.activate()
    startProviderServer()
    refreshProviderIdentities()
    return snapshot
  }
  public func deactivate() throws -> AirSnapshot {
    revokeTransientResources()
    return try runtime.deactivate()
  }
  public func lock() throws -> AirSnapshot {
    revokeTransientResources()
    return try runtime.lock()
  }
  public func close() throws -> AirSnapshot {
    revokeTransientResources()
    return try runtime.shutdown()
  }
  /// Leaving the session drops every bounded transfer and the provider port: nothing survives
  /// a generation change.
  private func revokeTransientResources() {
    revokeStorageRestores()
    revokeStorageBackups()
    revokeFileExports()
    stopProviderServer()
  }

  public func events(after sequence: UInt64) async throws -> AirEventBatch {
    let batch = try await runtime.events(afterSequence: sequence)
    for source in storageRestores
    where source.generation != batch.snapshot.generation || batch.snapshot.cleanupPending
      || (batch.snapshot.phase != .locked && batch.snapshot.phase != .unlocked)
    {
      source.value?.cancel()
    }
    for backup in storageBackups
    where backup.generation != batch.snapshot.generation || batch.snapshot.cleanupPending
      || (batch.snapshot.phase != .locked && batch.snapshot.phase != .unlocked)
    {
      backup.value?.cancel()
    }
    for copy in fileExports.compactMap(\.value)
    where batch.snapshot.phase != .unlocked || batch.snapshot.cleanupPending
      || copy.generation != batch.snapshot.generation
    {
      copy.revoke()
    }
    startProviderServer()
    refreshProviderIdentities()
    return batch
  }

  public func setupAdministrator(password: String) async throws {
    let _: EmptyResult = try await perform(
      "master:setup", data: ["master_password": password], phase: .locked)
  }

  public func unlock(password: String) async throws {
    let _: EmptyResult = try await perform(
      "vault:unlock", data: ["password": password], phase: .locked)
  }

  func perform<Payload: Decodable, Input: Encodable>(
    _ command: String, data: Input, phase: AirPhase, generation: UInt64? = nil
  ) async throws -> Payload {
    let request = try JSONEncoder().encode(CommandRequest(v: 1, command: command, data: data))
    return try await performExecution(phase: phase, generation: generation) {
      requestID, generation in
      try self.runtime.beginExecute(requestId: requestID, generation: generation, request: request)
    }
  }

  // RPC and binary resources reserve request IDs before the first suspension.
  func performExecution<Payload: Decodable>(
    phase: AirPhase, generation: UInt64? = nil,
    begin: (UInt64, UInt64) throws -> any AirFinishing
  ) async throws -> Payload {
    let payload = try await execute(phase: phase, generation: generation, begin: begin)
    return try JSONDecoder().decode(RPCResult<Payload>.self, from: payload).value
  }

  func execute(
    phase: AirPhase, generation: UInt64? = nil,
    begin: (UInt64, UInt64) throws -> any AirFinishing
  ) async throws -> Data {
    let current = try runtime.snapshot()
    guard current.phase == phase, !current.cleanupPending,
      generation == nil || generation == current.generation
    else {
      throw BridgeError.SessionRevoked
    }
    guard nextRequestID < UInt64.max else {
      _ = try runtime.shutdown()
      throw BridgeError.InvalidRequestId
    }
    nextRequestID += 1
    let requestID = nextRequestID
    let runtime = runtime
    try Task.checkCancellation()
    let execution = try begin(requestID, current.generation)
    let reply = try await withTaskCancellationHandler {
      try Task.checkCancellation()
      return try await execution.finish()
    } onCancel: {
      try? runtime.cancel(requestId: requestID)
    }
    try Task.checkCancellation()
    let latest = try runtime.snapshot()
    guard reply.requestId == requestID, reply.generation == current.generation,
      latest.generation == current.generation,
      latest.phase == phase || (phase == .locked && latest.phase == .unlocked)
    else { throw BridgeError.SessionRevoked }
    return reply.payload
  }

  struct CommandRequest<Input: Encodable>: Encodable {
    let v: Int
    let command: String
    let data: Input
  }

  struct EmptyResult: Decodable {}
}

/// Rust resources whose `finish` yields one bounded reply under the same generation checks.
protocol AirFinishing: AnyObject, Sendable {
  func finish() async throws -> AirReply
}
extension AirExecution: AirFinishing {}
extension AirDerivative: AirFinishing {}
