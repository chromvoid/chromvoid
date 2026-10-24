import AirProviderTransport
import ChromVoidBridge
import Foundation
import XCTest

final class ProviderTransportTests: XCTestCase {
  private func serviceName() throws -> String {
    let name = try XCTUnwrap(ProviderHostConfiguration.serviceName())
    return name + "." + UUID().uuidString.prefix(8)
  }

  @MainActor
  func testRealHostProviderMessagesStopOnBackground() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    _ = try client.activate()
    let name = try XCTUnwrap(ProviderHostConfiguration.serviceName())
    let transport = ProviderMessagePortClient(serviceName: name)
    let request = try JSONSerialization.data(withJSONObject: [
      "request_id": "native-ipc-status", "command": "credential_provider:status", "data": [:],
    ])
    let response = try await transport.request(request)
    let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: response) as? [String: Any])
    XCTAssertEqual(envelope["request_id"] as? String, "native-ipc-status")
    XCTAssertEqual(envelope["success"] as? Bool, true)
    XCTAssertEqual((envelope["result"] as? [String: Any])?["vault_open"] as? Bool, false)
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-ipc-" + UUID().uuidString)
    let openRequest = try JSONSerialization.data(withJSONObject: [
      "request_id": "native-ipc-session", "command": "credential_provider:session:open",
      "data": [:],
    ])
    let opened = try await transport.request(openRequest)
    let session = try XCTUnwrap(JSONSerialization.jsonObject(with: opened) as? [String: Any])
    XCTAssertEqual(session["request_id"] as? String, "native-ipc-session")
    let token = try XCTUnwrap((session["result"] as? [String: Any])?["provider_session"] as? String)
    XCTAssertFalse(token.isEmpty)
    _ = try client.deactivate()
    do {
      _ = try await transport.request(request)
      XCTFail("Backgrounded host must not accept provider IPC")
    } catch ProviderTransportError.unavailable {}
  }

  func testTransportRoundtripAndUnavailableHost() async throws {
    let name = try serviceName()
    let server = try ProviderMessagePortServer(serviceName: name) { data in data }
    let client = ProviderMessagePortClient(serviceName: name)
    let payload = Data("synthetic-provider-reply".utf8)
    let reply = try await client.request(payload)
    XCTAssertEqual(reply, payload)
    let repeated = try await client.request(payload)
    XCTAssertEqual(repeated, payload)
    server.stop()
    do {
      _ = try await client.request(payload)
      XCTFail("Stopped server must be unavailable")
    } catch ProviderTransportError.unavailable {}
  }

  func testStopCancelsAnActiveHandlerAndPreventsDelivery() async throws {
    let started = expectation(description: "handler started")
    let canceled = expectation(description: "handler canceled")
    let name = try serviceName()
    let server = try ProviderMessagePortServer(serviceName: name) { _ in
      started.fulfill()
      do { try await Task.sleep(for: .seconds(30)) } catch {
        canceled.fulfill()
        throw error
      }
      return Data("must-not-arrive".utf8)
    }
    let request = Task { try await ProviderMessagePortClient(serviceName: name).request(Data([1])) }
    await fulfillment(of: [started], timeout: 2)
    server.stop()
    do {
      _ = try await request.value
      XCTFail("Stopped handler must not deliver a reply")
    } catch is ProviderTransportError {}
    await fulfillment(of: [canceled], timeout: 2)
  }

  func testConcurrentRequestsKeepTheirOwnReplies() async throws {
    let name = try serviceName()
    let server = try ProviderMessagePortServer(serviceName: name) { data in
      try await Task.sleep(for: .milliseconds(30))
      return data
    }
    defer { server.stop() }
    let client = ProviderMessagePortClient(serviceName: name)
    try await withThrowingTaskGroup(of: Void.self) { group in
      for value in UInt8(1)...4 {
        group.addTask {
          let payload = Data([value])
          let reply = try await client.request(payload)
          XCTAssertEqual(reply, payload)
        }
      }
      try await group.waitForAll()
    }
  }

  func testCancelingOneRequestDoesNotInvalidateAnother() async throws {
    let started = expectation(description: "first request started")
    let name = try serviceName()
    let server = try ProviderMessagePortServer(serviceName: name) { data in
      if data == Data([1]) {
        started.fulfill()
        try await Task.sleep(for: .milliseconds(100))
      }
      return data
    }
    defer { server.stop() }
    let client = ProviderMessagePortClient(serviceName: name)
    let first = Task { try await client.request(Data([1])) }
    await fulfillment(of: [started], timeout: 2)
    first.cancel()
    let reply = try await client.request(Data([2]))
    XCTAssertEqual(reply, Data([2]))
    do {
      _ = try await first.value
      XCTFail("Canceled request must not deliver a reply")
    } catch is CancellationError {}
  }

  func testClientCancellationReturnsBeforeTheReceiveTimeout() async throws {
    let started = expectation(description: "cancelable handler started")
    let returned = expectation(description: "client cancellation returned")
    let name = try serviceName()
    let server = try ProviderMessagePortServer(serviceName: name) { _ in
      started.fulfill()
      try await Task.sleep(for: .seconds(30))
      return Data([1])
    }
    defer { server.stop() }
    let operation = Task {
      do {
        _ = try await ProviderMessagePortClient(serviceName: name).request(Data([1]))
        XCTFail("Canceled client must not deliver a response")
      } catch is CancellationError { returned.fulfill() }
    }
    await fulfillment(of: [started], timeout: 2)
    operation.cancel()
    await fulfillment(of: [returned], timeout: 2)
    try await operation.value
  }

  func testBoundedTimeoutCancelsTheHandler() async throws {
    let canceled = expectation(description: "timed out handler canceled")
    let name = try serviceName()
    let server = try ProviderMessagePortServer(serviceName: name, timeout: 0.1) { _ in
      do { try await Task.sleep(for: .seconds(30)) } catch {
        canceled.fulfill()
        throw error
      }
      return Data([1])
    }
    defer { server.stop() }
    do {
      _ = try await ProviderMessagePortClient(serviceName: name, timeout: 1).request(Data([1]))
      XCTFail("Timed out handler must not produce a reply")
    } catch is ProviderTransportError {}
    await fulfillment(of: [canceled], timeout: 2)
  }
}
