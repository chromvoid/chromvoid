import CoreFoundation
import Foundation

public enum ProviderTransportError: Error, Sendable {
  case unavailable, invalidMessage, timedOut
}

/// Apple transport only; no vault, persisted carrier or Core dependency.
public enum ProviderTransport {
  public static let maximumMessageBytes = 1_048_576
  public static let timeout: TimeInterval = 10
}

/// Mutable state is exclusively protected by the lock. The semaphore wakes only this call.
private final class PendingReply: @unchecked Sendable {
  let ready = DispatchSemaphore(value: 0)
  private let lock = NSLock()
  private var stopped = false
  private var response: Data?
  private var task: Task<Void, Never>?

  func install(_ task: Task<Void, Never>) {
    let cancel = lock.withLock {
      if stopped { return true }
      self.task = task
      return false
    }
    if cancel { task.cancel() }
  }

  func complete(_ data: Data?) {
    lock.withLock {
      if !stopped { response = data }
      task = nil
    }
    ready.signal()
  }

  func cancel() {
    let work = lock.withLock {
      stopped = true
      response = nil
      let work = task
      task = nil
      return work
    }
    work?.cancel()
    ready.signal()
  }

  func takeResponse() -> Data? {
    lock.withLock {
      defer { response = nil }
      return stopped ? nil : response
    }
  }
}

/// CF retains this context while callbacks run. All mutable fields use the lock.
private final class PortContext: @unchecked Sendable {
  let handler: @Sendable (Data) async throws -> Data
  let timeout: TimeInterval
  private let lock = NSLock()
  private var active = true
  private var calls: [UUID: PendingReply] = [:]

  init(timeout: TimeInterval, handler: @escaping @Sendable (Data) async throws -> Data) {
    self.timeout = timeout
    self.handler = handler
  }

  func stop() -> Bool {
    let pending: [PendingReply]? = lock.withLock {
      guard active else { return nil }
      active = false
      defer { calls.removeAll() }
      return Array(calls.values)
    }
    guard let pending else { return false }
    for call in pending { call.cancel() }
    return true
  }

  func respond(_ input: CFData) -> Unmanaged<CFData>? {
    let length = CFDataGetLength(input)
    guard length > 0, length <= ProviderTransport.maximumMessageBytes else { return nil }
    let call = PendingReply()
    let identifier = UUID()
    guard
      lock.withLock({
        guard active else { return false }
        calls[identifier] = call
        return true
      })
    else { return nil }
    defer { _ = lock.withLock { calls.removeValue(forKey: identifier) } }
    // CFMessagePort requires an independent copy before asynchronous ownership.
    let request = Data(bytes: CFDataGetBytePtr(input), count: length)
    let handler = handler
    call.install(
      Task {
        do {
          try Task.checkCancellation()
          let reply = try await handler(request)
          try Task.checkCancellation()
          call.complete(reply.count <= ProviderTransport.maximumMessageBytes ? reply : nil)
        } catch { call.complete(nil) }
      })
    // This runs exclusively on the listener's dedicated DispatchQueue, never MainActor.
    guard call.ready.wait(timeout: .now() + timeout) == .success else {
      call.cancel()
      return nil
    }
    guard let response = call.takeResponse() else { return nil }
    return Unmanaged.passRetained(response as CFData)
  }
}

/// The port is immutable; stop invalidates it exactly once through PortContext's lock.
public final class ProviderMessagePortServer: @unchecked Sendable {
  private let port: CFMessagePort
  private let context: PortContext

  public init(
    serviceName: String, timeout: TimeInterval = ProviderTransport.timeout,
    handler: @escaping @Sendable (Data) async throws -> Data
  ) throws {
    guard serviceName.hasPrefix("group.com.chromvoid.iosair."),
      serviceName.utf8.count < 128, timeout > 0, timeout <= ProviderTransport.timeout
    else { throw ProviderTransportError.invalidMessage }
    let context = PortContext(timeout: timeout, handler: handler)
    var info = CFMessagePortContext(
      version: 0, info: Unmanaged.passUnretained(context).toOpaque(),
      retain: { pointer in
        guard let pointer else { return nil }
        return UnsafeRawPointer(Unmanaged<PortContext>.fromOpaque(pointer).retain().toOpaque())
      },
      release: { pointer in
        if let pointer { Unmanaged<PortContext>.fromOpaque(pointer).release() }
      }, copyDescription: nil)
    var shouldFreeInfo: DarwinBoolean = true
    guard
      let port = CFMessagePortCreateLocal(
        nil, serviceName as CFString,
        { _, messageID, data, info in
          guard messageID == 1, let data, let info else { return nil }
          return Unmanaged<PortContext>.fromOpaque(info).takeUnretainedValue().respond(data)
        }, &info, &shouldFreeInfo), !shouldFreeInfo.boolValue
    else { throw ProviderTransportError.unavailable }
    self.port = port
    self.context = context
    CFMessagePortSetDispatchQueue(port, DispatchQueue(label: "air.provider.ipc"))
  }

  public func stop() {
    if context.stop() { CFMessagePortInvalidate(port) }
  }

  deinit { stop() }
}

/// CF caches remote ports by name. Retain a reference for the finite send, but never
/// invalidate it from one caller: other requests may share the same CF object.
private final class RemotePort: @unchecked Sendable {
  let value: CFMessagePort
  init(_ value: CFMessagePort) { self.value = value }
}

/// Cancellation can precede continuation installation; completion is always delivered once.
private final class ClientReply: @unchecked Sendable {
  private let lock = NSLock()
  private var completed = false
  private var continuation: CheckedContinuation<Data, any Error>?

  func install(_ continuation: CheckedContinuation<Data, any Error>) -> Bool {
    let accepted = lock.withLock {
      guard !completed else { return false }
      self.continuation = continuation
      return true
    }
    if !accepted { continuation.resume(throwing: CancellationError()) }
    return accepted
  }

  func complete(_ result: Result<Data, any Error>) {
    let pending = lock.withLock {
      guard !completed else { return Optional<CheckedContinuation<Data, any Error>>.none }
      completed = true
      defer { continuation = nil }
      return continuation
    }
    pending?.resume(with: result)
  }
}

public struct ProviderMessagePortClient: Sendable {
  private let serviceName: String
  private let timeout: TimeInterval

  public init(serviceName: String, timeout: TimeInterval = ProviderTransport.timeout) {
    self.serviceName = serviceName
    self.timeout = timeout
  }

  public func request(_ payload: Data) async throws -> Data {
    guard !payload.isEmpty, payload.count <= ProviderTransport.maximumMessageBytes,
      serviceName.hasPrefix("group.com.chromvoid.iosair."), serviceName.utf8.count < 128,
      timeout > 0, timeout <= ProviderTransport.timeout
    else { throw ProviderTransportError.invalidMessage }
    try Task.checkCancellation()
    guard let value = CFMessagePortCreateRemote(nil, serviceName as CFString) else {
      throw ProviderTransportError.unavailable
    }
    let port = RemotePort(value)
    let delivery = ClientReply()
    do {
      let reply = try await withTaskCancellationHandler {
        try await withCheckedThrowingContinuation { continuation in
          guard delivery.install(continuation) else { return }
          // Blocking CoreFoundation IPC stays off Swift's cooperative executor.
          DispatchQueue.global(qos: .userInitiated).async {
            delivery.complete(
              Result {
                var received: Unmanaged<CFData>?
                let status = CFMessagePortSendRequest(
                  port.value, 1, payload as CFData, min(1, timeout), timeout,
                  CFRunLoopMode.defaultMode.rawValue, &received)
                guard status == kCFMessagePortSuccess else {
                  if status == kCFMessagePortReceiveTimeout || status == kCFMessagePortSendTimeout {
                    throw ProviderTransportError.timedOut
                  }
                  throw ProviderTransportError.unavailable
                }
                guard let received = received?.takeRetainedValue(),
                  CFDataGetLength(received) > 0,
                  CFDataGetLength(received) <= ProviderTransport.maximumMessageBytes
                else { throw ProviderTransportError.invalidMessage }
                return received as Data
              })
          }
        }
      } onCancel: {
        delivery.complete(.failure(CancellationError()))
      }
      try Task.checkCancellation()
      return reply
    } catch {
      try Task.checkCancellation()
      throw error
    }
  }
}
