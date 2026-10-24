import ChromVoidBridge
import Foundation
import Testing
import XCTest

@testable import AirPresentation

@MainActor
final class CredentialCreationModelTests: XCTestCase {
  func testLanguageChangesTranslateExistingValidationWithoutDiscardingDraft() throws {
    let store = CreationStore()
    let model = CredentialCreationModel(store: store, generation: 9) {}
    defer { model.revoke() }
    model.change(.username, to: "Name")
    model.save()
    let issue = try XCTUnwrap(model.errors[.title])
    XCTAssertEqual(AirCopy(locale: Locale(identifier: "ru")).text(issue), "Заполните это поле.")
    XCTAssertEqual(AirCopy(locale: Locale(identifier: "en")).text(issue), "This field is required.")
    XCTAssertEqual(model.value(.username), "Name")
    XCTAssertEqual(model.state, .editing)
    XCTAssertTrue(store.requests.isEmpty)
  }

  func testWebsiteDraftAppliesModesToAtomicCreationAndCancelKeepsParentClean() async throws {
    let store = CreationStore()
    let model = CredentialCreationModel(store: store, generation: 9) {}
    model.beginWebsites()
    let cancelled = try XCTUnwrap(model.websiteEditor)
    cancelled.add()
    model.endWebsites()
    XCTAssertFalse(model.isDirty)
    XCTAssertEqual(cancelled.state, .revoked)
    model.beginWebsites()
    let editor = try XCTUnwrap(model.websiteEditor)
    editor.add()
    let row = try XCTUnwrap(editor.rows.first)
    editor.change(row.id, value: "https://example.com/login", mode: "exact")
    await editor.save()?.value
    XCTAssertNil(model.websiteEditor)
    XCTAssertTrue(model.isDirty)
    model.change(.title, to: "Website login")
    model.save()
    await settle { store.pending != nil }
    let request = try JSONDecoder().decode(
      PassmanagerEntryCreateRequest.self, from: store.requests[0])
    let urls = try JSONDecoder().decode(
      [[String: String]].self, from: JSONEncoder().encode(request.urls))
    XCTAssertEqual(urls, [["value": "https://example.com/login", "match": "exact"]])
    store.finish(id: request.entryID)
    await settle { model.state == .saved }
    XCTAssertTrue(model.websites.isEmpty)
    model.revoke()
  }

  func testGroupChoiceCancelAndAtomicCreatePayload() async throws {
    let store = CreationStore()
    let model = CredentialCreationModel(store: store, generation: 9) {}
    defer { model.revoke() }
    model.beginGroups()
    let cancelled = try XCTUnwrap(model.groupBrowser)
    XCTAssertEqual(cancelled.current, "/")
    await cancelled.reload()?.value
    model.endGroups()
    XCTAssertEqual(cancelled.state, .revoked)
    XCTAssertEqual(model.value(.group), "")
    XCTAssertFalse(model.isDirty)

    model.beginGroups()
    let picker = try XCTUnwrap(model.groupBrowser)
    await picker.reload()?.value
    picker.choose("/Work")
    XCTAssertEqual(model.value(.group), "/Work")
    XCTAssertTrue(model.isDirty)
    XCTAssertNil(model.groupBrowser)
    XCTAssertEqual(picker.state, .revoked)
    model.beginGroups()
    let reopened = try XCTUnwrap(model.groupBrowser)
    XCTAssertEqual(reopened.current, "/Work")
    model.endGroups()
    model.change(.title, to: "Grouped login")
    model.save()
    await settle { store.pending != nil }
    let request = try JSONDecoder().decode(
      PassmanagerEntryCreateRequest.self, from: store.requests[0])
    XCTAssertEqual(request.groupPath, "/Work")
    XCTAssertEqual(store.generations, [9])
    XCTAssertTrue(store.groupGenerations.allSatisfy { $0 == 9 })
    store.finish(id: request.entryID)
    await settle { model.state == .saved }
    XCTAssertEqual(model.value(.group), "")
    XCTAssertNil(model.groupBrowser)
  }

  func testTagDraftApplyCancelAndAtomicCreatePayload() async throws {
    let store = CreationStore()
    let model = CredentialCreationModel(store: store, generation: 9) {}
    model.beginTags()
    let cancelled = try XCTUnwrap(model.tagBrowser)
    await cancelled.reload()?.value
    cancelled.choose(store.tag)
    model.endTags()
    XCTAssertFalse(model.isDirty)
    model.beginTags()
    let picker = try XCTUnwrap(model.tagBrowser)
    await picker.reload()?.value
    picker.choose(store.tag)
    picker.applySelection()
    XCTAssertEqual(model.selectedTags.map(\.key), ["work"])
    XCTAssertTrue(model.isDirty)
    XCTAssertEqual(picker.state, .revoked)
    model.change(.title, to: "Assigned")
    model.save()
    await settle { store.pending != nil }
    let request = try JSONDecoder().decode(
      PassmanagerEntryCreateRequest.self, from: store.requests[0])
    XCTAssertEqual(request.tagKeys, ["work"])
    XCTAssertNil(request.tags)
    store.finish(id: request.entryID)
    await settle { model.state == .saved }
    XCTAssertTrue(model.selectedTags.isEmpty)
    model.revoke()
  }

  func testRequiredValidationFocusAndAtomicCardPayload() async throws {
    let store = CreationStore()
    var saved = 0
    let model = CredentialCreationModel(store: store, generation: 9) { saved += 1 }
    defer { model.revoke() }
    model.save()
    XCTAssertEqual(model.focus, .title)
    XCTAssertNotNil(model.errors[.title])
    model.change(.title, to: "")  // Native focus can re-emit the unchanged value.
    XCTAssertNotNil(model.errors[.title])
    XCTAssertTrue(store.requests.isEmpty)
    model.selectKind(.paymentCard)
    model.change(.title, to: "Карта")
    model.change(.cardholder, to: "Synthetic User")
    model.change(.cardNumber, to: "4111 1111 1111 1111")
    model.change(.cardCode, to: "123")
    model.change(.month, to: "twelve")
    model.change(.year, to: "30")
    model.change(.note, to: "synthetic private note")
    model.change(.password, to: "hidden login draft")
    model.save()
    XCTAssertEqual(model.focus, .month)
    model.change(.month, to: "12")
    model.save()
    model.save()
    await settle { store.requests.count == 1 }
    let request = try JSONDecoder().decode(
      PassmanagerEntryCreateRequest.self, from: store.requests[0])
    XCTAssertEqual(store.generations, [9])
    XCTAssertEqual(request.title, "Карта")
    XCTAssertEqual(request.entryType, "payment_card")
    // The draft keeps digits only; the grouping is drawn, never stored.
    XCTAssertEqual(request.secrets.cardPan, "4111111111111111")
    XCTAssertEqual(request.secrets.note, "synthetic private note")
    XCTAssertNil(request.secrets.password)
    XCTAssertNil(request.urls)
    let card = try JSONDecoder().decode(
      PaymentCardMetadata.self, from: JSONEncoder().encode(request.paymentCard))
    XCTAssertEqual(card.brand, "visa")
    XCTAssertEqual(model.cardBrand, .visa)
    XCTAssertEqual(card.expMonth, 12)
    // The year is typed as the card prints it and stored in full.
    XCTAssertEqual(card.expYear, 2030)
    XCTAssertNil(card.last4)
    store.finish(id: request.entryID)
    await settle { saved == 1 }
    XCTAssertEqual(model.state, .saved)
    XCTAssertEqual(model.value(.cardNumber), "")
    XCTAssertEqual(model.value(.password), "")
  }

  func testConfirmedValidationFailureKeepsDraftForCorrection() async throws {
    let store = CreationStore()
    let model = CredentialCreationModel(store: store, generation: 4) {}
    defer { model.revoke() }
    model.change(.title, to: "Duplicate")
    model.change(.password, to: "synthetic secret")
    model.save()
    await settle { store.requests.count == 1 }
    store.fail(try rpcFailure("NAME_EXIST"))
    await settle { model.state == .editing }
    XCTAssertEqual(model.value(.password), "synthetic secret")
    XCTAssertEqual(model.focus, .title)
    XCTAssertNotNil(model.errors[.title])
    model.change(.title, to: "Corrected")
    model.save()
    await settle { store.requests.count == 2 }
    let request = try JSONDecoder().decode(
      PassmanagerEntryCreateRequest.self, from: store.requests[1])
    store.finish(id: request.entryID)
    await settle { model.state == .saved }
  }

  func testUncertainSaveDoesNotResubmitAndRevokePurgesDraft() async {
    let store = CreationStore()
    let model = CredentialCreationModel(store: store, generation: 4) {}
    model.change(.title, to: "Uncertain")
    model.change(.password, to: "synthetic secret")
    model.save()
    await settle { store.requests.count == 1 }
    store.fail(CredentialStoreError.invalidPage)
    await settle { model.state == .uncertain }
    XCTAssertNotNil(model.issue)
    model.save()
    XCTAssertEqual(store.requests.count, 1)
    model.requestDismiss()
    XCTAssertTrue(model.confirmingDiscard)
    model.cancelDiscard()
    XCTAssertFalse(model.confirmingDiscard)
    model.revoke()
    XCTAssertEqual(model.value(.title), "")
    XCTAssertEqual(model.value(.password), "")
    XCTAssertNil(model.issue)
  }

  func testPreAdmissionSizeFailureAllowsCorrectionAndRevokedReplyPurges() async {
    let store = CreationStore()
    let model = CredentialCreationModel(store: store, generation: 4) {}
    model.change(.title, to: "Synthetic size failure")
    model.change(.password, to: "synthetic secret")
    model.save()
    await settle { store.requests.count == 1 }
    store.fail(BridgeError.PayloadTooLarge)
    await settle { model.state == .editing }
    XCTAssertNotNil(model.issue)
    XCTAssertEqual(model.value(.password), "synthetic secret")
    model.save()
    await settle { store.requests.count == 2 }
    store.fail(BridgeError.SessionRevoked)
    await settle { model.state == .revoked }
    XCTAssertEqual(model.value(.password), "")
  }

  func testLateSuccessfulSaveCannotRestoreRevokedForm() async throws {
    let store = CreationStore()
    var saved = false
    let model = CredentialCreationModel(store: store, generation: 2) { saved = true }
    model.change(.title, to: "Late result")
    model.change(.password, to: "synthetic secret")
    model.save()
    await settle { store.requests.count == 1 }
    let request = try JSONDecoder().decode(
      PassmanagerEntryCreateRequest.self, from: store.requests[0])
    model.revoke()
    store.finish(id: request.entryID)
    for _ in 0..<20 { await Task.yield() }
    XCTAssertFalse(saved)
    XCTAssertEqual(model.state, .revoked)
    XCTAssertEqual(model.value(.password), "")
  }

  private func rpcFailure(_ code: String) throws -> Error {
    let bytes = try JSONSerialization.data(withJSONObject: ["ok": false, "code": code])
    do {
      _ = try JSONDecoder().decode(RPCResult<PassmanagerEntrySaveResponse>.self, from: bytes)
      XCTFail("Expected Core failure")
      return CredentialStoreError.invalidPage
    } catch { return error }
  }

  private func settle(_ condition: () -> Bool) async {
    for _ in 0..<2000 {
      if condition() { return }
      await Task.yield()
    }
    XCTFail("Expected creation transition")
  }
}

@MainActor
private final class CreationStore: CredentialStore {
  func validateWebsites(_ rules: [CredentialWebsiteRule], generation: UInt64) async throws
    -> PassmanagerWebsiteResult
  {
    PassmanagerWebsiteResult(errors: [], revision: nil, rules: rules)
  }
  var groupGenerations: [UInt64] = []
  func groupPage(parent: String, offset: UInt32, generation: UInt64) async throws
    -> PassmanagerGroupPageResponse
  {
    groupGenerations.append(generation)
    return PassmanagerGroupPageResponse(
      groups: parent == "/" ? [PassmanagerGroupSummary(entryCount: 0, path: "/Work")] : [],
      nextOffset: nil, parent: parent)
  }
  let tag = CredentialTagSummary(colorID: "blue", count: 0, key: "work", label: "Work")
  func tagPage(offset: UInt32, generation: UInt64) async throws -> PassmanagerTagPageResponse {
    return PassmanagerTagPageResponse(nextOffset: nil, tags: [tag])
  }
  func saveTag(sourceKey: String?, label: String, colorID: String, generation: UInt64) async throws
    -> CredentialTagSummary
  { throw CredentialStoreError.invalidPage }
  func deleteTag(key: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }

  func deleteCredential(id: String, generation: UInt64) async throws {
    throw CredentialStoreError.invalidPage
  }

  func credentialDetail(id: String, generation: UInt64) async throws -> CredentialDetail {
    throw CredentialStoreError.invalidPage
  }
  func updateCredential(_ request: PassmanagerEntryUpdateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  { throw CredentialStoreError.invalidPage }
  func readCredentialSecret(id: String, type: String, generation: UInt64) async throws -> String {
    throw CredentialStoreError.invalidPage
  }
  func saveCredentialSecret(id: String, type: String, value: String, generation: UInt64)
    async throws
  { throw CredentialStoreError.invalidPage }

  var requests: [Data] = []
  var generations: [UInt64] = []
  var pending: CheckedContinuation<String, Error>?
  func createCredential(_ request: PassmanagerEntryCreateRequest, generation: UInt64) async throws
    -> PassmanagerEntrySaveResponse
  {
    requests.append(try JSONEncoder().encode(request))
    generations.append(generation)
    let id: String = try await withCheckedThrowingContinuation { pending = $0 }
    return PassmanagerEntrySaveResponse(entryID: id)
  }
  func credentialPage(
    _ request: PassmanagerEntryPageRequest, generation: UInt64
  )
    async throws
    -> PassmanagerEntryPageResponse
  {
    PassmanagerEntryPageResponse(entries: [], nextOffset: nil, totalCount: nil)
  }
  func finish(id: String) {
    pending?.resume(returning: id)
    pending = nil
  }
  func fail(_ error: Error) {
    pending?.resume(throwing: error)
    pending = nil
  }
}

@Suite @MainActor
struct CredentialCreationGroupTests {
  @Test(arguments: ["", "/"])
  func rootChoiceKeepsDraftCleanAndRevocationClearsBrowser(initialPath: String) async throws {
    let model = CredentialCreationModel(
      store: CreationStore(), generation: 1, groupPath: initialPath
    ) {}
    model.beginGroups()
    let root = try #require(model.groupBrowser)
    await root.reload()?.value
    root.choose("/")
    #expect(model.value(.group).isEmpty)
    #expect(!model.isDirty)
    model.change(.group, to: "/Work")
    model.beginGroups()
    let browser = try #require(model.groupBrowser)
    await browser.reload()?.value
    model.revoke()
    browser.choose("/Work")
    #expect(browser.state == .revoked)
    #expect(model.groupBrowser == nil)
    #expect(model.value(.group).isEmpty)
    #expect(!model.isDirty)
  }

  @Test func selectedGroupIsAnUneditedDefaultAndRevocationClearsIt() {
    let model = CredentialCreationModel(
      store: CreationStore(), generation: 1, groupPath: "/Work/Nested"
    ) {}
    #expect(model.value(.group) == "/Work/Nested")
    #expect(!model.isDirty)
    model.change(.group, to: "/Other")
    #expect(model.isDirty)
    model.revoke()
    #expect(model.value(.group).isEmpty)
    #expect(!model.isDirty)
  }
}

extension CredentialCreationModelTests {
  func testCardNetworksAreRecognisedFromLeadingDigits() {
    let cases: [(String, PaymentCardBrand?)] = [
      ("4111 1111 1111 1111", .visa), ("5555555555554444", .mastercard),
      ("2223000048400011", .mastercard), ("2200000000000004", .mir), ("2204123412341234", .mir),
      ("378282246310005", .amex), ("6200000000000005", .unionpay), ("3530111333300000", .jcb),
      ("6011111111111117", .discover), ("30569309025904", .dinersclub),
      ("6759649826438453", .maestro), ("9", nil), ("1234567812345678", nil),
    ]
    for (number, expected) in cases {
      XCTAssertEqual(PaymentCardBrand.detect(number), expected, number)
    }
    XCTAssertEqual(PaymentCardBrand(wire: "MIR"), .mir)
    // Core reads the names imports carry.
    XCTAssertEqual(PaymentCardBrand(wire: "American Express"), .amex)
    XCTAssertEqual(PaymentCardBrand(wire: "Diners Club"), .dinersclub)
    XCTAssertNil(PaymentCardBrand(wire: "unknown"))
    XCTAssertEqual(PaymentCardText.grouped("4111111111111111"), "4111 1111 1111 1111")
    XCTAssertEqual(PaymentCardText.grouped("378282246310005"), "3782 822463 10005")
    XCTAssertEqual(PaymentCardText.grouped("30569309025904"), "3056 930902 5904")
    // Fifteen digits of a sixteen-digit number stay in fours while it is typed.
    XCTAssertEqual(PaymentCardText.grouped("411111111111111"), "4111 1111 1111 111")
    XCTAssertEqual(
      PaymentCardText.masked(last4: "0005", format: PaymentCardRules.format(brand: "amex")),
      "•••• •••••• •0005")
    XCTAssertEqual(
      PaymentCardText.masked(last4: nil, format: PaymentCardRules.format(brand: "")),
      "•••• •••• •••• ••••")
  }

  func testCardFieldsKeepWhatTheCardPrintsAndHandFocusOn() {
    let model = CredentialCreationModel(store: CreationStore(), generation: 1) {}
    defer { model.revoke() }
    model.selectKind(.paymentCard)
    model.change(.cardNumber, to: "4111-1111 1111 111a")
    XCTAssertEqual(model.value(.cardNumber), "411111111111111")
    XCTAssertNil(model.focus, "fifteen Visa digits are not yet whole")
    model.change(.cardNumber, to: "4111111111111111")
    XCTAssertEqual(model.focus, .month)
    model.change(.month, to: "5")
    XCTAssertEqual(model.value(.month), "05")
    XCTAssertEqual(model.focus, .year)
    let revision = model.focusRevision
    model.change(.year, to: "20")
    XCTAssertEqual(model.focusRevision, revision, "`20` may begin a four-digit year")
    model.change(.year, to: "20351")
    XCTAssertEqual(model.value(.year), "2035")
    XCTAssertEqual(model.focus, .cardCode)
    let refused = model.cardInputRevision
    model.change(.cardCode, to: "1234")
    XCTAssertEqual(model.value(.cardCode), "123", "a Visa code has three digits")
    XCTAssertGreaterThan(model.cardInputRevision, refused, "the refused digit is drawn away")
    XCTAssertEqual(model.focus, .cardholder, "the empty holder is next")
    model.change(.cardholder, to: "ALICE")
    model.change(.cardNumber, to: "")
    model.change(.cardNumber, to: "378282246310005")
    XCTAssertEqual(model.focus, .month, "American Express is whole at fifteen")
    model.change(.cardCode, to: "1234")
    XCTAssertEqual(model.value(.cardCode), "1234")
    XCTAssertNil(model.focus, "a filled card ends the typing")
  }

  func testCardNeedsNoNameAndShowsTheOneCoreWillGive() async throws {
    let store = CreationStore()
    let model = CredentialCreationModel(store: store, generation: 1) {}
    defer { model.revoke() }
    model.selectKind(.paymentCard)
    XCTAssertNil(model.cardTitleHint, "no number, no name to suggest")
    model.change(.cardholder, to: "ALICE")
    model.change(.cardNumber, to: "4111111111111111")
    model.change(.month, to: "03")
    model.change(.year, to: "35")
    XCTAssertEqual(model.cardTitleHint, "Visa •••• 1111")
    model.save()
    XCTAssertTrue(model.errors.isEmpty)
    await settle { store.requests.count == 1 }
    let request = try JSONDecoder().decode(
      PassmanagerEntryCreateRequest.self, from: store.requests[0])
    XCTAssertEqual(request.title, "", "a blank name leaves the naming to Core")
  }

  func testShortNumberIsRefusedBeforeCoreAndDoubtfulOneOnlyWarns() async throws {
    let store = CreationStore()
    let model = CredentialCreationModel(store: store, generation: 1) {}
    defer { model.revoke() }
    model.selectKind(.paymentCard)
    model.change(.title, to: "Card")
    model.change(.cardholder, to: "ALICE")
    model.change(.month, to: "03")
    model.change(.year, to: "35")
    model.change(.cardNumber, to: "41111111111")
    model.save()
    XCTAssertEqual(model.errors[.cardNumber], "Enter the whole card number.")
    XCTAssertEqual(model.focus, .cardNumber)
    XCTAssertTrue(store.requests.isEmpty)
    model.numberFocusChanged(true)
    model.change(.cardNumber, to: "4111111111111112")
    XCTAssertNil(model.numberWarning, "no doubt while the number is typed")
    model.numberFocusChanged(false)
    XCTAssertEqual(
      model.numberWarning,
      "This number does not pass the card check. Check the digits before saving.")
    model.save()
    await settle { store.requests.count == 1 }
  }
}
