import ChromVoidBridge
import Foundation
import Security
import XCTest

final class NativeRuntimeTests: XCTestCase {
  @MainActor
  func testRustIdleLockCrossesTheGeneratedBridgeAndRevokesOldInput() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    let initial = try client.snapshot()
    try client.setAutoLockTimeout(seconds: 1, generation: initial.generation)
    XCTAssertEqual(try client.snapshot().phase, .locked)
    if !initial.masterConfigured {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-idle-test-" + UUID().uuidString)
    let unlocked = try client.snapshot()
    try client.recordUserActivity(generation: unlocked.generation)

    let deadline = ContinuousClock.now.advanced(by: .seconds(10))
    while ContinuousClock.now < deadline {
      let current = try client.snapshot()
      if current.phase == .locked && !current.cleanupPending { break }
      try await Task.sleep(for: .milliseconds(20))
    }
    let locked = try client.snapshot()
    XCTAssertEqual(locked.phase, .locked)
    XCTAssertFalse(locked.cleanupPending)
    XCTAssertGreaterThan(locked.generation, unlocked.generation)
    guard locked.sequence > unlocked.sequence else {
      return XCTFail("Inactivity must publish a lifecycle event before the test deadline")
    }
    let events = try await client.events(after: unlocked.sequence)
    XCTAssertEqual(events.snapshot.phase, .locked)
    XCTAssertThrowsError(try client.recordUserActivity(generation: unlocked.generation)) { error in
      guard case BridgeError.SessionRevoked = error else {
        return XCTFail("Expected revoked input")
      }
    }
    XCTAssertThrowsError(
      try client.setAutoLockTimeout(seconds: 0, generation: unlocked.generation))
    try client.setAutoLockTimeout(seconds: 0, generation: locked.generation)
    _ = try client.deactivate()
    XCTAssertThrowsError(try client.recordUserActivity(generation: locked.generation))
  }
  @MainActor
  func testHostBridgeIsIdleUntilStartedAndRejectsRevokedSession() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    let host = try client.host()
    let initial = try host.snapshot()
    XCTAssertEqual(initial.phase, .idle)
    XCTAssertTrue(initial.connectedPeers.isEmpty)
    XCTAssertNil(initial.pairingPin)
    let preferences = try await host.preferences()
    XCTAssertFalse(preferences.enabled)
    let peers = try await host.trustedPeers()
    XCTAssertTrue(peers.isEmpty)
    let generation = try client.snapshot().generation
    XCTAssertThrowsError(
      try host.startPairing(
        generation: generation, relayUrl: "https://example.test", deviceLabel: "Phone")
    ) { error in
      guard case BridgeError.InvalidRelayUrl = error else {
        return XCTFail("Expected relay validation before network activity")
      }
    }
    _ = try client.deactivate()
    XCTAssertEqual(try host.snapshot().phase, .idle)
    XCTAssertThrowsError(
      try host.startListening(
        generation: generation, relayUrl: "wss://example.test", deviceLabel: "Phone")
    ) { error in
      guard case BridgeError.SessionRevoked = error else {
        return XCTFail("Expected host admission to follow application authority")
      }
    }
  }

  @MainActor
  func testKeePassPasswordRetryAndReviewUseTheSameRustImportTransaction() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-keepass-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let file = try XCTUnwrap(
      Bundle(for: Self.self).url(forResource: "keepass-4", withExtension: "kdbx"))
    for (password, code) in [
      (nil, "CREDENTIAL_IMPORT_PASSWORD_REQUIRED"),
      ("incorrect", "CREDENTIAL_IMPORT_PASSWORD_INVALID"),
    ] {
      do {
        _ = try await client.reviewCredentialFile(
          file, mode: .merge, generation: generation, sourcePassword: password)
        XCTFail("Invalid password must not yield a committable review")
      } catch let error as RPCFailure {
        XCTAssertEqual(error.code, code)
      }
      let page = try await client.credentialPage(offset: 0, query: "", generation: generation)
      XCTAssertTrue(page.entries.isEmpty)
    }
    for attempt in 0..<2 {
      let reviewed = try await client.reviewCredentialFile(
        file, mode: .merge, generation: generation, sourcePassword: "synthetic-keepass-password")
      defer { reviewed.cancel() }
      XCTAssertEqual(reviewed.preview.source, "keepass")
      XCTAssertEqual(reviewed.preview.entryCount, 2)
      let before = try await client.credentialPage(offset: 0, query: "", generation: generation)
      XCTAssertEqual(before.entries.count, attempt == 0 ? 0 : 2)
      try await reviewed.commit()
      let exported = try await client.exportCredentialDocument(generation: generation)
      let root = try XCTUnwrap(JSONSerialization.jsonObject(with: exported) as? [String: Any])
      let entries = try XCTUnwrap(root["entries"] as? [[String: Any]])
      XCTAssertEqual(entries.count, 2)
      let mail = try XCTUnwrap(entries.first { $0["username"] as? String == "alice@example.test" })
      XCTAssertEqual(mail["password"] as? String, "  synthetic, \"keepass\"\npassword  ")
      XCTAssertTrue((mail["note"] as? String)?.contains("PIN: 0420") == true)
      XCTAssertNotNil(mail["icon_ref"])
    }
  }

  @MainActor
  func testOnePasswordArchiveReviewPreservesSecretsAndScopedIdentity() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-1password-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let file = try XCTUnwrap(
      Bundle(for: Self.self).url(forResource: "1password-credentials", withExtension: "1pux"))
    let original = try Data(contentsOf: file)
    for attempt in 0..<2 {
      let reviewed = try await client.reviewCredentialFile(
        file, mode: .merge, generation: generation)
      defer { reviewed.cancel() }
      XCTAssertEqual(reviewed.preview.source, "1password")
      XCTAssertEqual(reviewed.preview.entryCount, 7)
      XCTAssertEqual(
        reviewed.preview.warnings?.map(\.code.rawValue), ["attachments_omitted", "icons_omitted"])
      let before = try await client.credentialPage(offset: 0, query: "", generation: generation)
      XCTAssertEqual(before.entries.count, attempt == 0 ? 0 : 7)
      try await reviewed.commit()
      let exported = try await client.exportCredentialDocument(generation: generation)
      let root = try XCTUnwrap(JSONSerialization.jsonObject(with: exported) as? [String: Any])
      let entries = try XCTUnwrap(root["entries"] as? [[String: Any]])
      XCTAssertEqual(entries.count, 7)
      let mail = try XCTUnwrap(entries.first { $0["username"] as? String == "alice@example.test" })
      XCTAssertEqual(mail["password"] as? String, "  synthetic, \"one\"\npassword  ")
      XCTAssertTrue((mail["note"] as? String)?.contains("PIN: 0420") == true)
      XCTAssertNotNil(mail["icon_ref"])
      XCTAssertEqual(try Data(contentsOf: file), original)
    }
  }

  @MainActor
  func testCSVFileReviewPreservesQuotedSecretsAndRepeatsAsNewRecords() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-csv-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let file = FileManager.default.temporaryDirectory.appendingPathComponent(
      UUID().uuidString + ".csv")
    defer { try? FileManager.default.removeItem(at: file) }
    let bytes = Data(
      "name,password,notes,custom\nCSV native,\"  synthetic,\"\"quoted\"\"  \",note,omitted\nMissing,,,\n"
        .utf8)
    try bytes.write(to: file)
    for attempt in 0..<2 {
      let reviewed = try await client.reviewCredentialFile(
        file, mode: .merge, generation: generation)
      defer { reviewed.cancel() }
      XCTAssertEqual(reviewed.preview.source, "csv")
      XCTAssertEqual(reviewed.preview.entryCount, 1)
      XCTAssertEqual(
        reviewed.preview.warnings?.map(\.code.rawValue), ["invalid_rows", "unmapped_columns"])
      XCTAssertEqual(try Data(contentsOf: file), bytes)
      let before = try await client.credentialPage(offset: 0, query: "", generation: generation)
      XCTAssertEqual(before.entries.count, attempt)
      try await reviewed.commit()
      let exported = try await client.exportCredentialDocument(generation: generation)
      let document = try XCTUnwrap(JSONSerialization.jsonObject(with: exported) as? [String: Any])
      let entries = try XCTUnwrap(document["entries"] as? [[String: Any]])
      XCTAssertEqual(entries.count, attempt + 1)
      XCTAssertTrue(entries.allSatisfy { $0["password"] as? String == "  synthetic,\"quoted\"  " })
    }
  }

  @MainActor
  func testBitwardenFileReviewWarnsAndRepeatImportPreservesCredentials() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-bitwarden-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let file = FileManager.default.temporaryDirectory.appendingPathComponent(
      UUID().uuidString + ".json")
    defer { try? FileManager.default.removeItem(at: file) }
    let bytes = Data(
      #"{"encrypted":false,"items":[{"id":"bw-native","type":1,"name":"Bitwarden native","login":{"password":"  synthetic password  ","fido2Credentials":[{}]}},{"type":5,"name":"Unsupported synthetic SSH"}]}"#
        .utf8)
    for attempt in 0..<2 {
      try bytes.write(to: file)
      let reviewed = try await client.reviewCredentialFile(
        file, mode: .merge, generation: generation)
      defer { reviewed.cancel() }
      XCTAssertEqual(reviewed.preview.source, "bitwarden")
      XCTAssertEqual(reviewed.preview.entryCount, 1)
      XCTAssertEqual(reviewed.preview.createdEntryCount, attempt == 0 ? 1 : 0)
      XCTAssertEqual(reviewed.preview.updatedEntryCount, attempt)
      XCTAssertEqual(
        reviewed.preview.warnings?.map(\.code.rawValue),
        ["unsupported_records", "passkeys_omitted"])
      XCTAssertEqual(reviewed.preview.warnings?.map(\.count), [1, 1])
      XCTAssertEqual(try Data(contentsOf: file), bytes)
      let before = try await client.credentialPage(offset: 0, query: "", generation: generation)
      XCTAssertEqual(before.entries.count, attempt)
      // A provider changing the source after review cannot alter the approved snapshot.
      try Data("{}".utf8).write(to: file)
      try await reviewed.commit()
      let password = try await client.readCredentialSecret(
        id: "bw-native", type: "password", generation: generation)
      XCTAssertEqual(password, "  synthetic password  ")
      let after = try await client.credentialPage(offset: 0, query: "", generation: generation)
      XCTAssertEqual(after.entries.count, 1)
    }
  }

  @MainActor
  func testLegacyCredentialFileUsesTheExistingReviewAndCommitFlow() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-legacy-import-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let file = FileManager.default.temporaryDirectory.appendingPathComponent(
      UUID().uuidString + ".json")
    defer { try? FileManager.default.removeItem(at: file) }
    let existing = Data(
      #"{"folders":["Keep"],"entries":[],"foldersMeta":[{"path":"Keep","description":"Keep existing description"}]}"#
        .utf8)
    try existing.write(to: file)
    let initial = try await client.reviewCredentialFile(file, mode: .merge, generation: generation)
    try await initial.commit()
    let bytes = Data(
      #"[{"name":"Legacy","description":"Imported legacy group","entries":[{"id":"legacy","title":"Legacy login","password":"synthetic-legacy-password","note":"Synthetic legacy note"}]}]"#
        .utf8)
    try bytes.write(to: file)
    let reviewed = try await client.reviewCredentialFile(file, mode: .merge, generation: generation)
    defer { reviewed.cancel() }
    XCTAssertEqual(reviewed.preview.entryCount, 1)
    XCTAssertEqual(try Data(contentsOf: file), bytes)
    let before = try await client.credentialPage(offset: 0, query: "", generation: generation)
    XCTAssertTrue(before.entries.isEmpty)
    try await reviewed.commit()
    let password = try await client.readCredentialSecret(
      id: "legacy", type: "password", generation: generation)
    XCTAssertEqual(password, "synthetic-legacy-password")
    let exported = try await client.exportCredentialDocument(generation: generation)
    let document = try XCTUnwrap(JSONSerialization.jsonObject(with: exported) as? [String: Any])
    let entries = try XCTUnwrap(document["entries"] as? [[String: Any]])
    XCTAssertEqual(entries.first?["folderPath"] as? String, "/Legacy")
    XCTAssertEqual(entries.first?["note"] as? String, "Synthetic legacy note")
    let groups = try XCTUnwrap(document["foldersMeta"] as? [[String: Any]])
    XCTAssertTrue(
      groups.contains {
        $0["path"] as? String == "/Keep"
          && $0["description"] as? String == "Keep existing description"
      })
  }

  @MainActor
  func testCoordinatedImportAndChunkedExportPreserveTheReviewedDocument() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-file-import-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appendingPathComponent("synthetic-export.json")
    let note = String(repeating: "synthetic ", count: 2_000)
    let bytes = try JSONSerialization.data(withJSONObject: [
      "version": 1, "folders": [],
      "entries": (0..<60).map { ["id": "file-\($0)", "title": "File \($0)", "note": note] },
    ])
    XCTAssertGreaterThan(bytes.count, 1_024 * 1_024)
    try bytes.write(to: file)
    let reviewed = try await client.reviewCredentialFile(file, mode: .merge, generation: generation)
    defer { reviewed.cancel() }
    XCTAssertEqual(reviewed.preview.entryCount, 60)
    XCTAssertEqual(try Data(contentsOf: file), bytes)
    let before = try await client.credentialPage(offset: 0, query: "", generation: generation)
    XCTAssertTrue(before.entries.isEmpty)
    try FileManager.default.removeItem(at: file)
    try await reviewed.commit()
    let saved = try await client.readCredentialSecret(
      id: "file-59", type: "note", generation: generation)
    XCTAssertEqual(saved, note)
    let exported = try await client.exportCredentialDocument(generation: generation)
    XCTAssertGreaterThan(exported.count, 1_024 * 1_024)
    let document = try XCTUnwrap(JSONSerialization.jsonObject(with: exported) as? [String: Any])
    XCTAssertEqual(document["version"] as? Int, 4)
    let entries = try XCTUnwrap(document["entries"] as? [[String: Any]])
    XCTAssertEqual(entries.count, 60)
    XCTAssertTrue(entries.allSatisfy { $0["note"] as? String == note })

    let invalid = Data(#"{"version":99,"folders":[],"entries":[]}"#.utf8)
    try invalid.write(to: file)
    do {
      _ = try await client.reviewCredentialFile(file, mode: .replace, generation: generation)
      XCTFail("Unknown version must not prepare replacement")
    } catch {
      XCTAssertEqual((error as? RPCFailure)?.code, "EMPTY_PAYLOAD", "Unexpected error: \(error)")
    }
  }

  @MainActor
  func testBulkCredentialImportReviewConfirmationAndCancellationThroughNativeBridge() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-import-synthetic-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let note = String(repeating: "synthetic note ", count: 1_000)
    let bytes = try JSONSerialization.data(withJSONObject: [
      "mode": "replace", "allow_destructive": true,
      "folders": [],
      "entries": (0..<80).map { ["id": "bulk-\($0)", "title": "Bulk \($0)", "note": note] },
    ])
    XCTAssertGreaterThan(bytes.count, 1_024 * 1_024)
    let transfer = try client.beginCredentialImport(
      byteCount: UInt64(bytes.count), mode: .merge, generation: generation)
    defer { try? transfer.cancel() }
    let chunkSize = Int(client.credentialImportLimits.chunkBytes)
    for offset in stride(from: 0, to: bytes.count, by: chunkSize) {
      try transfer.append(bytes.subdata(in: offset..<min(offset + chunkSize, bytes.count)))
    }
    let review = try await transfer.review()
    XCTAssertEqual(review.entryCount, 80)
    XCTAssertEqual(review.mode, "merge")
    let before = try await client.credentialPage(offset: 0, query: "", generation: generation)
    XCTAssertTrue(before.entries.isEmpty)
    try await transfer.commit()
    let detail = try await client.credentialDetail(id: "bulk-79", generation: generation)
    XCTAssertEqual(detail.title, "Bulk 79")
    let imported = try await client.readCredentialSecret(
      id: "bulk-79", type: "note", generation: generation)
    XCTAssertEqual(imported, note)
    do {
      try await transfer.commit()
      XCTFail("A reviewed import must be consumed only once")
    } catch {
      guard case BridgeError.InvalidImportState = error else {
        return XCTFail("Expected consumed input")
      }
    }
    let empty = Data(#"{"folders":[],"entries":[]}"#.utf8)
    let cancelled = try client.beginCredentialImport(
      byteCount: UInt64(empty.count), mode: .replace, generation: generation)
    try cancelled.append(empty)
    _ = try await cancelled.review()
    try cancelled.cancel()
    do {
      try await cancelled.commit()
      XCTFail("Canceled import cannot replace the vault")
    } catch {
      guard case BridgeError.InvalidImportState = error else {
        return XCTFail("Expected canceled input")
      }
    }
    let preserved = try await client.credentialDetail(id: "bulk-79", generation: generation)
    XCTAssertEqual(preserved.title, "Bulk 79")
  }

  @MainActor
  func testCredentialImportRejectsStaleReviewAndRevokesReadyInput() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-import-authority-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    XCTAssertThrowsError(
      try client.beginCredentialImport(
        byteCount: client.credentialImportLimits.totalBytes + 1, mode: .merge,
        generation: generation)
    ) { error in
      guard case BridgeError.ImportTooLarge = error else {
        return XCTFail("Expected explicit transfer limit")
      }
    }
    let bytes = Data(#"{"folders":[],"entries":[{"id":"reviewed","title":"Reviewed"}]}"#.utf8)
    let transfer = try client.beginCredentialImport(
      byteCount: UInt64(bytes.count), mode: .merge, generation: generation)
    try transfer.append(bytes)
    _ = try await transfer.review()
    try await client.ensureGroup(path: "/Changed after review", generation: generation)
    do {
      try await transfer.commit()
      XCTFail("Changed catalog requires a new review")
    } catch { XCTAssertEqual((error as? RPCFailure)?.code, "SYNC_CONFLICT") }
    let page = try await client.credentialPage(offset: 0, query: "", generation: generation)
    XCTAssertTrue(page.entries.isEmpty)
    let locked = try client.beginCredentialImport(
      byteCount: UInt64(bytes.count), mode: .merge, generation: generation)
    defer { try? locked.cancel() }
    try locked.append(bytes)
    _ = try await locked.review()
    _ = try client.lock()
    do {
      try await locked.commit()
      XCTFail("Lock must revoke a ready import")
    } catch {
      guard case BridgeError.SessionRevoked = error else {
        return XCTFail("Expected revoked input")
      }
    }
  }

  @MainActor
  func testConfirmedCredentialClearThroughNativeBridgeAndLockedAdmission() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-clear-synthetic-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    try await client.ensureGroup(path: "/Disposable", generation: generation)
    _ = try await client.generateSSH(
      PassmanagerSSHKeygenRequest(
        comment: nil, keyType: "ed25519", name: "Disposable key", sourceEntryID: nil),
      generation: generation)
    try await client.clearCredentials(generation: generation)
    let groups = try await client.groupPage(parent: "/", offset: 0, generation: generation)
    XCTAssertTrue(groups.groups.isEmpty)
    let keys = try await client.sshPage(
      PassmanagerSSHPageRequest(
        keyType: nil, limit: 50, offset: 0, query: "", revision: nil, sourceEntryID: nil),
      generation: generation)
    XCTAssertTrue(keys.keys.isEmpty)
    _ = try client.lock()
    do {
      try await client.clearCredentials(generation: generation)
      XCTFail("Clear must reject stale authority")
    } catch {
      guard case BridgeError.SessionRevoked = error else {
        return XCTFail("Expected revoked authority")
      }
    }
  }

  @MainActor
  func testWebsiteValidationAndRevisionCheckedUpdateThroughNativeBridge() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-websites-synthetic-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let validated = try await client.validateWebsites(
      [
        CredentialWebsiteRule(matchMode: "host", sourceIndex: nil, value: "example.com")
      ], generation: generation)
    XCTAssertEqual(validated.rules.first?.value, "https://example.com")
    let urls = try JSONDecoder().decode(
      JSONAny.self, from: Data(#"[{"value":"https://example.com","match":"host"}]"#.utf8))
    _ = try await client.createCredential(
      PassmanagerEntryCreateRequest(
        createdTs: nil, entryID: "website-login", entryType: "login", groupPath: nil, iconRef: nil,
        otps: nil, paymentCard: nil,
        secrets: PassmanagerEntryCreateSecrets(
          cardCvv: nil, cardPan: nil,
          note: "synthetic-note", password: "synthetic-password"), tagKeys: nil, tags: nil,
        title: "Website fixture", updatedTs: nil, urls: urls, username: "alice"),
      generation: generation)
    let before = try await client.websiteRules(id: "website-login", generation: generation)
    XCTAssertEqual(before.rules.first?.matchMode, "host")
    let revision = try XCTUnwrap(before.revision)
    let saved = try await client.updateWebsites(
      PassmanagerWebsiteUpdateRequest(
        entryID: "website-login",
        revision: revision,
        rules: [
          CredentialWebsiteRule(
            matchMode: "exact", sourceIndex: 0,
            value: "updated.example/login")
        ]), generation: generation)
    XCTAssertTrue(saved.errors.isEmpty)
    XCTAssertEqual(saved.rules.first?.value, "https://updated.example/login")
    XCTAssertEqual(saved.rules.first?.matchMode, "exact")
    do {
      _ = try await client.updateWebsites(
        PassmanagerWebsiteUpdateRequest(
          entryID: "website-login",
          revision: revision, rules: []), generation: generation)
      XCTFail("Stale write must fail")
    } catch { XCTAssertEqual((error as? RPCFailure)?.code, "SYNC_CONFLICT") }
    let detail = try await client.credentialDetail(id: "website-login", generation: generation)
    XCTAssertEqual(detail.username, "alice")
    let note = try await client.readCredentialSecret(
      id: "website-login", type: "note", generation: generation)
    XCTAssertEqual(note, "synthetic-note")
    _ = try client.lock()
    do {
      _ = try await client.websiteRules(id: "website-login", generation: generation)
      XCTFail("Old generation must fail")
    } catch {
      guard case BridgeError.SessionRevoked = error else {
        return XCTFail("Expected revoked admission")
      }
    }
  }

  @MainActor
  func testSSHCreationExchangeEditAndDeleteThroughNativeBridge() async throws {
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    if !(try client.snapshot().masterConfigured) {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    try await client.unlock(password: "air-ssh-synthetic-" + UUID().uuidString)
    let generation = try client.snapshot().generation
    let created = try await client.generateSSH(
      PassmanagerSSHKeygenRequest(
        comment: "native-fixture", keyType: "ed25519", name: "Native key", sourceEntryID: nil),
      generation: generation)
    let exported = try await client.exportSSH(
      PassmanagerSSHExportRequest(
        format: "openssh_private", keyID: created.keyID, passphrase: "synthetic-export-passphrase"),
      generation: generation)
    let imported = try await client.importSSH(
      PassmanagerSSHImportRequest(
        name: "Imported key", passphrase: "synthetic-export-passphrase",
        privateKey: exported.content, sourceEntryID: nil), generation: generation)
    XCTAssertEqual(imported.fingerprint, created.fingerprint)
    XCTAssertNotEqual(imported.keyID, created.keyID)
    let page = try await client.sshPage(
      PassmanagerSSHPageRequest(
        keyType: nil, limit: 50, offset: 0, query: "Native key", revision: nil, sourceEntryID: nil),
      generation: generation)
    let row = try XCTUnwrap(page.keys.first)
    let edited = try await client.editSSH(
      PassmanagerSSHEditRequest(
        keyID: row.key.id, name: "Renamed native key", revision: row.revision, sourceEntryID: nil),
      generation: generation)
    XCTAssertEqual(edited.key.name, "Renamed native key")
    XCTAssertEqual(edited.key.fingerprint, created.fingerprint)
    let publicKey = try await client.exportSSH(
      PassmanagerSSHExportRequest(format: "openssh_public", keyID: imported.keyID, passphrase: nil),
      generation: generation)
    XCTAssertEqual(publicKey.content, created.publicKeyOpenssh)
    try await client.deleteSSH(id: created.keyID, generation: generation)
    try await client.deleteSSH(id: imported.keyID, generation: generation)
    let empty = try await client.sshPage(
      PassmanagerSSHPageRequest(
        keyType: nil, limit: 50, offset: 0, query: "", revision: nil, sourceEntryID: nil),
      generation: generation)
    XCTAssertTrue(empty.keys.isEmpty)
    _ = try client.lock()
    do {
      _ = try await client.exportSSH(
        PassmanagerSSHExportRequest(
          format: "openssh_private", keyID: imported.keyID, passphrase: nil), generation: generation
      )
      XCTFail("Old generation must not export")
    } catch {
      guard case BridgeError.SessionRevoked = error else {
        return XCTFail("Expected revoked admission")
      }
    }
  }

  @MainActor
  func testRealNativeRuntimeUsesItsOwnSandboxAndRevokesOnBackground() async throws {
    XCTAssertThrowsError(
      try AirRuntime(expectedFingerprint: BuildFingerprint.expected, storageRoot: "/untrusted")
    ) { error in
      guard case BridgeError.InvalidStorageRoot = error else {
        return XCTFail("Unexpected error: \(error)")
      }
    }
    let client = try await RuntimeClient.open()
    defer { _ = try? client.close() }
    let initial = try client.snapshot()
    XCTAssertEqual(initial.phase, .locked)
    do {
      _ = try await client.credentialPage(offset: 0, query: "", generation: initial.generation)
      XCTFail("Locked credentials must not be readable")
    } catch {
      guard case BridgeError.SessionRevoked = error else {
        return XCTFail("Expected revoked admission")
      }
    }
    if !initial.masterConfigured {
      try await client.setupAdministrator(password: "air-synthetic-administrator")
    }
    XCTAssertTrue(try client.snapshot().masterConfigured)
    XCTAssertEqual(try client.snapshot().phase, .locked)

    let vaultPassword = "air-synthetic-native-vault-" + UUID().uuidString
    try await client.unlock(password: vaultPassword)
    XCTAssertEqual(try client.snapshot().phase, .unlocked)
    let catalog = try await client.credentialPage(
      offset: 0, query: "", generation: try client.snapshot().generation)
    XCTAssertTrue(catalog.entries.isEmpty)
    XCTAssertNil(catalog.nextOffset)
    let generation = try client.snapshot().generation
    _ = try await client.saveTag(
      sourceKey: nil, label: "Initial", colorID: "blue", generation: generation)
    // The foreign executor may poll async work in a different order from Swift's calls.
    // Admission must happen before suspension without duplicating runtime/session owners.
    let reads = (0..<24).map { _ in
      Task { @MainActor in
        let page = try await client.credentialPage(offset: 0, query: "", generation: generation)
        return page.entries.count
      }
    }
    defer {
      for read in reads {
        read.cancel()
      }
    }
    for read in reads {
      let count = try await read.value
      XCTAssertEqual(count, 0)
    }
    let request = PassmanagerEntryCreateRequest(
      createdTs: nil, entryID: UUID().uuidString, entryType: "login", groupPath: "/Personal",
      iconRef: nil, otps: nil, paymentCard: nil,
      secrets: PassmanagerEntryCreateSecrets(
        cardCvv: nil, cardPan: nil, note: "synthetic note", password: "synthetic password"),
      tagKeys: ["initial"], tags: nil, title: "Синтетическая почта", updatedTs: nil, urls: nil,
      username: "alice")
    let created = try await client.createCredential(request, generation: generation)
    XCTAssertEqual(created.entryID, request.entryID)
    let assignedDetail = try await client.credentialDetail(
      id: request.entryID, generation: generation)
    XCTAssertEqual(assignedDetail.tagKeys, ["initial"])
    let assignedPage = try await client.credentialPage(
      offset: 0, query: "", tagKey: "initial", generation: generation)
    XCTAssertEqual(assignedPage.entries.map(\.id), [request.entryID])
    _ = try await client.updateCredential(
      PassmanagerEntryUpdateRequest(
        cardholderName: nil, entryID: request.entryID, expMonth: nil, expYear: nil,
        groupPath: nil, revision: assignedDetail.revision, tagKeys: [], title: nil, username: nil,
        websites: nil), generation: generation)
    let clearedDetail = try await client.credentialDetail(
      id: request.entryID, generation: generation)
    XCTAssertTrue(clearedDetail.tagKeys.isEmpty)
    try await client.deleteTag(key: "initial", generation: generation)
    let unusedTag = try await client.saveTag(
      sourceKey: nil, label: "Ｗｏｒｋ", colorID: "cyan", generation: generation)
    XCTAssertEqual(unusedTag.key, "work")
    let beforeTagRead = try client.snapshot().sequence
    let tagPage = try await client.tagPage(offset: 0, generation: generation)
    XCTAssertEqual(try client.snapshot().sequence, beforeTagRead)
    XCTAssertEqual(tagPage.tags.map(\.key), ["work"])
    XCTAssertEqual(tagPage.tags.first?.colorID, "cyan")
    let renamedTag = try await client.saveTag(
      sourceKey: "work", label: "Личное", colorID: "pink", generation: generation)
    XCTAssertEqual(renamedTag.key, "личное")
    let emptyTagScope = try await client.credentialPage(
      offset: 0, query: "", tagKey: renamedTag.key, generation: generation)
    XCTAssertTrue(emptyTagScope.entries.isEmpty)
    try await client.deleteTag(key: renamedTag.key, generation: generation)
    let emptyTags = try await client.tagPage(offset: 0, generation: generation)
    XCTAssertTrue(emptyTags.tags.isEmpty)
    let found = try await client.credentialPage(offset: 0, query: "почта", generation: generation)
    XCTAssertEqual(found.entries.map(\.id), [request.entryID])
    XCTAssertEqual(found.entries.first?.groupPath, "/Personal")
    do {
      _ = try await client.createCredential(request.with(tagKeys: []), generation: generation)
      XCTFail("Duplicate name must fail without creating another record")
    } catch { XCTAssertEqual((error as? RPCFailure)?.code, "NAME_EXIST") }
    let card = try PassmanagerEntryCreateRequest(
      #"{"entry_id":"synthetic-card","title":"Synthetic card","entry_type":"payment_card","payment_card":{"cardholder_name":"Synthetic User","exp_month":12,"exp_year":2030,"brand":"unknown"},"secrets":{"card_pan":"4111 1111 1111 1111","card_cvv":"123","note":"synthetic card note"}}"#
    )
    let cardCreated = try await client.createCredential(card, generation: generation)
    XCTAssertEqual(cardCreated.entryID, card.entryID)
    let cardPage = try await client.credentialPage(
      offset: 0, query: "", sort: "modified", descending: true, entryType: "payment_card",
      generation: generation)
    XCTAssertEqual(cardPage.entries.first?.entryType, "payment_card")
    XCTAssertEqual(cardPage.entries.map(\.id), [card.entryID])
    let invalidCard = card.with(
      entryID: "invalid-card", secrets: card.secrets.with(cardCvv: "x"), title: "Invalid card")
    do {
      _ = try await client.createCredential(invalidCard, generation: generation)
      XCTFail("Invalid card must fail atomically")
    } catch { XCTAssertEqual((error as? RPCFailure)?.code, "EMPTY_PAYLOAD") }
    let unchanged = try await client.credentialPage(offset: 0, query: "", generation: generation)
    XCTAssertEqual(unchanged.entries.count, 2)
    let detail = try await client.credentialDetail(id: request.entryID, generation: generation)
    XCTAssertEqual(detail.username, "alice")
    let patch = PassmanagerEntryUpdateRequest(
      cardholderName: nil, entryID: request.entryID,
      expMonth: nil, expYear: nil, groupPath: "/Work/Nested", revision: detail.revision,
      tagKeys: nil, title: "Updated native login", username: "updated-user",
      websites: ["https://example.org"])
    _ = try await client.updateCredential(patch, generation: generation)
    let updated = try await client.credentialDetail(id: request.entryID, generation: generation)
    XCTAssertEqual(updated.title, "Updated native login")
    XCTAssertEqual(updated.groupPath, "/Work/Nested")
    XCTAssertEqual(updated.websites, ["https://example.org"])
    do {
      _ = try await client.updateCredential(patch, generation: generation)
      XCTFail("Stale metadata must not overwrite a newer revision")
    } catch { XCTAssertEqual((error as? RPCFailure)?.code, "SYNC_CONFLICT") }
    let oldSecret = try await client.readCredentialSecret(
      id: request.entryID, type: "password", generation: generation)
    XCTAssertEqual(oldSecret, "synthetic password")
    try await client.saveCredentialSecret(
      id: request.entryID, type: "password", value: "changed secret", generation: generation)
    let newSecret = try await client.readCredentialSecret(
      id: request.entryID, type: "password", generation: generation)
    XCTAssertEqual(newSecret, "changed secret")
    let unchangedNote = try await client.readCredentialSecret(
      id: request.entryID, type: "note", generation: generation)
    XCTAssertEqual(unchangedNote, "synthetic note")
    try await client.ensureGroup(path: "/Destination/Nested", generation: generation)
    let groups = try await client.groupPage(
      parent: "/Destination", offset: 0, generation: generation)
    XCTAssertEqual(groups.groups.map(\.path), ["/Destination/Nested"])
    try await client.renameGroup(path: "/Work", name: "Renamed", generation: generation)
    let renamed = try await client.credentialDetail(id: request.entryID, generation: generation)
    XCTAssertEqual(renamed.groupPath, "/Renamed/Nested")
    let scoped = try await client.credentialPage(
      offset: 0, query: "", groupPath: "/Renamed", generation: generation)
    XCTAssertEqual(scoped.entries.map(\.id), [request.entryID])
    _ = try await client.updateCredential(
      PassmanagerEntryUpdateRequest(
        cardholderName: nil, entryID: request.entryID, expMonth: nil, expYear: nil,
        groupPath: "/Destination/Nested", revision: renamed.revision, tagKeys: nil, title: nil,
        username: nil,
        websites: nil), generation: generation)
    try await client.deleteGroup(path: "/Renamed", generation: generation)
    let retainedSecret = try await client.readCredentialSecret(
      id: request.entryID, type: "password", generation: generation)
    XCTAssertEqual(retainedSecret, "changed secret")
    try await client.deleteCredential(id: request.entryID, generation: generation)
    do {
      _ = try await client.credentialDetail(id: request.entryID, generation: generation)
      XCTFail("Deleted metadata must be missing")
    } catch { XCTAssertEqual((error as? RPCFailure)?.code, "NODE_NOT_FOUND") }
    do {
      _ = try await client.readCredentialSecret(
        id: request.entryID, type: "password", generation: generation)
      XCTFail("Deleted secret must be missing")
    } catch { XCTAssertEqual((error as? RPCFailure)?.code, "NODE_NOT_FOUND") }
    do {
      try await client.deleteCredential(id: request.entryID, generation: generation)
      XCTFail("Missing record must not be a successful second deletion")
    } catch { XCTAssertEqual((error as? RPCFailure)?.code, "NODE_NOT_FOUND") }
    let remaining = try await client.credentialPage(offset: 0, query: "", generation: generation)
    XCTAssertEqual(remaining.entries.map(\.id), [card.entryID])
    var attributes: CFTypeRef?
    let status = SecItemCopyMatching(
      [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: "com.chromvoid.storage-pepper",
        kSecAttrAccount: "primary:v1",
        kSecReturnAttributes: true,
        kSecMatchLimit: kSecMatchLimitOne,
      ] as CFDictionary, &attributes)
    XCTAssertEqual(status, errSecSuccess)
    let group = try XCTUnwrap(
      (attributes as? [String: Any])?[kSecAttrAccessGroup as String] as? String)
    let bundle = try XCTUnwrap(Bundle.main.bundleIdentifier)
    XCTAssertTrue(
      group.hasSuffix("." + bundle),
      "Storage pepper must stay in this test host’s private Keychain group")
    let covered = try client.deactivate()
    XCTAssertGreaterThan(covered.generation, initial.generation)
    do {
      _ = try await client.createCredential(request, generation: generation)
      XCTFail("Revoked generation must not write")
    } catch {
      guard case BridgeError.SessionRevoked = error else {
        return XCTFail("Expected revoked write admission")
      }
    }
    do {
      _ = try await client.readCredentialSecret(
        id: request.entryID, type: "password", generation: generation)
      XCTFail("Revoked secret read must fail")
    } catch {
      guard case BridgeError.SessionRevoked = error else {
        return XCTFail("Expected revoked secret admission")
      }
    }
    do {
      try await client.deleteCredential(id: card.entryID, generation: generation)
      XCTFail("Revoked deletion must fail")
    } catch {
      guard case BridgeError.SessionRevoked = error else {
        return XCTFail("Expected revoked delete admission")
      }
    }
    _ = try client.activate()
    while true {
      let snapshot = try client.snapshot()
      if !snapshot.cleanupPending { break }
      _ = try await client.events(after: snapshot.sequence)
    }
    XCTAssertEqual(try client.snapshot().phase, .locked)
    XCTAssertTrue(try client.snapshot().masterConfigured)
    try await client.unlock(password: vaultPassword)
    let reopenedGeneration = try client.snapshot().generation
    let reopened = try await client.credentialPage(
      offset: 0, query: "", sort: "name", generation: reopenedGeneration)
    XCTAssertEqual(reopened.entries.map(\.id), [card.entryID])
    let reopenedSecret = try await client.readCredentialSecret(
      id: card.entryID, type: "card_cvv", generation: reopenedGeneration)
    XCTAssertEqual(reopenedSecret, "123")

    let root = URL(fileURLWithPath: NSHomeDirectory())
      .appendingPathComponent("Library/Application Support/ChromVoidAir").path
    XCTAssertThrowsError(
      try AirRuntime(expectedFingerprint: BuildFingerprint.expected, storageRoot: root)
    ) { error in
      guard case BridgeError.RuntimeAlreadyExists = error else {
        return XCTFail("Unexpected error: \(error)")
      }
    }
  }
}
