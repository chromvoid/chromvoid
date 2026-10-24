import ChromVoidBridge

/// Runtime close revokes admission synchronously but releases the process owner after cleanup.
@MainActor
func withMediaRuntime(_ body: (RuntimeClient) async throws -> Void) async throws {
  let client = try await RuntimeClient.open()
  do {
    try await body(client)
  } catch {
    try? await close(client)
    throw error
  }
  try await close(client)
}

@MainActor
private func close(_ client: RuntimeClient) async throws {
  var snapshot = try client.close()
  while snapshot.cleanupPending {
    snapshot = try await client.events(after: snapshot.sequence).snapshot
  }
}
