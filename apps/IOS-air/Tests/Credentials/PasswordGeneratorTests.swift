import AirPresentation
import ChromVoidBridge
import Foundation
import Testing

@Suite @MainActor
struct PasswordGeneratorTests {
  private static let login = CredentialDetail(
    entryType: "login", groupPath: "/", id: "entry", paymentCard: nil, revision: "revision-one",
    tagKeys: [], tags: [], title: "Login", username: "alice", websites: [],
    websitesEditable: false)
  @Test func settingsAndUseRequireAnExplicitCurrentCandidate() async throws {
    let store = GeneratorStore()
    var applied: [String] = []
    let model = PasswordGeneratorModel(store: store, generation: 9) { applied.append($0) }
    model.use()
    #expect(model.issue != nil && applied.isEmpty)
    model.change {
      $0.lowercase = false
      $0.uppercase = false
      $0.digits = false
    }
    #expect(model.generate() == nil && store.requests.isEmpty)
    model.change {
      $0.symbols = true
      $0.length = 32
    }
    await model.generate()?.value
    let request = try #require(store.requests.first)
    #expect(
      request.length == 32 && request.symbols && !request.lowercase && !request.uppercase
        && !request.digits)
    #expect(store.generations == [9] && store.writes == 0)
    model.toggleVisibility()
    #expect(model.displayValue == "generated-candidate")
    model.change { $0.length = 33 }
    #expect(model.password == nil && !model.revealed)
    model.use()
    #expect(applied.isEmpty)
    await model.generate()?.value
    model.use()
    model.use()
    #expect(applied == ["generated-candidate"] && model.password == nil && model.state == .revoked)
    #expect(store.writes == 0)
  }

  @Test func changedSettingsAndRevocationRejectLateResults() async {
    let store = GeneratorStore()
    store.delayed = true
    var applied = 0
    let model = PasswordGeneratorModel(store: store, generation: 9) { _ in applied += 1 }
    let old = model.generate()
    await store.waitForRead()
    #expect(model.generate() == nil)
    model.change { $0.length = 24 }
    store.finish("obsolete")
    await old?.value
    #expect(model.password == nil && model.state == .ready)
    let cancelled = model.generate()
    await store.waitForRead()
    model.revoke()
    store.finish("late")
    await cancelled?.value
    model.use()
    #expect(model.state == .revoked && model.password == nil && applied == 0)
  }

  @Test func generatorOnlyChangesAuthorizedParentDraftsUntilSave() async throws {
    let store = GeneratorStore()
    let creation = CredentialCreationModel(store: store, generation: 9) {}
    creation.change(.password, to: "previous")
    creation.beginGenerator()
    let cancelled = try #require(creation.generator)
    await cancelled.generate()?.value
    creation.endGenerator()
    #expect(creation.value(.password) == "previous" && cancelled.password == nil)
    creation.beginGenerator()
    let chosen = try #require(creation.generator)
    await chosen.generate()?.value
    chosen.use()
    #expect(creation.value(.password) == "generated-candidate" && creation.generator == nil)
    #expect(creation.isDirty && store.writes == 0)
    creation.beginGenerator()
    let changedKind = try #require(creation.generator)
    creation.selectKind(.paymentCard)
    #expect(changedKind.state == .revoked && creation.generator == nil)
    creation.beginGenerator()
    #expect(creation.generator == nil)
    creation.revoke()

    let editor = CredentialEditorModel(
      detail: Self.login, secrets: ["password": "previous"], store: store, generation: 9
    ) {}
    editor.beginGenerator()
    let candidate = try #require(editor.generator)
    await candidate.generate()?.value
    candidate.use()
    #expect(editor.value(.password) == "generated-candidate" && editor.isDirty && !editor.revealed)
    #expect(store.writes == 0)
    editor.revoke()
    #expect(editor.value(.password).isEmpty)
    // A form opened without the password has nothing to generate into.
    let note = CredentialEditorModel(
      detail: Self.login, secrets: ["note": "private"], store: store, generation: 9
    ) {}
    note.beginGenerator()
    #expect(note.generator == nil)
    note.revoke()
  }

  @Test func generationFailureCanRetryButRevokedSessionCannot() async {
    let store = GeneratorStore()
    store.failure = CredentialStoreError.invalidPage
    let model = PasswordGeneratorModel(store: store, generation: 9) { _ in }
    await model.generate()?.value
    #expect(model.state == .ready && model.issue != nil && model.password == nil)
    store.failure = nil
    await model.generate()?.value
    #expect(model.password == "generated-candidate" && model.issue == nil)
    store.failure = BridgeError.SessionRevoked
    await model.generate()?.value
    #expect(model.state == .revoked && model.password == nil && model.issue != nil)
    #expect(model.generate() == nil && store.requests.count == 3)
  }

  @Test func parentLockPurgesGeneratorAndLateResult() async throws {
    let store = GeneratorStore()
    store.delayed = true
    let editor = CredentialEditorModel(
      detail: Self.login, secrets: ["password": "previous"], store: store, generation: 9
    ) {}
    editor.beginGenerator()
    let child = try #require(editor.generator)
    let task = child.generate()
    await store.waitForRead()
    editor.revoke()
    store.finish("late")
    await task?.value
    child.use()
    #expect(editor.state == .revoked && editor.generator == nil && editor.value(.password).isEmpty)
    #expect(child.password == nil && child.state == .revoked && store.writes == 0)
  }
}

@MainActor private final class GeneratorStore: CredentialStore {
  var requests: [PassmanagerPasswordGenerateRequest] = []
  var generations: [UInt64] = []
  var writes = 0
  var delayed = false
  var failure: (any Error)?
  var pending: CheckedContinuation<String, Error>?
  private var started: CheckedContinuation<Void, Never>?
  func waitForRead() async {
    if pending != nil { return }
    await withCheckedContinuation { started = $0 }
  }
  func finish(_ value: String) {
    pending?.resume(returning: value)
    pending = nil
  }
  func generatePassword(_ request: PassmanagerPasswordGenerateRequest, generation: UInt64)
    async throws -> String
  {
    requests.append(request)
    generations.append(generation)
    if let failure { throw failure }
    if !delayed { return "generated-candidate" }
    return try await withCheckedThrowingContinuation {
      pending = $0
      started?.resume()
      started = nil
    }
  }
  func deleteCredential(id: String, generation: UInt64) async throws {
    writes += 1
    throw CredentialStoreError.invalidPage
  }
  func credentialDetail(id: String, generation: UInt64) async throws -> CredentialDetail {
    throw CredentialStoreError.invalidPage
  }
  func updateCredential(_ request: PassmanagerEntryUpdateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  {
    writes += 1
    throw CredentialStoreError.invalidPage
  }
  func readCredentialSecret(id: String, type: String, generation: UInt64) async throws -> String {
    throw CredentialStoreError.invalidPage
  }
  func saveCredentialSecret(id: String, type: String, value: String, generation: UInt64)
    async throws
  {
    writes += 1
    throw CredentialStoreError.invalidPage
  }
  func createCredential(_ request: PassmanagerEntryCreateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  {
    writes += 1
    throw CredentialStoreError.invalidPage
  }
  func credentialPage(
    _ request: PassmanagerEntryPageRequest, generation: UInt64
  ) async throws -> PassmanagerEntryPageResponse { throw CredentialStoreError.invalidPage }
  func tagPage(offset: UInt32, generation: UInt64) async throws -> PassmanagerTagPageResponse {
    throw CredentialStoreError.invalidPage
  }
  func saveTag(sourceKey: String?, label: String, colorID: String, generation: UInt64) async throws
    -> CredentialTagSummary
  {
    writes += 1
    throw CredentialStoreError.invalidPage
  }
  func deleteTag(key: String, generation: UInt64) async throws {
    writes += 1
    throw CredentialStoreError.invalidPage
  }
}
