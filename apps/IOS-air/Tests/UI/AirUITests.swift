import XCTest

final class AirUITests: XCTestCase {
  @MainActor
  func testImageGallerySwipesZoomsAndReturnsToFiles() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let tab = app.tabBars.buttons["Files"]
    if tab.exists { tab.tap() } else { tap(app.buttons["Files"], in: app) }
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["importFiles"], in: app)
    // The photo picker is a system sheet; only its presence and dismissal are checked here.
    tap(app.buttons["chooseImportPhotos"], in: app)
    let cancelPicker = app.buttons["Cancel"].firstMatch
    XCTAssertTrue(cancelPicker.waitForExistence(timeout: 15))
    attach(app, name: "Native photo library picker")
    cancelPicker.tap()
    tap(app.buttons["chooseImportFiles"], in: app)
    let browse = app.buttons["Browse"].firstMatch
    if browse.waitForExistence(timeout: 3) { browse.tap() }
    let phone = app.staticTexts["On My iPhone"].firstMatch
    let location = phone.exists ? phone : app.staticTexts["On My iPad"].firstMatch
    XCTAssertTrue(location.waitForExistence(timeout: 10))
    location.tap()
    let source = app.staticTexts["Air UI Tests"].firstMatch
    XCTAssertTrue(source.waitForExistence(timeout: 10))
    source.tap()
    for name in ["Air Export Fixture", "Air Gallery Second"] {
      let file = app.cells.containing(.staticText, identifier: name).firstMatch
      XCTAssertTrue(file.waitForExistence(timeout: 10))
      file.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).tap()
    }
    tap(app.buttons["Open"].firstMatch, in: app)
    XCTAssertTrue(
      app.descendants(matching: .any).matching(identifier: "fileImportFinished").firstMatch
        .waitForExistence(timeout: 15))
    tap(app.buttons["closeFileImport"], in: app)
    let row = app.buttons["fileRow-Air Export Fixture.png"]
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    tap(row, in: app)
    let first = app.images.matching(
      NSPredicate(
        format: "identifier == %@ AND label == %@", "imagePreviewContent", "Air Export Fixture.png")
    ).firstMatch
    XCTAssertTrue(first.waitForExistence(timeout: 10))
    let fitWidth = first.frame.width
    first.doubleTap()
    let enlarged = XCTNSPredicateExpectation(
      predicate: NSPredicate { _, _ in first.frame.width > fitWidth * 1.5 }, object: first)
    wait(for: [enlarged], timeout: 5)
    attach(app, name: "Native gallery double-tap zoom")
    first.swipeLeft()
    XCTAssertTrue(app.navigationBars["Air Export Fixture.png"].exists)
    first.doubleTap()
    let fitted = XCTNSPredicateExpectation(
      predicate: NSPredicate { _, _ in abs(first.frame.width - fitWidth) < 2 }, object: first)
    wait(for: [fitted], timeout: 5)
    first.pinch(withScale: 1.8, velocity: 1)
    let pinched = XCTNSPredicateExpectation(
      predicate: NSPredicate { _, _ in first.frame.width > fitWidth * 1.2 }, object: first)
    wait(for: [pinched], timeout: 5)
    first.doubleTap()
    let reset = XCTNSPredicateExpectation(
      predicate: NSPredicate { _, _ in abs(first.frame.width - fitWidth) < 2 }, object: first)
    wait(for: [reset], timeout: 5)
    first.swipeLeft()
    XCTAssertTrue(app.navigationBars["Air Gallery Second.png"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["nextImage"].isEnabled)
    attach(app, name: "Native gallery second image")
    tap(app.buttons["previousImage"], in: app)
    XCTAssertTrue(app.navigationBars["Air Export Fixture.png"].waitForExistence(timeout: 5))
    tap(app.buttons["nextImage"], in: app)
    XCTAssertTrue(app.navigationBars["Air Gallery Second.png"].waitForExistence(timeout: 5))
    tap(app.buttons["closeImagePreview"], in: app)
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    tap(row, in: app)
    XCTAssertTrue(first.waitForExistence(timeout: 10))
    tap(app.buttons["imageInfo"], in: app)
    XCTAssertTrue(app.staticTexts["imageDimensions"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["imageDimensions"].label.hasSuffix("128 × 96"))
    attach(app, name: "Native image information")
    tap(app.buttons["closeImageInfo"], in: app)
    XCTAssertFalse(app.buttons["lockImagePreview"].exists)
    tap(app.buttons["closeImagePreview"], in: app)
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
    XCTAssertFalse(app.images["imagePreviewContent"].exists)
  }

  @MainActor
  func testPhotoLibraryImportKeepsCameraLocation() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let tab = app.tabBars.buttons["Files"]
    if tab.exists { tab.tap() } else { tap(app.buttons["Files"], in: app) }
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["importFiles"], in: app)
    tap(app.buttons["chooseImportPhotos"], in: app)
    // The system picker is out of process but shares the hierarchy: scope every query to it.
    let picker = app.navigationBars["Photos"]
    XCTAssertTrue(picker.waitForExistence(timeout: 30))
    let grid = app.otherElements["photos_sectioned_layout"]
    XCTAssertTrue(grid.waitForExistence(timeout: 30))
    var cell = grid.images.firstMatch
    if !cell.waitForExistence(timeout: 10) {
      cell = grid.descendants(matching: .any).element(boundBy: 1)
    }
    attach(app, name: "Native photo library grid")
    // Picker cells sit under a dimming overlay and are not hittable; tap their centre instead.
    // Remote picker cells all report the first cell's frame, so tap the grid position instead:
    // three 133 pt columns, rows from y = 312 on this simulator.
    let index = grid.images.allElementsBoundByIndex.firstIndex { $0.label.contains("14:05") } ?? 0
    let origin = app.coordinate(withNormalizedOffset: .zero)
    origin.withOffset(
      CGVector(dx: 66 + CGFloat(index % 3) * 134, dy: 312 + 66 + CGFloat(index / 3) * 134)
    ).tap()
    attach(app, name: "Native photo library selection")
    let done = picker.buttons["Done"]
    let selectable = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "isEnabled == true"), object: done)
    wait(for: [selectable], timeout: 10)
    done.tap()
    // PhotoKit asks for library access once; allow it so the original resource is read.
    let grant = NSPredicate(
      format: "label CONTAINS[c] 'Full Access' OR label CONTAINS[c] 'полный доступ'")
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    for host in [springboard, app] {
      let allow = host.buttons.matching(grant).firstMatch
      if allow.waitForExistence(timeout: 8) {
        allow.tap()
        break
      }
    }
    let finished = app.descendants(matching: .any).matching(identifier: "fileImportFinished")
      .firstMatch
    XCTAssertTrue(finished.waitForExistence(timeout: 60))
    XCTAssertEqual(app.staticTexts["fileImportCount"].label, "1 / 1")
    attach(app, name: "Native photo library import result")
    tap(app.buttons["closeFileImport"], in: app)
    let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'fileRow-'"))
      .matching(
        NSPredicate(
          format:
            "label CONTAINS[c] '.jpg' OR label CONTAINS[c] '.jpeg' OR label CONTAINS[c] '.png' OR label CONTAINS[c] '.heic'"
        )
      )
      .firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    tap(row, in: app)
    XCTAssertTrue(app.buttons["imageInfo"].waitForExistence(timeout: 15))
    tap(app.buttons["imageInfo"], in: app)
    XCTAssertTrue(app.staticTexts["imageDimensions"].waitForExistence(timeout: 10))
    attach(app, name: "Native photo library import information")
    XCTAssertTrue(app.staticTexts["imageDimensions"].label.hasSuffix("1200 × 900"))
    XCTAssertTrue(app.staticTexts["credentialDetailTitle"].exists == false)
    XCTAssertTrue(app.staticTexts["Taken"].exists)
    // With library access the original resource is read, so the camera's GPS survives import.
    let coordinates = app.staticTexts["imageCoordinates"]
    XCTAssertTrue(coordinates.waitForExistence(timeout: 5), "GPS missing after PhotoKit import")
    XCTAssertTrue(coordinates.label.hasSuffix("55.75580 N, 37.61730 E"), coordinates.label)
    tap(app.buttons["closeImageInfo"], in: app)
    tap(app.buttons["closeImagePreview"], in: app)
  }

  @MainActor
  func testImagePreviewFromFilesAndMarkdownRetainsDraftAndLocks() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let tab = app.tabBars.buttons["Files"]
    if tab.exists { tab.tap() } else { tap(app.buttons["Files"], in: app) }
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["importFiles"], in: app)
    tap(app.buttons["chooseImportFiles"], in: app)
    let browse = app.buttons["Browse"].firstMatch
    if browse.waitForExistence(timeout: 3) { browse.tap() }
    let phone = app.staticTexts["On My iPhone"].firstMatch
    let location = phone.exists ? phone : app.staticTexts["On My iPad"].firstMatch
    XCTAssertTrue(location.waitForExistence(timeout: 10))
    location.tap()
    let source = app.staticTexts["Air UI Tests"].firstMatch
    XCTAssertTrue(source.waitForExistence(timeout: 10))
    source.tap()
    let file = app.cells.containing(.staticText, identifier: "Air Export Fixture").firstMatch
    XCTAssertTrue(file.waitForExistence(timeout: 10))
    file.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).tap()
    tap(app.buttons["Open"].firstMatch, in: app)
    XCTAssertTrue(
      app.descendants(matching: .any).matching(identifier: "fileImportFinished").firstMatch
        .waitForExistence(timeout: 15))
    tap(app.buttons["closeFileImport"], in: app)
    let row = app.buttons["fileRow-Air Export Fixture.png"]
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    tap(row, in: app)
    let image = app.images["imagePreviewContent"]
    XCTAssertTrue(image.waitForExistence(timeout: 10))
    let imageAspect = XCTNSPredicateExpectation(
      predicate: NSPredicate { _, _ in
        image.frame.height > 0 && abs(image.frame.width / image.frame.height - 4.0 / 3.0) < 0.02
      }, object: image)
    wait(for: [imageAspect], timeout: 5)
    attach(app, name: "Native image preview from Rust file reader")
    tap(app.buttons["closeImagePreview"], in: app)
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newNote"], in: app)
    let name = app.textFields["noteName"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Illustrated note")
    app.textViews["noteText"].tap()
    app.textViews["noteText"].typeText(
      "# Image reference\n\n- [ ] Keep this draft\n\n![Sample](</Air Export Fixture.png>)")
    tap(app.buttons["saveNote"], in: app)
    tap(app.buttons["fileRow-Illustrated note.md"], in: app)
    XCTAssertTrue(app.buttons["Incomplete task"].waitForExistence(timeout: 10))
    tap(app.buttons["Incomplete task"], in: app)
    XCTAssertTrue(app.buttons["Completed task"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Sample"].waitForExistence(timeout: 10))
    attach(app, name: "Inline Markdown image beside retained draft")
    tap(app.buttons["Sample"], in: app)
    XCTAssertTrue(image.waitForExistence(timeout: 10))
    let attachmentAspect = XCTNSPredicateExpectation(
      predicate: NSPredicate { _, _ in
        image.frame.height > 0 && abs(image.frame.width / image.frame.height - 4.0 / 3.0) < 0.02
      }, object: image)
    wait(for: [attachmentAspect], timeout: 5)
    attach(app, name: "Native image attachment above retained Markdown draft")
    tap(app.buttons["closeImagePreview"], in: app)
    XCTAssertTrue(app.buttons["Completed task"].waitForExistence(timeout: 5))
    tap(app.buttons["closeDocument"], in: app)
    XCTAssertTrue(app.alerts["Discard unsaved changes?"].waitForExistence(timeout: 5))
    tap(app.alerts.buttons["Keep editing"], in: app)
    tap(app.buttons["Sample"], in: app)
    XCTAssertTrue(image.waitForExistence(timeout: 10))
    tap(app.buttons["closeImagePreview"], in: app)
    tap(app.buttons["lockDocument"], in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
    XCTAssertFalse(image.exists)
    XCTAssertFalse(app.buttons["Completed task"].exists)
  }

  @MainActor
  func testDocumentEditorSaveDiscardReopenAndLock() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let tab = app.tabBars.buttons["Files"]
    if tab.exists { tab.tap() } else { tap(app.buttons["Files"], in: app) }
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newNote"], in: app)
    let name = app.textFields["noteName"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Journal")
    let initial = app.textViews["noteText"]
    initial.tap()
    initial.typeText("# Journal\n- [ ] Read the plan")
    tap(app.buttons["saveNote"], in: app)
    let row = app.buttons["fileRow-Journal.md"]
    XCTAssertTrue(row.waitForExistence(timeout: 15))
    tap(row, in: app)
    tap(app.segmentedControls.buttons["Source"], in: app)
    let editor = app.textViews["documentText"]
    XCTAssertTrue(editor.waitForExistence(timeout: 10))
    XCTAssertEqual(editor.value as? String, "# Journal\n- [ ] Read the plan")
    editor.tap()
    editor.typeText("\nSaved from iOS")
    let editedText = editor.value as? String
    XCTAssertTrue(editedText?.contains("# Journal") == true)
    XCTAssertTrue(editedText?.contains("Saved from iOS") == true)
    attach(app, name: "Native document draft at ordinary font size")
    tap(app.buttons["saveDocument"], in: app)
    XCTAssertTrue(
      app.otherElements["documentSaved"].exists
        || app.staticTexts["documentSaved"].waitForExistence(timeout: 10))
    tap(app.buttons["closeDocument"], in: app)
    tap(row, in: app)
    tap(app.segmentedControls.buttons["Source"], in: app)
    XCTAssertTrue(editor.waitForExistence(timeout: 10))
    XCTAssertEqual(editor.value as? String, editedText)
    editor.tap()
    editor.typeText("\nDiscard this")
    tap(app.buttons["closeDocument"], in: app)
    XCTAssertTrue(app.alerts["Discard unsaved changes?"].waitForExistence(timeout: 5))
    attach(app, name: "Native document discard confirmation")
    tap(app.alerts.buttons["Keep editing"], in: app)
    XCTAssertTrue((editor.value as? String)?.contains("Discard this") == true)
    tap(app.buttons["closeDocument"], in: app)
    tap(app.alerts.buttons["Discard changes"], in: app)
    tap(row, in: app)
    tap(app.segmentedControls.buttons["Source"], in: app)
    XCTAssertTrue(editor.waitForExistence(timeout: 10))
    XCTAssertFalse((editor.value as? String)?.contains("Discard this") == true)
    XCTAssertEqual(editor.value as? String, editedText)
    attach(app, name: "Native document reopened saved version")
    tap(app.buttons["lockDocument"], in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
    XCTAssertFalse(editor.exists)
  }

  @MainActor
  func testMarkdownPreviewTasksLinksBackAnchorsAndLock() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let tab = app.tabBars.buttons["Files"]
    if tab.exists { tab.tap() } else { tap(app.buttons["Files"], in: app) }
    let source =
      "# Field notes\n\n- [ ] Review the plan\n\n[Open sibling](Sibling.md)\n\n[Jump to details](#details)\n\n| Item | Status |\n| :--- | ---: |\n| Native UI | Ready |\n\n> A short **important** note.\n\n```swift\nlet ready = true\n```\n\n"
      + String(repeating: "A paragraph in the reading view.\n\n", count: 12)
      + "## Details\n\nAnchor reached"
    func createNote(_ name: String, _ text: String) {
      tap(app.buttons["addFile"], in: app)
      tap(app.buttons["newNote"], in: app)
      let field = app.textFields["noteName"]
      XCTAssertTrue(field.waitForExistence(timeout: 5))
      field.tap()
      field.typeText(name)
      app.textViews["noteText"].tap()
      app.textViews["noteText"].typeText(text)
      tap(app.buttons["saveNote"], in: app)
      XCTAssertTrue(app.buttons["fileRow-" + name + ".md"].waitForExistence(timeout: 15))
    }
    createNote("Sibling", "# Linked note\n\nReturn to the original draft with Back.")
    createNote("Origin", source)
    tap(app.buttons["fileRow-Origin.md"], in: app)
    XCTAssertTrue(app.staticTexts["Field notes"].waitForExistence(timeout: 10))
    attach(app, name: "Native Markdown preview with table quote and code")
    tap(app.buttons["Incomplete task"], in: app)
    XCTAssertTrue(app.buttons["Completed task"].waitForExistence(timeout: 5))
    tap(app.segmentedControls.buttons["Source"], in: app)
    let editor = app.textViews["documentText"]
    XCTAssertTrue(editor.waitForExistence(timeout: 5))
    XCTAssertEqual(editor.value as? String, source.replacingOccurrences(of: "[ ]", with: "[x]"))
    tap(app.segmentedControls.buttons["Preview"], in: app)
    XCTAssertTrue(app.links["Open sibling"].waitForExistence(timeout: 5))
    tap(app.links["Open sibling"], in: app)
    XCTAssertTrue(app.staticTexts["Linked note"].waitForExistence(timeout: 10))
    tap(app.buttons["closeDocument"], in: app)
    XCTAssertTrue(app.buttons["Completed task"].waitForExistence(timeout: 5))
    attach(app, name: "Markdown Back preserves parent draft")
    tap(app.buttons["closeDocument"], in: app)
    XCTAssertTrue(app.alerts["Discard unsaved changes?"].waitForExistence(timeout: 5))
    tap(app.alerts.buttons["Keep editing"], in: app)
    tap(app.buttons["saveDocument"], in: app)
    XCTAssertTrue(
      app.staticTexts["documentSaved"].waitForExistence(timeout: 10)
        || app.otherElements["documentSaved"].exists)
    tap(app.buttons["closeDocument"], in: app)
    tap(app.buttons["fileRow-Origin.md"], in: app)
    XCTAssertTrue(app.buttons["Completed task"].waitForExistence(timeout: 10))
    tap(app.links["Jump to details"], in: app)
    XCTAssertTrue(app.staticTexts["Anchor reached"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Anchor reached"].isHittable)
    attach(app, name: "Native Markdown heading anchor")
    tap(app.buttons["lockDocument"], in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["Anchor reached"].exists)
    XCTAssertFalse(app.textViews["documentText"].exists)
  }

  @MainActor
  func testFileExportReviewSystemCancelAndSavePreserveTheOrigin() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let tab = app.tabBars.buttons["Files"]
    if tab.exists { tab.tap() } else { tap(app.buttons["Files"], in: app) }
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newFileFolder"], in: app)
    let folder = app.textFields["fileItemName"]
    XCTAssertTrue(folder.waitForExistence(timeout: 5))
    folder.tap()
    folder.typeText("Reports")
    tap(app.buttons["saveFileName"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Reports"].waitForExistence(timeout: 10))
    tap(app.buttons["fileRow-Reports"], in: app)
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newNote"], in: app)
    let name = app.textFields["noteName"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    let filename = "Air shared " + String(UUID().uuidString.prefix(8))
    name.typeText(filename)
    let body = app.textViews["noteText"]
    body.tap()
    body.typeText("# Shared report\nReady for review.")
    tap(app.buttons["saveNote"], in: app)
    let row = app.buttons["fileRow-" + filename + ".md"]
    XCTAssertTrue(row.waitForExistence(timeout: 15))
    row.press(forDuration: 1)
    tap(app.buttons["exportFile"], in: app)
    XCTAssertTrue(app.buttons["prepareFileExport"].waitForExistence(timeout: 5))
    attach(app, name: "Native explicit file export review")
    tap(app.buttons["closeFileExport"], in: app)
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    tap(app.buttons["fileSortFilter"], in: app)
    tap(app.buttons["selectFiles"], in: app)
    tap(row, in: app)
    XCTAssertEqual(app.staticTexts["fileSelectionCount"].label, "Selected: 1")
    attach(app, name: "Native selection with export action")
    tap(app.buttons["exportSelectedFiles"], in: app)
    tap(app.buttons["prepareFileExport"], in: app)
    XCTAssertTrue(app.otherElements["ActivityListView"].firstMatch.waitForExistence(timeout: 15))
    attach(app, name: "Native system Share for file export")
    let closeShare = app.buttons["header.closeButton"].firstMatch
    if closeShare.exists {
      tap(closeShare, in: app)
    } else {
      // Tap the backdrop immediately above the actual popover, outside the status bar.
      app.otherElements["ActivityListView"].firstMatch
        .coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0))
        .withOffset(CGVector(dx: 0, dy: -20)).tap()
    }
    XCTAssertTrue(app.buttons["sharePreparedFiles"].waitForExistence(timeout: 5))
    tap(app.buttons["sharePreparedFiles"], in: app)
    let saveToFiles = app.cells.matching(
      NSPredicate(format: "label IN %@", ["Save to Files", "Сохранить в Файлах"])
    ).firstMatch
    XCTAssertTrue(saveToFiles.waitForExistence(timeout: 10))
    tap(saveToFiles, in: app)
    let save = app.buttons.matching(
      NSPredicate(format: "label IN %@", ["Save", "Сохранить"])
    ).firstMatch
    XCTAssertTrue(save.waitForExistence(timeout: 10))
    attach(app, name: "Native file export destination picker")
    tap(save, in: app)
    XCTAssertTrue(app.staticTexts["fileExportFinished"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["Shared"].exists)
    XCTAssertFalse(app.staticTexts["Not confirmed"].exists)
    attach(app, name: "Native confirmed file handoff")
    tap(app.buttons["closeFileExport"], in: app)
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    XCTAssertEqual(app.staticTexts["fileSelectionCount"].label, "Selected: 1")
    tap(app.buttons["finishFileSelection"], in: app)
    tap(app.navigationBars.buttons["Files"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Reports"].waitForExistence(timeout: 5))
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 5))
    app.terminate()
  }

  @MainActor
  func testImageExportOffersPhotosAndReturnsToTheSource() {
    exportMediaToPhotos(
      name: "Air Export Fixture", extension: "png",
      actions: ["Save Image", "Сохранить изображение"])
  }

  @MainActor
  func testVideoExportOffersPhotosAndReturnsToTheSource() {
    exportMediaToPhotos(
      name: "Air Video Fixture", extension: "mp4", actions: ["Save Video", "Сохранить видео"])
  }

  @MainActor
  private func exportMediaToPhotos(name: String, extension suffix: String, actions: [String]) {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let tab = app.tabBars.buttons["Files"]
    if tab.exists { tab.tap() } else { tap(app.buttons["Files"], in: app) }
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["importFiles"], in: app)
    tap(app.buttons["chooseImportFiles"], in: app)
    let browse = app.buttons["Browse"].firstMatch
    if browse.waitForExistence(timeout: 3) { browse.tap() }
    let phone = app.staticTexts["On My iPhone"].firstMatch
    let location = phone.exists ? phone : app.staticTexts["On My iPad"].firstMatch
    XCTAssertTrue(location.waitForExistence(timeout: 10))
    location.tap()
    let source = app.staticTexts["Air UI Tests"].firstMatch
    XCTAssertTrue(source.waitForExistence(timeout: 10))
    source.tap()
    let file = app.cells.containing(.staticText, identifier: name).firstMatch
    XCTAssertTrue(file.waitForExistence(timeout: 10))
    file.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).tap()
    tap(app.buttons["Open"].firstMatch, in: app)
    XCTAssertTrue(
      app.descendants(matching: .any).matching(identifier: "fileImportFinished").firstMatch
        .waitForExistence(timeout: 15))
    XCTAssertEqual(app.staticTexts["fileImportCount"].label, "1 / 1")
    tap(app.buttons["closeFileImport"], in: app)
    let row = app.buttons["fileRow-" + name + "." + suffix]
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    row.press(forDuration: 1)
    tap(app.buttons["exportFile"], in: app)
    tap(app.buttons["prepareFileExport"], in: app)
    let saveMedia = app.cells.matching(
      NSPredicate(format: "label IN %@", actions)
    ).firstMatch
    XCTAssertTrue(saveMedia.waitForExistence(timeout: 15))
    attach(app, name: "Native " + suffix + " export Photos applicability")
    tap(saveMedia, in: app)
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let allow = springboard.buttons.matching(
      NSPredicate(
        format: "label IN %@",
        ["Allow Access to Add Photos", "Allow", "Разрешить добавление фото", "Разрешить"])
    ).firstMatch
    if allow.waitForExistence(timeout: 5) { allow.tap() }
    XCTAssertTrue(app.staticTexts["fileExportFinished"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["Shared"].exists)
    XCTAssertFalse(app.staticTexts["Not confirmed"].exists)
    attach(app, name: "Native " + suffix + " export handoff result")
    tap(app.buttons["closeFileExport"], in: app)
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 5))
    app.terminate()
  }

  @MainActor
  func testNewNoteSaveCancelAndProjectionReturnToTheOriginalFolder() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let tab = app.tabBars.buttons["Files"]
    if tab.exists { tab.tap() } else { tap(app.buttons["Files"], in: app) }
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newFileFolder"], in: app)
    let folderName = app.textFields["fileItemName"]
    XCTAssertTrue(folderName.waitForExistence(timeout: 5))
    folderName.tap()
    folderName.typeText("Notebook")
    tap(app.buttons["saveFileName"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Notebook"].waitForExistence(timeout: 10))
    tap(app.buttons["fileRow-Notebook"], in: app)
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newNote"], in: app)
    tap(app.buttons["saveNote"], in: app)
    XCTAssertTrue(app.staticTexts["Enter a name."].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Enter a name."].isHittable)
    attach(app, name: "Native new note inline validation")
    let name = app.textFields["noteName"]
    name.tap()
    name.typeText("Daily")
    let body = app.textViews["noteText"]
    XCTAssertTrue(body.waitForExistence(timeout: 5))
    body.tap()
    body.typeText("# Route\n- [ ] Review navigation")
    attach(app, name: "Native new note draft")
    tap(app.buttons["saveNote"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Daily.md"].waitForExistence(timeout: 15))
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newFileFolder"], in: app)
    XCTAssertTrue(folderName.waitForExistence(timeout: 5))
    folderName.tap()
    folderName.typeText("Archive")
    tap(app.buttons["saveFileName"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Archive"].waitForExistence(timeout: 10))
    tap(app.buttons["Notes"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Daily.md"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["fileRow-Archive"].exists)
    attach(app, name: "Native Notes projection in origin folder")
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newNote"], in: app)
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Canceled")
    body.tap()
    body.typeText("Discard this draft")
    // A typed draft is not thrown away silently: Cancel asks, and Keep editing returns to it.
    tap(app.buttons["cancelNote"], in: app)
    let keepEditing = app.alerts.firstMatch.buttons["Keep editing"]
    XCTAssertTrue(keepEditing.waitForExistence(timeout: 5))
    keepEditing.tap()
    XCTAssertTrue(app.buttons["saveNote"].waitForExistence(timeout: 5))
    tap(app.buttons["cancelNote"], in: app)
    let discard = app.alerts.firstMatch.buttons["Discard draft"]
    XCTAssertTrue(discard.waitForExistence(timeout: 5))
    attach(app, name: "Native new note discard confirmation")
    discard.tap()
    XCTAssertTrue(app.buttons["fileRow-Daily.md"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["fileRow-Canceled.md"].exists)
    tap(app.buttons["All files"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Archive"].waitForExistence(timeout: 10))
    tap(app.navigationBars.buttons["Files"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Notebook"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["fileRow-Daily.md"].exists)
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 5))
    app.terminate()
  }

  @MainActor
  func testFilesSelectionMoveAndDeletePreserveTheOriginAndCancellation() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let tab = app.tabBars.buttons["Files"]
    if tab.exists { tab.tap() } else { tap(app.buttons["Files"], in: app) }
    for folderName in ["Alpha", "Beta", "Target"] {
      XCTAssertTrue(app.buttons["addFile"].waitForExistence(timeout: 10))
      tap(app.buttons["addFile"], in: app)
      tap(app.buttons["newFileFolder"], in: app)
      let name = app.textFields["fileItemName"]
      XCTAssertTrue(name.waitForExistence(timeout: 5))
      name.tap()
      name.typeText(folderName)
      tap(app.buttons["saveFileName"], in: app)
      XCTAssertTrue(app.buttons["fileRow-" + folderName].waitForExistence(timeout: 10))
    }
    tap(app.buttons["fileSortFilter"], in: app)
    tap(app.buttons["selectFiles"], in: app)
    tap(app.buttons["fileRow-Alpha"], in: app)
    tap(app.buttons["fileRow-Beta"], in: app)
    XCTAssertEqual(app.staticTexts["fileSelectionCount"].label, "Selected: 2")
    attach(app, name: "Native Files selection actions")
    tap(app.buttons["moveSelectedFiles"], in: app)
    XCTAssertTrue(app.buttons["moveFolder-Target"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["moveFolder-Alpha"].exists)
    XCTAssertFalse(app.buttons["moveFolder-Beta"].exists)
    tap(app.buttons["moveFilesHere"], in: app)
    XCTAssertTrue(
      app.staticTexts["These items are already in this folder. Choose another destination."]
        .waitForExistence(timeout: 5))
    attach(app, name: "Native move destination excludes selected folders")
    tap(app.buttons["moveFolder-Target"], in: app)
    tap(app.buttons["closeFileOperation"], in: app)
    XCTAssertTrue(app.buttons["moveSelectedFiles"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["fileSelectionCount"].label, "Selected: 2")
    tap(app.buttons["moveSelectedFiles"], in: app)
    tap(app.buttons["moveFolder-Target"], in: app)
    attach(app, name: "Native move nested destination")
    tap(app.buttons["moveFilesHere"], in: app)
    XCTAssertTrue(app.staticTexts["fileOperationFinished"].waitForExistence(timeout: 15))
    XCTAssertEqual(app.staticTexts["fileOperationCount"].label, "2 / 2")
    attach(app, name: "Native move result")
    tap(app.buttons["closeFileOperation"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Target"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["fileRow-Alpha"].exists)
    XCTAssertFalse(app.buttons["fileRow-Beta"].exists)
    tap(app.buttons["finishFileSelection"], in: app)
    tap(app.buttons["fileRow-Target"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Alpha"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["fileRow-Beta"].exists)
    tap(app.buttons["fileSortFilter"], in: app)
    tap(app.buttons["selectFiles"], in: app)
    tap(app.buttons["fileRow-Alpha"], in: app)
    tap(app.buttons["fileRow-Beta"], in: app)
    tap(app.buttons["deleteSelectedFiles"], in: app)
    XCTAssertTrue(app.buttons["confirmSelectedDelete"].waitForExistence(timeout: 5))
    attach(app, name: "Native selected deletion review")
    tap(app.buttons["closeFileOperation"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Alpha"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["fileSelectionCount"].label, "Selected: 2")
    tap(app.buttons["deleteSelectedFiles"], in: app)
    tap(app.buttons["confirmSelectedDelete"], in: app)
    XCTAssertTrue(app.staticTexts["fileOperationFinished"].waitForExistence(timeout: 15))
    XCTAssertEqual(app.staticTexts["fileOperationCount"].label, "2 / 2")
    tap(app.buttons["closeFileOperation"], in: app)
    XCTAssertTrue(app.staticTexts["This folder is empty"].waitForExistence(timeout: 10))
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 5))
    app.terminate()
  }

  @MainActor
  func testFilesFolderCreationNavigationRenameAndDelete() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let filesTab = app.tabBars.buttons["Files"]
    if filesTab.exists { tap(filesTab, in: app) } else { tap(app.buttons["Files"], in: app) }
    XCTAssertTrue(app.buttons["addFile"].waitForExistence(timeout: 10))
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newFileFolder"], in: app)
    tap(app.buttons["saveFileName"], in: app)
    XCTAssertTrue(app.staticTexts["Enter a name."].waitForExistence(timeout: 5))
    let name = app.textFields["fileItemName"]
    name.tap()
    name.typeText("Projects")
    tap(app.buttons["saveFileName"], in: app)
    let project = app.buttons["fileRow-Projects"]
    XCTAssertTrue(project.waitForExistence(timeout: 10))
    attach(app, name: "Native Files catalog")
    tap(project, in: app)
    XCTAssertTrue(app.navigationBars["Projects"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["lockVault"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["fileSortFilter"].exists)
    XCTAssertTrue(app.searchFields["Search this folder"].exists)
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newFileFolder"], in: app)
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Design")
    tap(app.buttons["saveFileName"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Design"].waitForExistence(timeout: 10))
    attach(app, name: "Native nested Files route")
    tap(app.navigationBars.buttons["Files"], in: app)
    XCTAssertTrue(project.waitForExistence(timeout: 5))
    project.press(forDuration: 1)
    tap(app.buttons["Rename"], in: app)
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText(
      String(repeating: XCUIKeyboardKey.delete.rawValue, count: "Projects".count) + "Archive")
    tap(app.buttons["saveFileName"], in: app)
    let archive = app.buttons["fileRow-Archive"]
    XCTAssertTrue(archive.waitForExistence(timeout: 10))
    archive.press(forDuration: 1)
    tap(app.buttons["Delete"], in: app)
    XCTAssertTrue(app.buttons["confirmFileDelete"].waitForExistence(timeout: 5))
    attach(app, name: "Native Files deletion confirmation")
    app.alerts.buttons["Cancel"].tap()
    XCTAssertTrue(archive.exists)
    archive.press(forDuration: 1)
    tap(app.buttons["Delete"], in: app)
    XCTAssertTrue(app.buttons["confirmFileDelete"].waitForExistence(timeout: 5))
    app.buttons["confirmFileDelete"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["This folder is empty"].waitForExistence(timeout: 10))
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 5))
    app.terminate()
  }

  @MainActor
  func testFilesPickerCancelAndMultiImportStayInTheOriginFolder() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let tab = app.tabBars.buttons["Files"]
    if tab.exists { tab.tap() } else { tap(app.buttons["Files"], in: app) }
    XCTAssertTrue(app.buttons["addFile"].waitForExistence(timeout: 10))
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["newFileFolder"], in: app)
    let name = app.textFields["fileItemName"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Documents")
    tap(app.buttons["saveFileName"], in: app)
    let folder = app.buttons["fileRow-Documents"]
    XCTAssertTrue(folder.waitForExistence(timeout: 10))
    tap(folder, in: app)
    tap(app.buttons["addFile"], in: app)
    tap(app.buttons["importFiles"], in: app)
    tap(app.buttons["chooseImportFiles"], in: app)
    let closePicker = app.navigationBars.matching(
      NSPredicate(
        format: "identifier IN %@",
        ["FullDocumentManagerViewControllerNavigationBar", "DOCSidebarView"])
    ).buttons["Cancel"].firstMatch
    XCTAssertTrue(closePicker.waitForExistence(timeout: 15))
    attach(app, name: "Native Files document picker")
    closePicker.tap()
    XCTAssertTrue(app.buttons["chooseImportFiles"].waitForExistence(timeout: 10))
    tap(app.buttons["chooseImportFiles"], in: app)
    let browse = app.buttons["Browse"].firstMatch
    if browse.waitForExistence(timeout: 3) { browse.tap() }
    let phone = app.staticTexts["On My iPhone"].firstMatch
    let tablet = app.staticTexts["On My iPad"].firstMatch
    let location = phone.exists ? phone : tablet
    XCTAssertTrue(location.waitForExistence(timeout: 10))
    location.tap()
    let source = app.staticTexts["Air UI Tests"].firstMatch
    XCTAssertTrue(source.waitForExistence(timeout: 10))
    source.tap()
    for name in ["Air Import Fixture.json", "Air CSV Fixture"] {
      let file = app.cells.containing(.staticText, identifier: name).firstMatch
      XCTAssertTrue(file.waitForExistence(timeout: 10))
      file.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).tap()
    }
    let open = app.buttons["Open"].firstMatch
    XCTAssertTrue(open.waitForExistence(timeout: 5))
    open.tap()
    XCTAssertTrue(
      app.descendants(matching: .any).matching(identifier: "fileImportFinished").firstMatch
        .waitForExistence(timeout: 20))
    XCTAssertEqual(app.staticTexts["fileImportCount"].label, "2 / 2")
    XCTAssertTrue(app.staticTexts["fileImportCount"].isHittable)
    attach(app, name: "Native Files multi-import result")
    tap(app.buttons["closeFileImport"], in: app)
    XCTAssertTrue(app.buttons["fileRow-Air Import Fixture.json"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["fileRow-Air CSV Fixture.csv"].exists)
    attach(app, name: "Native imported files in origin folder")
    tap(app.navigationBars.buttons["Files"], in: app)
    XCTAssertTrue(folder.waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["fileRow-Air Import Fixture.json"].exists)
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 5))
    app.terminate()
  }

  #if AIR_FIXTURE
    @MainActor
    func testAutoFillSettingsReturnKeepsSetupAndShowsLockedVault() throws {
      guard #available(iOS 17.0, *) else {
        throw XCTSkip(
          "Direct AutoFill Settings navigation requires iOS 17; iOS 16 uses instructions.")
      }
      continueAfterFailure = false
      // The containing app embeds the real provider; UI-only test hosts intentionally do not.
      let app = XCUIApplication(bundleIdentifier: "com.chromvoid.iosair.dev.fixture")
      let password = launchLockedFixture(app)
      password.tap()
      password.typeText(UUID().uuidString.utf8.map { String($0) }.joined())
      tap(app.buttons["submitAccess"], in: app)
      XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
      let settingsTab = app.tabBars.buttons["Settings"]
      if settingsTab.exists {
        tap(settingsTab, in: app)
      } else {
        tap(app.buttons["Settings"], in: app)
      }
      tap(app.buttons["openAutoFill"], in: app)
      let systemStatus = app.staticTexts["autoFillSystem"]
      XCTAssertTrue(systemStatus.waitForExistence(timeout: 10))
      XCTAssertNotEqual(systemStatus.label, "Provider extension is unavailable")
      XCTAssertEqual(app.staticTexts["autoFillAccess"].label, "Local vault authorized")
      attach(app, name: "Native AutoFill setup with the open vault authorized")
      tap(app.buttons["openAutoFillSettings"], in: app)
      let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
      XCTAssertTrue(settings.wait(for: .runningForeground, timeout: 10))
      let provider = settings.switches.matching(
        NSPredicate(format: "label BEGINSWITH %@", "ChromVoid Air")
      ).firstMatch
      XCTAssertTrue(provider.waitForExistence(timeout: 10))
      app.activate()
      XCTAssertTrue(app.buttons["closeAutoFill"].waitForExistence(timeout: 10))
      scrollUp(in: app)
      XCTAssertTrue(app.staticTexts["autoFillAccess"].waitForExistence(timeout: 10))
      XCTAssertEqual(app.staticTexts["autoFillAccess"].label, "Vault is closed")
      attach(app, name: "Native AutoFill return with revoked vault")
      tap(app.buttons["closeAutoFill"], in: app)
      XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 5))
      app.terminate()
    }

  #endif

  @MainActor
  func testPasskeysMetadataSearchDeleteAndReturnToVault() {
    continueAfterFailure = false
    let app = XCUIApplication()
    // Keep this fixture independent of XCTest secure-input keyboard language mapping.
    let vaultPassword = UUID().uuidString.utf8.map { String($0) }.joined()
    app.launchEnvironment["AIR_TEST_PASSKEY_PASSWORD"] = vaultPassword
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText(vaultPassword)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["openPasskeys"].waitForExistence(timeout: 20))
    tap(app.buttons["openPasskeys"], in: app)
    XCTAssertTrue(app.staticTexts["alice@example.test"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["bob@example.test"].exists)
    attach(app, name: "Native passkeys list")
    let search = app.searchFields["Website or account"]
    search.tap()
    search.typeText("alice")
    XCTAssertTrue(app.staticTexts["alice@example.test"].exists)
    XCTAssertFalse(app.staticTexts["bob@example.test"].exists)
    tap(app.staticTexts["alice@example.test"], in: app)
    XCTAssertTrue(app.buttons["deletePasskey"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["login.example.test"].exists)
    XCTAssertTrue(app.staticTexts["Included in compatible vault backups."].exists)
    attach(app, name: "Native passkey metadata")
    tap(app.buttons["deletePasskey"], in: app)
    XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 5))
    attach(app, name: "Native passkey delete confirmation")
    tap(app.buttons["Cancel"], in: app)
    XCTAssertTrue(app.staticTexts["alice@example.test"].exists)
    tap(app.buttons["deletePasskey"], in: app)
    tap(app.alerts.buttons["confirmDeletePasskey"].firstMatch, in: app)
    XCTAssertTrue(app.staticTexts["Passkey deleted from this vault."].waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["No matching passkeys"].exists)
    attach(app, name: "Native passkey deleted with search preserved")
    // End the system search presentation, then pop the pushed passkeys screen; the back
    // button is not hittable while the search bar settles, so retry the pop.
    endSearch(in: app)
    let back = app.navigationBars["Passkeys"].buttons["BackButton"]
    XCTAssertTrue(back.waitForExistence(timeout: 3))
    for _ in 0..<3 where !app.buttons["openPasskeys"].exists {
      tap(back, in: app)
      _ = app.buttons["openPasskeys"].waitForExistence(timeout: 3)
    }
    XCTAssertTrue(app.buttons["openPasskeys"].waitForExistence(timeout: 5))
    tap(app.buttons["openPasskeys"], in: app)
    XCTAssertTrue(app.staticTexts["bob@example.test"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["alice@example.test"].exists)
    tap(app.staticTexts["bob@example.test"], in: app)
    tap(app.buttons["deletePasskey"], in: app)
    tap(app.alerts.buttons["confirmDeletePasskey"].firstMatch, in: app)
    XCTAssertTrue(app.staticTexts["No passkeys in this vault"].waitForExistence(timeout: 15))
    attach(app, name: "Native empty passkeys vault")
    tap(app.buttons["lockPasskeys"], in: app)
    XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["bob@example.test"].exists)
    app.terminate()
  }

  /// The offline wallet fixture: create a universal wallet, open its TON network screen and
  /// use the screen's own actions. Receive is a sheet attached to the navigation stack, so it
  /// must present over the pushed screen instead of waiting for the wallet root to return;
  /// Activity pushes the history and pops back to the same network screen.
  @MainActor
  func testWalletCreateOpensNetworkAndReceiveFromNetworkScreen() {
    continueAfterFailure = false
    let app = XCUIApplication()
    unlockWalletFixture(app, fixture: "setup")
    createWallet(named: "Synthetic universal", in: app)
    attach(app, name: "Native wallet catalog with a created wallet")
    tap(app.buttons["walletAsset-ton"], in: app)
    let network = app.collectionViews["walletNetwork"]
    XCTAssertTrue(network.waitForExistence(timeout: 10))
    XCTAssertTrue(app.navigationBars["TON"].waitForExistence(timeout: 5))
    attach(app, name: "Native wallet network screen")
    tap(network.buttons["Receive"], in: app)
    let address = app.staticTexts["receiveAddress"]
    XCTAssertTrue(address.waitForExistence(timeout: 5))
    XCTAssertTrue(app.navigationBars["Receive"].exists)
    attach(app, name: "Native receive sheet over the network screen")
    tap(app.navigationBars["Receive"].buttons["Close"], in: app)
    XCTAssertTrue(address.waitForNonExistence(timeout: 5))
    XCTAssertTrue(network.exists)
    XCTAssertTrue(app.navigationBars["TON"].exists)
    tap(network.buttons["Activity"], in: app)
    XCTAssertTrue(app.navigationBars["Activity"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["No transactions yet"].waitForExistence(timeout: 15))
    attach(app, name: "Native wallet activity from the network screen")
    popScreen(titled: "Activity", in: app)
    XCTAssertTrue(network.waitForExistence(timeout: 10))
    XCTAssertTrue(app.navigationBars["TON"].exists)
    popScreen(titled: "TON", in: app)
    XCTAssertTrue(app.buttons["walletAsset-ton"].waitForExistence(timeout: 10))
    tap(app.navigationBars["Wallet"].buttons["Lock vault"], in: app)
    XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 15))
    app.terminate()
  }

  /// The send fixture keeps TON transferable offline. Typing a TON address into the Send
  /// form must be recognised by Core without network access and reported under the network
  /// row; the draft is then discarded, never broadcast.
  @MainActor
  func testWalletSendDetectsNetworkFromPastedAddress() {
    continueAfterFailure = false
    let app = XCUIApplication()
    unlockWalletFixture(app, fixture: "send")
    createWallet(named: "Synthetic sender", in: app)
    let send = app.buttons["walletSend"]
    XCTAssertTrue(send.waitForExistence(timeout: 10))
    waitUntilEnabled(send)
    tap(send, in: app)
    XCTAssertTrue(app.navigationBars["Send"].waitForExistence(timeout: 10))
    let form = app.collectionViews["walletSendForm"]
    XCTAssertTrue(form.waitForExistence(timeout: 5))
    let hint = "Paste any address; the network is recognised automatically."
    XCTAssertTrue(app.staticTexts[hint].waitForExistence(timeout: 5))
    attach(app, name: "Native send form before detection")
    // The multi-line address field is the form's first text view; it carries no identifier.
    let address =
      form.textViews.firstMatch.exists ? form.textViews.firstMatch : form.textFields["Address"]
    XCTAssertTrue(address.waitForExistence(timeout: 5))
    address.tap()
    address.typeText("EQC-Ip06mEnUpcEN-VCDk3MIKwbnv6QhOLh4yGJHyZi0HcrD")
    XCTAssertTrue(
      app.staticTexts["Network detected from the address: TON"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts[hint].exists)
    attach(app, name: "Native send form with the detected network")
    // Closing a changed draft asks for confirmation; discard it and return to the catalog.
    tap(app.navigationBars["Send"].buttons["Close"], in: app)
    let discard = app.buttons["Discard changes"]
    XCTAssertTrue(discard.waitForExistence(timeout: 5))
    discard.tap()
    XCTAssertTrue(form.waitForNonExistence(timeout: 10))
    XCTAssertTrue(app.buttons["walletAsset-ton"].waitForExistence(timeout: 10))
    tap(app.navigationBars["Wallet"].buttons["Lock vault"], in: app)
    XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 15))
    app.terminate()
  }

  @MainActor
  func testNativeSetupUnlockLockAndBackgroundReturn() {
    // This target uses its own app sandbox and automatic Keychain access group.
    let vaultPassword = "air-synthetic-ui-" + UUID().uuidString
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    XCTAssertFalse(app.buttons["runBridgeCheck"].exists)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["Enter a password."].exists)
    attach(app, name: "Native empty submit")
    // Typing without tapping the field verifies focus, including hardware keyboards.
    password.typeText(vaultPassword)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    attach(app, name: "Native authorized empty vault")
    let search = app.textFields["credentialSearch"]
    if !search.isHittable { app.swipeDown() }
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    search.tap()
    search.typeText("no-synthetic-match")
    XCTAssertTrue(app.staticTexts["credentialsNoMatches"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["emptyVault"].exists)
    tap(app.buttons["clearCredentialSearch"], in: app)
    attach(app, name: "Native cleared search")
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 10))
    tap(app.buttons["addCredential"], in: app)
    XCTAssertTrue(app.buttons["saveCredential"].waitForExistence(timeout: 5))
    app.buttons["saveCredential"].tap()
    XCTAssertTrue(app.staticTexts["This field is required."].waitForExistence(timeout: 5))
    let name = app.textFields["credential_title"]
    name.typeText("Синтетическая почта")
    focus(app.textFields["credential_username"], in: app)
    app.textFields["credential_username"].typeText("alice@example.com")
    focus(app.secureTextFields["credential_password"], in: app)
    app.secureTextFields["credential_password"].typeText("synthetic-password")
    app.buttons["reveal_password"].tap()
    XCTAssertEqual(app.textFields["credential_password"].value as? String, "synthetic-password")
    app.buttons["reveal_password"].tap()
    attach(app, name: "Native login draft")
    app.buttons["saveCredential"].tap()
    XCTAssertTrue(app.staticTexts["Синтетическая почта"].waitForExistence(timeout: 15))
    XCTAssertFalse(app.buttons["saveCredential"].exists)
    attach(app, name: "Native saved credential")
    tap(app.buttons["addCredential"], in: app)
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Discarded synthetic draft")
    app.buttons["cancelCredentialCreation"].tap()
    XCTAssertTrue(app.buttons["Keep editing"].waitForExistence(timeout: 5))
    app.buttons["Keep editing"].tap()
    XCTAssertEqual(name.value as? String, "Discarded synthetic draft")
    app.buttons["cancelCredentialCreation"].tap()
    app.buttons["Discard draft"].tap()
    XCTAssertTrue(app.buttons["saveCredential"].waitForNonExistence(timeout: 5))
    tap(app.buttons["addCredential"], in: app)
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    app.buttons["Credential type, Login"].tap()
    app.buttons["Payment card"].tap()
    name.tap()
    name.typeText("Synthetic payment card")
    let holder = app.textFields["credential_cardholder"]
    holder.tap()
    holder.typeText("Synthetic User")
    // Card values are typed on the card face, in the clear: no secure fields, no reveal.
    let number = app.textFields["credential_cardNumber"]
    tap(number, in: app)
    // UIKit formats each edit inside the field now, so typing at machine speed keeps every
    // digit; this line used to lose one about every third run.
    number.typeText("4111111111111111")
    XCTAssertTrue(app.staticTexts["cardBrandHint"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["cardBrandHint"].label, "Visa")
    XCTAssertTrue(app.otherElements["paymentCardFace"].exists)
    XCTAssertEqual(number.value as? String, "4111 1111 1111 1111")
    XCTAssertFalse(app.buttons["reveal_cardNumber"].exists)
    attach(app, name: "Native card draft on the face")
    // A whole number hands the keyboard on, as a card is read out: month, year, then code.
    app.typeText("12")
    app.typeText("30")
    app.typeText("1")
    XCTAssertEqual(app.textFields["credential_month"].value as? String, "12")
    XCTAssertEqual(app.textFields["credential_year"].value as? String, "30")
    let code = app.textFields["credential_cardCode"]
    XCTAssertEqual(code.value as? String, "1")
    app.buttons["saveCredential"].tap()
    XCTAssertTrue(app.staticTexts["credentialSaveIssue"].waitForExistence(timeout: 10))
    attach(app, name: "Native card validation failure")
    // A plain field puts the caret where it was tapped; select the old value before typing.
    replace(code, with: "123", in: app)
    app.buttons["saveCredential"].tap()
    XCTAssertTrue(app.staticTexts["Synthetic payment card"].waitForExistence(timeout: 15))
    attach(app, name: "Native saved login and card")
    tap(app.buttons["catalogOptions"], in: app)
    attach(app, name: "Native catalog sorting menu")
    app.buttons["Descending"].tap()
    tap(app.buttons["catalogOptions"], in: app)
    app.buttons["Payment card"].tap()
    XCTAssertTrue(app.staticTexts["Synthetic payment card"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Синтетическая почта"].waitForNonExistence(timeout: 10))
    attach(app, name: "Native catalog type filter")
    tap(app.buttons["clearTypeFilter"], in: app)
    XCTAssertTrue(app.staticTexts["Синтетическая почта"].waitForExistence(timeout: 10))
    if !search.isHittable { app.swipeDown() }
    search.tap()
    search.typeText("почта")
    let login = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "openCredential_", "почта")
    ).firstMatch
    XCTAssertTrue(login.waitForExistence(timeout: 10))
    login.tap()
    XCTAssertTrue(app.staticTexts["credentialDetailTitle"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["secretValue_password"].exists)
    tap(app.buttons["showSecret_password"], in: app)
    XCTAssertTrue(app.staticTexts["secretValue_password"].waitForExistence(timeout: 10))
    XCTAssertEqual(app.staticTexts["secretValue_password"].label, "synthetic-password")
    attach(app, name: "Native credential explicit reveal")
    app.buttons["showSecret_password"].tap()
    XCTAssertFalse(app.staticTexts["secretValue_password"].exists)
    tap(app.buttons["editCredential"], in: app)
    XCTAssertTrue(app.textFields["edit_title"].waitForExistence(timeout: 5))
    replace(app.textFields["edit_title"], with: "Discard this change", in: app)
    app.buttons["cancelCredentialEdit"].tap()
    app.buttons["Keep editing"].tap()
    XCTAssertEqual(app.textFields["edit_title"].value as? String, "Discard this change")
    app.buttons["cancelCredentialEdit"].tap()
    app.buttons["Discard draft"].tap()
    XCTAssertTrue(app.buttons["saveCredentialEdit"].waitForNonExistence(timeout: 5))
    showHeader(in: app)
    XCTAssertEqual(app.staticTexts["credentialDetailTitle"].label, "Синтетическая почта")
    tap(app.buttons["editCredential"], in: app)
    replace(app.textFields["edit_title"], with: "Updated почта", in: app)
    replace(app.textFields["edit_username"], with: "updated@example.com", in: app)
    tap(app.buttons["chooseEntryGroup"], in: app)
    createGroup("Work", in: app)
    XCTAssertEqual(app.textFields["edit_group"].value as? String, "/Work")
    tap(app.buttons["chooseEntryGroup"], in: app)
    XCTAssertTrue(app.buttons["pickGroup_/Work"].waitForExistence(timeout: 10))
    attach(app, name: "Native group picker tree")
    createGroup("Nested", in: app)
    attach(app, name: "Native nested destination group")
    XCTAssertEqual(app.textFields["edit_group"].value as? String, "/Work/Nested")
    app.buttons["saveCredentialEdit"].tap()
    XCTAssertTrue(app.buttons["saveCredentialEdit"].waitForNonExistence(timeout: 15))
    showHeader(in: app)
    XCTAssertEqual(app.staticTexts["credentialDetailTitle"].label, "Updated почта")
    tap(app.staticTexts["updated@example.com"], in: app)
    tap(app.buttons["editCredential"], in: app)
    let secretInput = app.secureTextFields["edit_password"]
    XCTAssertTrue(secretInput.waitForExistence(timeout: 10))
    secretInput.tap()
    secretInput.typeText(XCUIKeyboardKey.delete.rawValue + "updated-password")
    app.buttons["reveal_password"].tap()
    XCTAssertEqual(app.textFields["edit_password"].value as? String, "updated-password")
    app.buttons["saveCredentialEdit"].tap()
    XCTAssertTrue(app.buttons["saveCredentialEdit"].waitForNonExistence(timeout: 15))
    tap(app.buttons["showSecret_password"], in: app)
    XCTAssertTrue(app.staticTexts["secretValue_password"].waitForExistence(timeout: 10))
    XCTAssertEqual(app.staticTexts["secretValue_password"].label, "updated-password")
    attach(app, name: "Native edited credential and password")
    app.navigationBars["Credential"].buttons.element(boundBy: 0).tap()
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    XCTAssertEqual(search.value as? String, "почта")
    tap(app.buttons["clearCredentialSearch"], in: app)

    tap(app.buttons["openGroup_/Work"], in: app)
    XCTAssertTrue(app.buttons["openGroup_/Work/Nested"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Updated почта"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["Synthetic payment card"].exists)
    attach(app, name: "Native group-scoped catalog")
    app.navigationBars["Work"].buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.buttons["openGroup_/Work"].waitForExistence(timeout: 10))

    let savedCard = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "openCredential_",
        "Synthetic payment card")
    ).firstMatch
    XCTAssertTrue(savedCard.waitForExistence(timeout: 10))
    savedCard.tap()
    waitEnabled(app.buttons["editCredential"])
    tap(app.buttons["editCredential"], in: app)
    replace(app.textFields["edit_cardholder"], with: "Updated Cardholder", in: app)
    replace(app.textFields["edit_month"], with: "6", in: app)
    // The year is typed as the card prints it.
    replace(app.textFields["edit_year"], with: "35", in: app)
    app.buttons["saveCredentialEdit"].tap()
    XCTAssertTrue(app.buttons["saveCredentialEdit"].waitForNonExistence(timeout: 15))
    showHeader(in: app)
    tap(app.staticTexts["Updated Cardholder"], in: app)
    tap(app.staticTexts["06 / 2035"], in: app)
    // The security code is changed on the card face of the edit form, in the clear.
    tap(app.buttons["editCredential"], in: app)
    let cardSecretInput = app.textFields["edit_cardCode"]
    XCTAssertTrue(cardSecretInput.waitForExistence(timeout: 10))
    XCTAssertEqual(cardSecretInput.value as? String, "123")
    replace(cardSecretInput, with: "1", in: app)
    app.buttons["saveCredentialEdit"].tap()
    XCTAssertTrue(app.staticTexts["credentialEditIssue"].waitForExistence(timeout: 10))
    attach(app, name: "Native card edit validation")
    replace(cardSecretInput, with: "456", in: app)
    app.buttons["saveCredentialEdit"].tap()
    XCTAssertTrue(app.buttons["saveCredentialEdit"].waitForNonExistence(timeout: 15))
    // The security code lives on the card face, not in a secret row.
    tap(app.buttons["showSecret_card_cvv"], in: app)
    let cardCode = app.staticTexts["paymentCardCode"]
    XCTAssertTrue(cardCode.waitForExistence(timeout: 10))
    XCTAssertEqual(cardCode.label, "456")
    attach(app, name: "Native edited payment card")
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 5))
    app.buttons["lockVault"].firstMatch.tap()
    XCTAssertTrue(password.waitForExistence(timeout: 15))
    XCTAssertEqual(password.value as? String, "Vault password")

    password.tap()
    password.typeText(vaultPassword)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    let editedLogin = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "openCredential_", "Updated почта"
      )
    ).firstMatch
    XCTAssertTrue(editedLogin.waitForExistence(timeout: 10))
    editedLogin.tap()
    XCTAssertTrue(app.staticTexts["credentialDetailTitle"].waitForExistence(timeout: 10))
    tap(app.buttons["editCredential"], in: app)
    XCTAssertTrue(app.secureTextFields["edit_password"].waitForExistence(timeout: 10))
    app.secureTextFields["edit_password"].tap()
    app.secureTextFields["edit_password"].typeText(
      XCUIKeyboardKey.delete.rawValue + "Background draft")
    // Default: leaving the app only covers the screen; the vault is still open on return.
    XCUIDevice.shared.press(.home)
    app.activate()
    // The editor and its draft survive the round trip; only revealed values are covered.
    XCTAssertTrue(app.buttons["cancelCredentialEdit"].waitForExistence(timeout: 15))
    attach(app, name: "Native background return still open")
    app.buttons["cancelCredentialEdit"].tap()
    let discard = app.alerts.firstMatch.buttons["Discard draft"]
    if discard.waitForExistence(timeout: 5) { discard.tap() }
    XCTAssertTrue(app.buttons["cancelCredentialEdit"].waitForNonExistence(timeout: 10))
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 15))
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 15))
    XCTAssertEqual(password.value as? String, "Vault password")
    XCTAssertFalse(app.buttons["lockVault"].exists)
    attach(app, name: "Native background return locked")

    password.tap()
    password.typeText(vaultPassword)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    if !search.isHittable { app.swipeDown() }
    search.tap()
    search.typeText("Updated почта")
    XCTAssertTrue(editedLogin.waitForExistence(timeout: 10))
    editedLogin.tap()
    tap(app.buttons["copySecret_password"], in: app)
    XCTAssertTrue(app.staticTexts["credentialCopied"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["secretValue_password"].exists)
    attach(app, name: "Native explicit copy without reveal")
    tap(app.buttons["deleteCredential"], in: app)
    XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
    attach(app, name: "Native delete confirmation")
    app.alerts.buttons["Cancel"].tap()
    XCTAssertTrue(app.alerts.firstMatch.waitForNonExistence(timeout: 5))
    XCTAssertTrue(app.buttons["editCredential"].exists)
    tap(app.buttons["deleteCredential"], in: app)
    tap(app.alerts.firstMatch.buttons["confirmDeleteCredential"].firstMatch, in: app)
    XCTAssertTrue(app.staticTexts["credentialsNoMatches"].waitForExistence(timeout: 15))
    XCTAssertEqual(search.value as? String, "Updated почта")
    attach(app, name: "Native delete retains search")
    tap(app.buttons["clearCredentialSearch"], in: app)
    XCTAssertTrue(savedCard.waitForExistence(timeout: 10))
    savedCard.tap()
    tap(app.buttons["deleteCredential"], in: app)
    tap(app.alerts.firstMatch.buttons["confirmDeleteCredential"].firstMatch, in: app)
    // The last entry is gone but the group tree remains, so the vault is not "empty" yet.
    XCTAssertTrue(app.buttons["openGroup_/Work"].waitForExistence(timeout: 15))
    XCTAssertFalse(app.staticTexts["emptyVault"].exists)
    attach(app, name: "Native delete last entry")
    groupAction("/Work", "Rename", in: app)
    typeGroupName("Archive", in: app)
    XCTAssertTrue(app.buttons["openGroup_/Archive"].waitForExistence(timeout: 10))
    tap(app.buttons["openGroup_/Archive"], in: app)
    XCTAssertTrue(app.buttons["openGroup_/Archive/Nested"].waitForExistence(timeout: 10))
    attach(app, name: "Native renamed group subtree")
    tap(app.buttons["openGroup_/Archive/Nested"], in: app)
    XCTAssertTrue(app.staticTexts["emptyGroup"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["emptyVault"].exists)
    attach(app, name: "Native empty group")
    app.navigationBars["Nested"].buttons.element(boundBy: 0).tap()
    app.navigationBars["Archive"].buttons.element(boundBy: 0).tap()
    groupAction("/Archive", "Delete", in: app)
    XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
    attach(app, name: "Native recursive group delete confirmation")
    app.alerts.buttons["Cancel"].tap()
    XCTAssertTrue(app.alerts.firstMatch.waitForNonExistence(timeout: 5))
    groupAction("/Archive", "Delete", in: app)
    tap(app.alerts.firstMatch.buttons["confirmDeleteGroup"].firstMatch, in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["openGroup_/Archive"].exists)
  }

  @MainActor
  func testCatalogOptionsDistinguishFilteredEmptyStateAndKeepOrderingWhenCleared() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("air-catalog-options-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    // An empty vault shows the brand card instead of the list, and sorting a vault with
    // nothing in it means nothing: the options live in the list's own header.
    XCTAssertFalse(app.buttons["catalogOptions"].exists)
    tap(app.buttons["addCredential"], in: app)
    tap(app.textFields["credential_title"], in: app)
    app.textFields["credential_title"].typeText("Options test login")
    tap(app.buttons["saveCredential"], in: app)
    XCTAssertTrue(app.staticTexts["Options test login"].waitForExistence(timeout: 15))
    tap(app.buttons["catalogOptions"], in: app)
    app.buttons["Date modified"].tap()
    let search = app.textFields["credentialSearch"]
    search.tap()
    search.typeText("absent credential")
    XCTAssertTrue(app.staticTexts["credentialsNoMatches"].waitForExistence(timeout: 10))
    tap(app.buttons["clearCredentialSearch"], in: app)
    XCTAssertTrue(app.staticTexts["Options test login"].waitForExistence(timeout: 10))
    tap(app.buttons["catalogOptions"], in: app)
    app.buttons["Payment card"].tap()
    XCTAssertTrue(app.staticTexts["credentialsNoMatches"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["Options test login"].exists)
    attach(app, name: "Native filtered empty catalog")
    tap(app.buttons["clearTypeFilter"], in: app)
    XCTAssertTrue(app.staticTexts["Options test login"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["catalogOptions"].label.contains("Date modified"))
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 15))
  }

  @MainActor
  func testQuickFiltersComposeAndPreserveCatalogReturnRoute() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-quick-filters-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    tap(app.buttons["addCredential"], in: app)
    tap(app.textFields["credential_title"], in: app)
    app.textFields["credential_title"].typeText("Filter test login")
    tap(app.buttons["saveCredential"], in: app)
    XCTAssertTrue(app.staticTexts["Filter test login"].waitForExistence(timeout: 15))
    tap(app.buttons["catalogOptions"], in: app)
    app.buttons["Date modified"].tap()
    tap(app.buttons["catalogOptions"], in: app)
    app.buttons["Updated in the last 14 days"].tap()
    XCTAssertTrue(app.buttons["removeQuickFilter_recent"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Filter test login"].exists)
    tap(app.buttons["catalogOptions"], in: app)
    app.buttons["With one-time codes"].tap()
    XCTAssertTrue(app.staticTexts["credentialsNoMatches"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["emptyVault"].exists)
    attach(app, name: "Native combined quick filters")
    tap(app.buttons["removeQuickFilter_otp"], in: app)
    XCTAssertTrue(app.staticTexts["Filter test login"].waitForExistence(timeout: 10))
    tap(
      app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_"))
        .firstMatch, in: app)
    waitEnabled(app.buttons["editCredential"])
    app.navigationBars["Credential"].buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.buttons["removeQuickFilter_recent"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Filter test login"].exists)
    tap(app.buttons["catalogOptions"], in: app)
    app.buttons["With SSH keys"].tap()
    XCTAssertTrue(app.staticTexts["credentialsNoMatches"].waitForExistence(timeout: 10))
    tap(app.buttons["clearCredentialFilters"], in: app)
    XCTAssertTrue(app.staticTexts["Filter test login"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["removeQuickFilter_recent"].exists)
    XCTAssertFalse(app.buttons["removeQuickFilter_ssh"].exists)
    XCTAssertTrue(app.buttons["catalogOptions"].label.contains("Date modified"))
    attach(app, name: "Native cleared quick filters preserve sorting")
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }

  @MainActor
  func testCredentialFileImportPickerReviewAndPersistence() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    let vaultPassword = "synthetic-file-import-" + UUID().uuidString
    password.tap()
    password.typeText(vaultPassword)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    openVaultTool("openCredentialImport", in: app)
    attach(app, name: "Native credential import start")
    tap(app.buttons["chooseCredentialImportFile"], in: app)
    let closePicker = app.navigationBars.matching(
      NSPredicate(
        format: "identifier IN %@",
        ["FullDocumentManagerViewControllerNavigationBar", "DOCSidebarView"])
    ).buttons["Cancel"].firstMatch
    XCTAssertTrue(closePicker.waitForExistence(timeout: 15))
    attach(app, name: "Native system credential file picker")
    closePicker.tap()
    XCTAssertTrue(app.buttons["chooseCredentialImportFile"].waitForExistence(timeout: 10))
    chooseCredentialImportFixture(in: app)
    XCTAssertTrue(app.buttons["confirmCredentialImport"].waitForExistence(timeout: 20))
    attach(app, name: "Native credential import review")
    tap(app.buttons["confirmCredentialImport"], in: app)
    XCTAssertTrue(app.staticTexts["credentialImportFinished"].waitForExistence(timeout: 20))
    attach(app, name: "Native credential import result")
    tap(app.buttons["closeCredentialImport"], in: app)
    let entry = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "openCredential_",
        "Imported synthetic login")
    ).firstMatch
    XCTAssertTrue(entry.waitForExistence(timeout: 10))
    tap(entry, in: app)
    tap(app.buttons["showSecret_password"], in: app)
    XCTAssertEqual(app.staticTexts["secretValue_password"].label, "synthetic-file-password")
    attach(app, name: "Native imported credential")
    app.terminate()
    let reopened = launchLockedFixture(app)
    reopened.tap()
    reopened.typeText(vaultPassword)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(entry.waitForExistence(timeout: 15))
    openVaultTool("openCredentialImport", in: app)
    tap(app.buttons["credentialImportMode"], in: app)
    app.buttons["Replace all credentials"].firstMatch.tap()
    chooseCredentialImportFixture(in: app)
    XCTAssertTrue(app.buttons["confirmCredentialImport"].waitForExistence(timeout: 20))
    tap(app.buttons["confirmCredentialImport"], in: app)
    XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
    attach(app, name: "Native credential replacement confirmation")
    app.alerts.firstMatch.buttons["Cancel"].firstMatch.tap()
    XCTAssertTrue(app.buttons["confirmCredentialImport"].exists)
    XCTAssertFalse(app.staticTexts["credentialImportFinished"].exists)
    tap(app.buttons["confirmCredentialImport"], in: app)
    app.alerts.firstMatch.buttons["replaceCredentialImport"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["credentialImportFinished"].waitForExistence(timeout: 20))
    tap(app.buttons["closeCredentialImport"], in: app)
    XCTAssertTrue(entry.waitForExistence(timeout: 10))
    tap(app.buttons["lockVault"].firstMatch, in: app)
  }

  @MainActor
  func testBitwardenFileImportShowsWarningsBeforeConfirmation() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-bitwarden-ui-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    for attempt in 0..<2 {
      openVaultTool("openCredentialImport", in: app)
      chooseCredentialImportFixture(in: app, displayName: "Air Bitwarden Fixture.json")
      XCTAssertTrue(app.buttons["confirmCredentialImport"].waitForExistence(timeout: 20))
      XCTAssertTrue(app.staticTexts["Unsupported records skipped, including SSH keys"].exists)
      XCTAssertTrue(app.staticTexts["Passkeys are not imported"].exists)
      XCTAssertEqual(
        app.staticTexts["credentialImportCount_New credentials"].label, attempt == 0 ? "5" : "0")
      XCTAssertEqual(
        app.staticTexts["credentialImportCount_Updated credentials"].label, attempt == 0 ? "0" : "5"
      )
      attach(app, name: "Bitwarden import review \(attempt)")
      tap(app.buttons["confirmCredentialImport"], in: app)
      XCTAssertTrue(app.staticTexts["credentialImportFinished"].waitForExistence(timeout: 20))
      XCTAssertEqual(
        app.staticTexts["credentialImportCount_New credentials"].label, attempt == 0 ? "5" : "0")
      XCTAssertEqual(
        app.staticTexts["credentialImportCount_Updated credentials"].label, attempt == 0 ? "0" : "5"
      )
      tap(app.buttons["closeCredentialImport"], in: app)
      let note = app.buttons["openCredential_bw-note"]
      XCTAssertTrue(note.waitForExistence(timeout: 10))
    }
    tap(app.buttons["openCredential_bw-note"], in: app)
    tap(app.buttons["showSecret_note"], in: app)
    XCTAssertEqual(app.staticTexts["secretValue_note"].label, "Private synthetic note")
    attach(app, name: "Bitwarden imported note")
    tap(app.buttons["lockVault"].firstMatch, in: app)
  }

  @MainActor
  func testCSVFileImportReviewsSkippedDataAndPreservesQuotedPassword() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-csv-ui-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    openVaultTool("openCredentialImport", in: app)
    chooseCredentialImportFixture(in: app, displayName: "Air CSV Fixture")
    XCTAssertTrue(app.buttons["confirmCredentialImport"].waitForExistence(timeout: 20))
    XCTAssertTrue(
      app.staticTexts[
        "Importing this CSV again in merge mode adds new credentials, even when names match."
      ].exists)
    XCTAssertTrue(app.staticTexts["CSV rows with missing fields or invalid data skipped"].exists)
    XCTAssertTrue(app.staticTexts["CSV columns with unrecognized names were not imported"].exists)
    attach(app, name: "CSV import review")
    tap(app.buttons["confirmCredentialImport"], in: app)
    XCTAssertTrue(app.staticTexts["credentialImportFinished"].waitForExistence(timeout: 20))
    tap(app.buttons["closeCredentialImport"], in: app)
    let entry = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "openCredential_", "CSV Mail")
    ).firstMatch
    XCTAssertTrue(entry.waitForExistence(timeout: 10))
    tap(entry, in: app)
    tap(app.buttons["showSecret_password"], in: app)
    XCTAssertEqual(
      app.staticTexts["secretValue_password"].label, "  synthetic,\"quoted\"\npassword  ")
    attach(app, name: "CSV imported password")
    tap(app.buttons["lockVault"].firstMatch, in: app)
  }

  @MainActor
  func testOnePasswordArchiveImportReviewsOmissionsAndPreservesPassword() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-1password-ui-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    for _ in 0..<2 {
      openVaultTool("openCredentialImport", in: app)
      chooseCredentialImportFixture(in: app, displayName: "Air 1Password Fixture.1pux")
      XCTAssertTrue(app.buttons["confirmCredentialImport"].waitForExistence(timeout: 20))
      XCTAssertTrue(app.staticTexts["Documents and attachments were not imported"].exists)
      XCTAssertTrue(app.staticTexts["Some custom icons could not be imported"].exists)
      attach(app, name: "1Password import review")
      tap(app.buttons["confirmCredentialImport"], in: app)
      XCTAssertTrue(app.staticTexts["credentialImportFinished"].waitForExistence(timeout: 20))
      tap(app.buttons["closeCredentialImport"], in: app)
    }
    let entry = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "openCredential_",
        "1Password Mail")
    ).firstMatch
    XCTAssertTrue(entry.waitForExistence(timeout: 10))
    tap(entry, in: app)
    tap(app.buttons["showSecret_password"], in: app)
    XCTAssertEqual(
      app.staticTexts["secretValue_password"].label, "  synthetic, \"one\"\npassword  ")
    attach(app, name: "1Password imported password")
    tap(app.buttons["lockVault"].firstMatch, in: app)
  }

  @MainActor
  func testKeePassImportRetriesPasswordAndPreservesReviewedCredentials() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-keepass-ui-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    for attempt in 0..<2 {
      openVaultTool("openCredentialImport", in: app)
      chooseCredentialImportFixture(in: app, displayName: "Air KeePass Fixture.kdbx")
      let databasePassword = app.secureTextFields["credentialImportPassword"]
      XCTAssertTrue(databasePassword.waitForExistence(timeout: 20))
      if attempt == 0 {
        databasePassword.tap()
        databasePassword.typeText("incorrect")
        tap(app.buttons["openCredentialImportDatabase"], in: app)
        XCTAssertTrue(app.staticTexts["credentialImportIssue"].waitForExistence(timeout: 10))
        XCTAssertEqual(
          app.staticTexts["credentialImportIssue"].label,
          "That password could not open the KeePass database. Try again.")
        XCTAssertFalse(app.buttons["confirmCredentialImport"].exists)
        attach(app, name: "KeePass password retry")
      }
      databasePassword.tap()
      databasePassword.typeText("synthetic-keepass-password")
      XCTAssertEqual((databasePassword.value as? String)?.count, "synthetic-keepass-password".count)
      tap(app.buttons["openCredentialImportDatabase"], in: app)
      XCTAssertTrue(app.staticTexts["Ready to import"].waitForExistence(timeout: 20))
      XCTAssertFalse(app.secureTextFields["credentialImportPassword"].exists)
      XCTAssertTrue(app.staticTexts["Documents and attachments were not imported"].exists)
      XCTAssertTrue(app.staticTexts["Deleted or excluded records were not imported"].exists)
      attach(app, name: "KeePass import review")
      tap(app.buttons["confirmCredentialImport"], in: app)
      XCTAssertTrue(app.staticTexts["credentialImportFinished"].waitForExistence(timeout: 20))
      tap(app.buttons["closeCredentialImport"], in: app)
    }
    let entry = app.buttons.matching(
      NSPredicate(
        format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "openCredential_", "KeePass Mail")
    )
    .firstMatch
    XCTAssertTrue(entry.waitForExistence(timeout: 10))
    tap(entry, in: app)
    tap(app.buttons["showSecret_password"], in: app)
    XCTAssertEqual(
      app.staticTexts["secretValue_password"].label, "  synthetic, \"keepass\"\npassword  ")
    attach(app, name: "KeePass imported password")
    tap(app.buttons["lockVault"].firstMatch, in: app)
  }

  @MainActor
  func testCredentialExportUsesSystemSaveAndPreservesVault() {
    continueAfterFailure = false
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-export-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    openVaultTool("openCredentialImport", in: app)
    chooseCredentialImportFixture(in: app)
    XCTAssertTrue(app.buttons["confirmCredentialImport"].waitForExistence(timeout: 20))
    tap(app.buttons["confirmCredentialImport"], in: app)
    XCTAssertTrue(app.staticTexts["credentialImportFinished"].waitForExistence(timeout: 20))
    tap(app.buttons["closeCredentialImport"], in: app)
    openVaultTool("openCredentialExport", in: app)
    attach(app, name: "Native credential export explanation")
    tap(app.buttons["chooseCredentialExportDestination"], in: app)
    let picker = app.otherElements["Browse View (Picker)"].firstMatch
    XCTAssertTrue(picker.waitForExistence(timeout: 15))
    attach(app, name: "Native system credential export picker")
    let sidebarCancel = app.navigationBars["DOCSidebarView"].buttons["Cancel"].firstMatch
    if sidebarCancel.exists {
      sidebarCancel.tap()
    } else {
      // The phone's nested-folder save sheet dismisses from its top edge.
      picker.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0))
        .press(
          forDuration: 0.1,
          thenDragTo: picker.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        )
    }
    XCTAssertTrue(app.buttons["chooseCredentialExportDestination"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["credentialExportFinished"].exists)
    tap(app.buttons["chooseCredentialExportDestination"], in: app)
    // Files retains the explicit fixture directory selected during import.
    let folder = app.buttons["Air UI Tests, Actions Menu"].firstMatch
    XCTAssertTrue(folder.waitForExistence(timeout: 15))
    let save = app.buttons["Save"].firstMatch
    XCTAssertTrue(save.waitForExistence(timeout: 10))
    save.tap()
    let replace = app.alerts.firstMatch.buttons["Replace"].firstMatch
    if replace.waitForExistence(timeout: 2) { replace.tap() }
    XCTAssertTrue(app.staticTexts["credentialExportFinished"].waitForExistence(timeout: 15))
    attach(app, name: "Native credential export saved")
    tap(app.buttons["closeCredentialExport"], in: app)
    XCTAssertTrue(app.buttons["openCredential_air-import-ui"].waitForExistence(timeout: 10))
    tap(app.buttons["lockVault"].firstMatch, in: app)
  }

  @MainActor
  private func chooseCredentialImportFixture(
    in app: XCUIApplication, displayName: String = "Air Import Fixture.json"
  ) {
    tap(app.buttons["chooseCredentialImportFile"], in: app)
    let browse = app.buttons["Browse"].firstMatch
    if browse.waitForExistence(timeout: 3) { browse.tap() }
    let phone = app.staticTexts["On My iPhone"].firstMatch
    let tablet = app.staticTexts["On My iPad"].firstMatch
    let location = phone.exists ? phone : tablet
    XCTAssertTrue(location.waitForExistence(timeout: 10))
    location.tap()
    let folder = app.staticTexts["Air UI Tests"].firstMatch
    XCTAssertTrue(folder.waitForExistence(timeout: 10))
    folder.tap()
    let file = app.cells.containing(.staticText, identifier: displayName).firstMatch
    XCTAssertTrue(file.waitForExistence(timeout: 10))
    // Files exposes thumbnail descendants without an accessibility hit point.
    file.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).tap()
  }

  @MainActor
  func testCredentialClearConfirmationCancellationAndPersistence() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    let vaultPassword = "synthetic-clear-" + UUID().uuidString
    password.tap()
    password.typeText(vaultPassword)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    createGroupHere("Disposable group", in: app)
    tap(app.buttons["openGroup_/Disposable group"], in: app)
    XCTAssertTrue(app.staticTexts["emptyGroup"].waitForExistence(timeout: 10))
    tap(app.buttons["addCredential"], in: app)
    tap(app.textFields["credential_title"], in: app)
    app.textFields["credential_title"].typeText("Disposable login")
    tap(app.buttons["saveCredential"], in: app)
    XCTAssertTrue(
      app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_"))
        .firstMatch.waitForExistence(timeout: 15))
    openVaultTool("openCredentialClear", in: app)
    tap(app.buttons["requestClearCredentials"], in: app)
    attach(app, name: "Native credential clear confirmation")
    tap(app.alerts.firstMatch.buttons["cancelClearCredentials"].firstMatch, in: app)
    tap(app.buttons["closeCredentialClear"], in: app)
    XCTAssertTrue(
      app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_"))
        .firstMatch.waitForExistence(timeout: 10))
    openVaultTool("openCredentialClear", in: app)
    tap(app.buttons["requestClearCredentials"], in: app)
    tap(app.alerts.firstMatch.buttons["confirmClearCredentials"].firstMatch, in: app)
    XCTAssertTrue(app.staticTexts["credentialsCleared"].waitForExistence(timeout: 15))
    attach(app, name: "Native credentials cleared")
    tap(app.buttons["closeCredentialClear"], in: app)
    // Clearing removed the group this screen showed; it says so and offers the way back.
    XCTAssertTrue(
      app.staticTexts["This group is no longer available."].waitForExistence(timeout: 15))
    attach(app, name: "Native cleared group screen")
    app.navigationBars["Disposable group"].buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    app.terminate()
    let reopened = launchLockedFixture(app)
    reopened.tap()
    reopened.typeText(vaultPassword)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    tap(app.buttons["lockVault"].firstMatch, in: app)
  }

  /// A toolbar must not grow as its screen loads: an item added once the entry is ready pushes
  /// the title sideways, and the whole bar relays out. The fixture runtime is asked for a slow
  /// credential page so the loading state can be seen at all.
  @MainActor
  func testCredentialToolbarHoldsStillWhileTheEntryLoads() {
    let app = XCUIApplication()
    // Long enough that the queries below, which wait for the app to idle first, still land
    // while the page is loading.
    app.launchEnvironment["AIR_TEST_DETAIL_DELAY"] = "8"
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-toolbar-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    tap(app.buttons["addCredential"], in: app)
    tap(app.textFields["credential_title"], in: app)
    app.textFields["credential_title"].typeText("Toolbar login")
    tap(app.buttons["saveCredential"], in: app)
    XCTAssertTrue(app.staticTexts["Toolbar login"].waitForExistence(timeout: 15))
    app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_"))
      .firstMatch.tap()

    let bar = app.navigationBars["Credential"]
    let edit = app.buttons["editCredential"]
    XCTAssertTrue(
      edit.waitForExistence(timeout: 5),
      "Edit belongs in the toolbar from the first frame, not added once the entry has loaded.")
    // Still loading: the button is already in its place and cannot be used yet.
    XCTAssertFalse(edit.isEnabled, "Edit must wait, disabled, while the entry loads.")
    let title = bar.staticTexts.firstMatch
    let loading = title.frame
    let editFrame = edit.frame
    attach(app, name: "Native credential page while it loads")
    waitEnabled(edit)
    XCTAssertEqual(title.frame, loading, "The title moved once the entry had loaded.")
    XCTAssertEqual(edit.frame, editFrame, "Edit moved once the entry had loaded.")
    attach(app, name: "Native credential page once loaded")
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }

  @MainActor
  func testQuickCopyAndFieldCopyDoNotRevealLoginOrCardFields() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-copy-all-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    for isCard in [false, true] {
      let title = isCard ? "Copy test card" : "Copy test login"
      tap(app.buttons["addCredential"], in: app)
      if isCard {
        tap(app.buttons["Credential type, Login"], in: app)
        app.buttons["Payment card"].tap()
      }
      tap(app.textFields["credential_title"], in: app)
      app.textFields["credential_title"].typeText(title)
      if isCard {
        focus(app.textFields["credential_cardholder"], in: app)
        app.textFields["credential_cardholder"].typeText("Synthetic Cardholder")
        focus(app.textFields["credential_cardNumber"], in: app)
        app.textFields["credential_cardNumber"].typeText("4111111111111111")
        focus(app.textFields["credential_cardCode"], in: app)
        app.textFields["credential_cardCode"].typeText("123")
        for (field, value) in [("month", "12"), ("year", "2030")] {
          focus(app.textFields["credential_" + field], in: app)
          app.textFields["credential_" + field].typeText(value)
        }
      } else {
        focus(app.textFields["credential_username"], in: app)
        app.textFields["credential_username"].typeText("alice")
        focus(app.secureTextFields["credential_password"], in: app)
        app.secureTextFields["credential_password"].typeText("synthetic-password")
      }
      tap(app.buttons["saveCredential"], in: app)
      XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 15))
      let row = app.buttons.matching(
        NSPredicate(
          format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "openCredential_", title)
      ).firstMatch
      XCTAssertTrue(row.waitForExistence(timeout: 10))
      let quickCopy = app.buttons[
        "quickCopyCredential_" + row.identifier.dropFirst("openCredential_".count)]
      XCTAssertEqual(quickCopy.label, isCard ? "Copy card number" : "Copy password")
      tap(quickCopy, in: app)
      XCTAssertTrue(app.staticTexts["quickCopySucceeded"].waitForExistence(timeout: 5))
      XCTAssertFalse(app.staticTexts["credentialDetailTitle"].exists)
      XCTAssertFalse(app.staticTexts[isCard ? "4111111111111111" : "synthetic-password"].exists)
      attach(app, name: isCard ? "Catalog quick copy card" : "Catalog quick copy login")
      tap(row, in: app)
      // The page opens with nothing revealed; the card number is the card's own face.
      for field in ["password", "note", "card_cvv"] {
        XCTAssertFalse(app.staticTexts["secretValue_" + field].exists)
      }
      tap(app.buttons["copySecret_" + (isCard ? "card_pan" : "password")], in: app)
      XCTAssertTrue(app.staticTexts["credentialCopied"].waitForExistence(timeout: 5))
      // Copying reveals nothing it did not already show: a card's number is its face, the
      // password stays dots, and the security code and note stay hidden either way.
      XCTAssertEqual(app.staticTexts["secretValue_card_pan"].exists, isCard)
      for field in ["password", "note", "card_cvv"] {
        XCTAssertFalse(app.staticTexts["secretValue_" + field].exists)
      }
      attach(
        app,
        name: isCard
          ? "Copy the card number without revealing" : "Copy the password without revealing")
      app.navigationBars["Credential"].buttons.element(boundBy: 0).tap()
    }
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }

  @MainActor
  func testWebsiteCreationEditingValidationAndLock() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-websites-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    tap(app.buttons["addCredential"], in: app)
    tap(app.textFields["credential_title"], in: app)
    app.textFields["credential_title"].typeText("Website login")
    tap(app.textFields["credential_username"], in: app)
    app.textFields["credential_username"].typeText("alice")
    tap(app.buttons["openWebsites"], in: app)
    tap(app.buttons["addWebsite"], in: app)
    tap(app.textFields["websiteValue_0"], in: app)
    app.textFields["websiteValue_0"].typeText("example.com/login")
    tap(app.buttons["websiteMode_0"], in: app)
    app.buttons["Exact URL"].tap()
    attach(app, name: "Website matching mode in creation draft")
    tap(app.buttons["saveWebsites"], in: app)
    tap(app.buttons["saveCredential"], in: app)
    XCTAssertTrue(app.staticTexts["Website login"].waitForExistence(timeout: 15))
    tap(
      app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_"))
        .firstMatch, in: app)
    XCTAssertTrue(app.staticTexts["https://example.com/login"].waitForExistence(timeout: 10))
    // The page only lists websites; they are changed from the edit form.
    XCTAssertFalse(app.buttons["openWebsites"].exists)
    tap(app.buttons["editCredential"], in: app)
    tap(app.buttons["openWebsites"], in: app)
    XCTAssertTrue(app.buttons["websiteMode_0"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["websiteMode_0"].label.contains("Exact URL"))
    tap(app.buttons["addWebsite"], in: app)
    tap(app.textFields["websiteValue_1"], in: app)
    app.textFields["websiteValue_1"].typeText("[")
    tap(app.buttons["websiteMode_1"], in: app)
    app.buttons["Regular expression"].tap()
    tap(app.buttons["saveWebsites"], in: app)
    XCTAssertTrue(app.staticTexts["websiteError_1"].waitForExistence(timeout: 10))
    attach(app, name: "Website rule validation keeps saved rule and focuses invalid row")
    tap(app.buttons["removeWebsite_1"], in: app)
    tap(app.buttons["websiteMode_0"], in: app)
    app.buttons["Exact host"].tap()
    tap(app.buttons["saveWebsites"], in: app)
    XCTAssertTrue(app.buttons["saveWebsites"].waitForNonExistence(timeout: 10))
    tap(app.buttons["openWebsites"], in: app)
    XCTAssertTrue(app.buttons["websiteMode_0"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["websiteMode_0"].label.contains("Exact host"))
    attach(app, name: "Saved website mode after reopening")
    tap(app.buttons["removeWebsite_0"], in: app)
    tap(app.buttons["saveWebsites"], in: app)
    XCTAssertTrue(app.buttons["saveWebsites"].waitForNonExistence(timeout: 10))
    // The websites are already saved, which moved the entry's revision; the form's own save
    // must carry the new one instead of failing as a conflict.
    replace(app.textFields["edit_username"], with: "bob", in: app)
    tap(app.buttons["saveCredentialEdit"], in: app)
    XCTAssertTrue(app.buttons["saveCredentialEdit"].waitForNonExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["bob"].waitForExistence(timeout: 10))
    waitEnabled(app.buttons["editCredential"])
    XCTAssertFalse(app.staticTexts["https://example.com/login"].exists)
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }

  @MainActor
  func testCatalogGroupingPreservesFiltersAndDetailReturn() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-grouping-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    for (title, website) in [("Mail login", "https://www.example.com"), ("Other login", "")] {
      tap(app.buttons["addCredential"], in: app)
      tap(app.textFields["credential_title"], in: app)
      app.textFields["credential_title"].typeText(title)
      if !website.isEmpty {
        tap(app.buttons["openWebsites"], in: app)
        tap(app.buttons["addWebsite"], in: app)
        tap(app.textFields["websiteValue_0"], in: app)
        app.textFields["websiteValue_0"].typeText(website)
        tap(app.buttons["saveWebsites"], in: app)
      }
      tap(app.buttons["saveCredential"], in: app)
      XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 15))
    }
    chooseGrouping("Website", in: app)
    XCTAssertTrue(app.staticTexts["credentialSection_example.com"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["credentialSection_"].exists)
    attach(app, name: "Native catalog grouped by website")
    tap(
      app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_"))
        .firstMatch, in: app)
    waitEnabled(app.buttons["editCredential"])
    app.navigationBars["Credential"].buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.staticTexts["credentialSection_example.com"].waitForExistence(timeout: 10))
    chooseGrouping("Date modified", in: app)
    XCTAssertTrue(app.staticTexts["credentialSection_today"].waitForExistence(timeout: 10))
    attach(app, name: "Native catalog grouped by modification time")
    chooseGrouping("One-time codes", in: app)
    XCTAssertTrue(app.staticTexts["credentialSection_basic"].waitForExistence(timeout: 10))
    tap(app.buttons["catalogOptions"], in: app)
    app.buttons["With one-time codes"].tap()
    XCTAssertTrue(app.staticTexts["credentialsNoMatches"].waitForExistence(timeout: 10))
    tap(app.buttons["clearCredentialFilters"], in: app)
    XCTAssertTrue(app.staticTexts["credentialSection_basic"].waitForExistence(timeout: 10))
    attach(app, name: "Native OTP grouping survives clearing filters")
    chooseGrouping("No grouping", in: app)
    XCTAssertTrue(app.staticTexts["Mail login"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["credentialSection_basic"].exists)
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }

  @MainActor
  func testSecurityAuditFindsReuseAndKeepsDetailReturnRoute() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-audit-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    for title in ["Audit mail", "Audit forum"] {
      tap(app.buttons["addCredential"], in: app)
      focus(app.textFields["credential_title"], in: app)
      app.textFields["credential_title"].typeText(title)
      focus(app.secureTextFields["credential_password"], in: app)
      app.secureTextFields["credential_password"].typeText("abc")
      tap(app.buttons["saveCredential"], in: app)
      XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 15))
    }
    openVaultTool("openSecurityAudit", in: app)
    let row = app.buttons.matching(
      NSPredicate(format: "identifier BEGINSWITH %@", "auditCredential_")
    ).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 15))
    attach(app, name: "Native security audit overview")
    tap(app.buttons["auditFilter"], in: app)
    app.buttons["Reused passwords"].tap()
    XCTAssertTrue(row.waitForExistence(timeout: 15))
    tap(row, in: app)
    waitEnabled(app.buttons["editCredential"])
    app.navigationBars["Credential"].buttons.element(boundBy: 0).tap()
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["auditFilter"].label.contains("Reused passwords"))
    attach(app, name: "Native audit reused passwords after Back")
    tap(row, in: app)
    tap(app.buttons["editCredential"], in: app)
    let editedPassword = app.secureTextFields["edit_password"]
    XCTAssertTrue(editedPassword.waitForExistence(timeout: 10))
    focus(editedPassword, in: app)
    editedPassword.typeText("Unique-Synthetic-Password!2026")
    app.buttons["saveCredentialEdit"].tap()
    XCTAssertTrue(app.buttons["saveCredentialEdit"].waitForNonExistence(timeout: 15))
    app.navigationBars["Credential"].buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.staticTexts["No credentials match this check."].waitForExistence(timeout: 15))
    attach(app, name: "Native audit refreshed after password change")
    tap(app.buttons["auditFilter"], in: app)
    app.buttons["Not checked"].tap()
    XCTAssertTrue(app.staticTexts["No credentials match this check."].waitForExistence(timeout: 15))
    app.navigationBars["Security audit"].buttons["Done"].tap()
    XCTAssertTrue(app.buttons["vaultTools"].waitForExistence(timeout: 10))
    openVaultTool("openSecurityAudit", in: app)
    XCTAssertTrue(row.waitForExistence(timeout: 15))
    tap(row, in: app)
    XCTAssertTrue(
      app.navigationBars["Credential"].buttons["lockVault"].waitForExistence(timeout: 10))
    tap(app.navigationBars["Credential"].buttons["lockVault"], in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["Audit mail"].exists)
  }

  @MainActor
  private func chooseGrouping(_ label: String, in app: XCUIApplication) {
    tap(app.buttons["catalogOptions"], in: app)
    app.buttons["Group by"].tap()
    app.buttons[label].tap()
  }

  @MainActor
  func testTagCatalogCreateRenameFilterAndDelete() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-tags-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    openVaultTool("browseTags", in: app)
    XCTAssertTrue(app.staticTexts["No tags yet"].waitForExistence(timeout: 10))
    tap(app.buttons["addTag"], in: app)
    tap(app.buttons["saveTag"], in: app)
    XCTAssertTrue(app.staticTexts["Enter a tag name."].waitForExistence(timeout: 5))
    let name = app.textFields["tagName"]
    focus(name, in: app)
    name.typeText("Личное")
    tap(app.buttons["tagColor"], in: app)
    app.buttons["Blue"].tap()
    tap(app.buttons["saveTag"], in: app)
    XCTAssertTrue(app.buttons["chooseTag_личное"].waitForExistence(timeout: 10))
    attach(app, name: "Native tag catalog")
    tap(app.buttons["tagActions_личное"], in: app)
    app.buttons["Edit tag"].tap()
    replace(name, with: "Работа", in: app)
    tap(app.buttons["saveTag"], in: app)
    XCTAssertTrue(app.buttons["chooseTag_работа"].waitForExistence(timeout: 10))
    tap(app.buttons["chooseTag_работа"], in: app)
    XCTAssertTrue(app.staticTexts["credentialsNoMatches"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["clearTagFilter"].exists)
    attach(app, name: "Native exact tag filter")
    openVaultTool("browseTags", in: app)
    tap(app.buttons["tagActions_работа"], in: app)
    app.buttons["Delete tag"].tap()
    app.alerts.buttons["Cancel"].tap()
    XCTAssertTrue(app.alerts.firstMatch.waitForNonExistence(timeout: 5))
    XCTAssertTrue(app.buttons["chooseTag_работа"].exists)
    tap(app.buttons["tagActions_работа"], in: app)
    app.buttons["Delete tag"].tap()
    tap(app.alerts.firstMatch.buttons["confirmDeleteTag"].firstMatch, in: app)
    XCTAssertTrue(app.staticTexts["No tags yet"].waitForExistence(timeout: 10))
    tap(app.buttons["closeTags"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["clearTagFilter"].exists)
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }

  @MainActor
  func testSelectCredentialsCancelThenDeleteWithResults() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-selection-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["addCredential"].waitForExistence(timeout: 20))
    for title in ["Batch Alpha", "Batch Beta"] {
      tap(app.buttons["addCredential"], in: app)
      let name = app.textFields["credential_title"]
      focus(name, in: app)
      name.typeText(title)
      tap(app.buttons["saveCredential"], in: app)
      XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 15))
    }
    openVaultTool("selectCredentials", in: app)
    let entries = app.buttons.matching(
      NSPredicate(format: "identifier BEGINSWITH %@", "selectCredential_"))
    XCTAssertTrue(entries.element(boundBy: 1).waitForExistence(timeout: 10))
    tap(entries.element(boundBy: 0), in: app)
    tap(entries.element(boundBy: 1), in: app)
    XCTAssertEqual(app.staticTexts["selectedCredentialCount"].label, "Selected: 2")
    attach(app, name: "Native multiple credential selection")
    tap(app.buttons["deleteSelectedCredentials"], in: app)
    app.alerts.buttons["Cancel"].tap()
    XCTAssertTrue(app.alerts.firstMatch.waitForNonExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["selectedCredentialCount"].label, "Selected: 2")
    tap(app.buttons["deleteSelectedCredentials"], in: app)
    tap(app.alerts.firstMatch.buttons["confirmDeleteSelectedCredentials"].firstMatch, in: app)
    XCTAssertTrue(app.navigationBars["Deletion results"].waitForExistence(timeout: 15))
    XCTAssertEqual(app.staticTexts["deletedCredentialCount"].label, "Deleted: 2")
    XCTAssertTrue(app.staticTexts["Batch Alpha"].exists)
    XCTAssertTrue(app.staticTexts["Batch Beta"].exists)
    attach(app, name: "Native batch deletion results")
    tap(app.buttons["closeCredentialSelection"], in: app)
    XCTAssertTrue(app.staticTexts["emptyVault"].waitForExistence(timeout: 15))
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }

  @MainActor
  func testChooseGroupDuringCredentialCreation() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-create-group-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["addCredential"].waitForExistence(timeout: 20))
    tap(app.buttons["addCredential"], in: app)
    let name = app.textFields["credential_title"]
    focus(name, in: app)
    name.typeText("Grouped login")
    tap(app.buttons["chooseEntryGroup"], in: app)
    XCTAssertTrue(app.buttons["pickGroup_/"].waitForExistence(timeout: 10))
    attach(app, name: "Native creation group picker")
    createGroup("Personal", in: app)
    XCTAssertTrue(app.textFields["credential_group"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.textFields["credential_group"].value as? String, "/Personal")
    // Reopening shows the tree with the chosen group ticked; the root row switches back.
    tap(app.buttons["chooseEntryGroup"], in: app)
    XCTAssertTrue(app.buttons["pickGroup_/Personal"].waitForExistence(timeout: 10))
    tap(app.buttons["closeGroups"], in: app)
    XCTAssertEqual(app.textFields["credential_group"].value as? String, "/Personal")
    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
    attach(app, name: "Native creation selected group")
    tap(app.buttons["saveCredential"], in: app)
    XCTAssertTrue(app.buttons["openGroup_/Personal"].waitForExistence(timeout: 15))
    tap(app.buttons["openGroup_/Personal"], in: app)
    XCTAssertTrue(app.navigationBars["Personal"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Grouped login"].waitForExistence(timeout: 10))
    attach(app, name: "Native group screen")
    tap(
      app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_"))
        .firstMatch, in: app)
    // The Details box sits at the bottom of the page; List rows exist only once scrolled in.
    XCTAssertTrue(app.staticTexts["credentialDetailTitle"].waitForExistence(timeout: 10))
    let group = app.staticTexts["/Personal"]
    for _ in 0..<6 where !group.exists { scrollUp(in: app) }
    XCTAssertTrue(group.exists)
    app.navigationBars["Credential"].buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars["Personal"].waitForExistence(timeout: 10))
    app.navigationBars["Personal"].buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.buttons["openGroup_/Personal"].waitForExistence(timeout: 10))
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }

  @MainActor
  func testAssignTagsDuringCreationAndEditing() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-assignment-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    tap(app.buttons["addCredential"], in: app)
    let name = app.textFields["credential_title"]
    focus(name, in: app)
    name.typeText("Tagged login")
    tap(app.buttons["chooseEntryTags"], in: app)
    tap(app.buttons["addTag"], in: app)
    focus(app.textFields["tagName"], in: app)
    app.textFields["tagName"].typeText("Work")
    tap(app.buttons["saveTag"], in: app)
    XCTAssertTrue(app.buttons["chooseTag_work"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.buttons["tagActions_work"].exists)
    tap(app.buttons["chooseTag_work"], in: app)
    attach(app, name: "Native draft tag selection")
    tap(app.buttons["applyTags"], in: app)
    XCTAssertTrue(app.buttons["chooseEntryTags"].waitForExistence(timeout: 5))
    tap(app.buttons["saveCredential"], in: app)
    XCTAssertTrue(app.staticTexts["Tagged login"].waitForExistence(timeout: 15))
    openVaultTool("browseTags", in: app)
    tap(app.buttons["chooseTag_work"], in: app)
    XCTAssertTrue(app.staticTexts["Tagged login"].waitForExistence(timeout: 10))
    tap(
      app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_"))
        .firstMatch, in: app)
    tap(app.buttons["editCredential"], in: app)
    tap(app.buttons["chooseEntryTags"], in: app)
    tap(app.buttons["chooseTag_work"], in: app)
    tap(app.buttons["closeTags"], in: app)
    XCTAssertTrue(app.buttons["chooseEntryTags"].label.contains("Work"))
    tap(app.buttons["chooseEntryTags"], in: app)
    tap(app.buttons["chooseTag_work"], in: app)
    tap(app.buttons["applyTags"], in: app)
    attach(app, name: "Native metadata draft cleared tags")
    tap(app.buttons["saveCredentialEdit"], in: app)
    waitEnabled(app.buttons["editCredential"])
    // Return to the filtered catalog; removing the assignment removes the match.
    app.navigationBars["Credential"].buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.staticTexts["credentialsNoMatches"].waitForExistence(timeout: 10))
    attach(app, name: "Native cleared assignment exact filter")
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }

  @MainActor
  func testOneTimeCodeManualLifecycle() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-otp-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    tap(app.buttons["addCredential"], in: app)
    focus(app.textFields["credential_title"], in: app)
    app.textFields["credential_title"].typeText("OTP test login")
    tap(app.buttons["saveCredential"], in: app)
    XCTAssertTrue(app.staticTexts["OTP test login"].waitForExistence(timeout: 15))
    tap(
      app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_"))
        .firstMatch, in: app)
    XCTAssertFalse(app.buttons["openOTP"].exists)
    tap(app.buttons["editCredential"], in: app)
    tap(app.buttons["openOTP"], in: app)
    tap(app.buttons["addOTP"], in: app)
    tap(app.buttons["manualOTP"], in: app)
    tap(app.buttons["saveOTP"], in: app)
    attach(app, name: "Native OTP submit validation")
    XCTAssertTrue(app.staticTexts["otpIssue"].waitForExistence(timeout: 5))
    focus(app.textFields["otpName"], in: app)
    app.textFields["otpName"].typeText("Main code")
    focus(app.secureTextFields["otpSeed"], in: app)
    app.secureTextFields["otpSeed"].typeText("JBSWY3DPEHPK3PXP")
    attach(app, name: "Native OTP manual setup")
    tap(app.buttons["saveOTP"], in: app)
    // Codes are live as soon as they are listed; nothing to reveal.
    XCTAssertTrue(app.staticTexts["otpValue"].waitForExistence(timeout: 15))
    attach(app, name: "Native OTP generated code")
    tap(app.buttons["copyOTP_Main code"], in: app)
    XCTAssertTrue(app.staticTexts["otpCopied"].waitForExistence(timeout: 10))
    tap(app.buttons["otpActions_Main code"], in: app)
    tap(app.buttons["editOTP_Main code"], in: app)
    attach(app, name: "Native OTP rename form")
    replace(app.textFields["otpName"], with: "Renamed code", in: app)
    tap(app.buttons["saveOTP"], in: app)
    XCTAssertTrue(app.buttons["otpActions_Renamed code"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["otpValue"].waitForExistence(timeout: 10))
    attach(app, name: "Native code manager")
    // Closing the manager and the form brings the code onto the page with its remaining time.
    tap(app.buttons["Done"], in: app)
    tap(app.buttons["cancelCredentialEdit"], in: app)
    XCTAssertTrue(app.staticTexts["otpInlineValue"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.otherElements["otpInlineCountdown"].exists)
    XCTAssertFalse(app.staticTexts["secretValue_password"].exists)
    attach(app, name: "Native credential page with inline code")
    tap(app.buttons["copyOTPInline_Renamed code"], in: app)
    XCTAssertTrue(app.staticTexts["credentialCopied"].waitForExistence(timeout: 5))
    // The Codes collection at the root lists the same live code.
    app.navigationBars["Credential"].buttons.element(boundBy: 0).tap()
    tap(app.buttons["openCodes"], in: app)
    XCTAssertTrue(app.navigationBars["Codes"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["otpInlineValue"].waitForExistence(timeout: 15))
    attach(app, name: "Native codes list")
    tap(
      app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCodesEntry_"))
        .firstMatch, in: app)
    waitEnabled(app.buttons["editCredential"])
    tap(app.buttons["editCredential"], in: app)
    tap(app.buttons["openOTP"], in: app)
    XCTAssertTrue(app.buttons["otpActions_Renamed code"].waitForExistence(timeout: 15))
    tap(app.buttons["otpActions_Renamed code"], in: app)
    tap(app.buttons["deleteOTP_Renamed code"], in: app)
    tap(app.alerts.firstMatch.buttons["confirmDeleteOTP"].firstMatch, in: app)
    XCTAssertTrue(app.staticTexts["No one-time codes"].waitForExistence(timeout: 10))
    attach(app, name: "Native OTP removed")
    tap(app.buttons["Done"], in: app)
    tap(app.buttons["cancelCredentialEdit"], in: app)
    // Without codes the page has no codes section at all.
    waitEnabled(app.buttons["editCredential"])
    XCTAssertFalse(app.staticTexts["otpInlineValue"].exists)
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }

  @MainActor
  func testImportOneTimeCodeReviewsBeforeSaving() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-otp-import-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    tap(app.buttons["addCredential"], in: app)
    focus(app.textFields["credential_title"], in: app)
    app.textFields["credential_title"].typeText("Imported OTP login")
    tap(app.buttons["saveCredential"], in: app)
    XCTAssertTrue(app.staticTexts["Imported OTP login"].waitForExistence(timeout: 15))
    tap(
      app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_"))
        .firstMatch, in: app)
    tap(app.buttons["editCredential"], in: app)
    tap(app.buttons["openOTP"], in: app)
    openOTPImport(app)
    tap(app.buttons["reviewOTPImport"], in: app)
    XCTAssertTrue(app.staticTexts["otpImportIssue"].waitForExistence(timeout: 5))
    tap(app.buttons["scanOTP"], in: app)
    // The simulator has no VisionKit live camera. Its normal fallback stays usable.
    XCTAssertTrue(
      app.staticTexts["QR scanning is unavailable on this device. Paste the setup link instead."]
        .waitForExistence(timeout: 5))
    focus(app.secureTextFields["otpURI"], in: app)
    app.secureTextFields["otpURI"].typeText("https://example.com")
    tap(app.buttons["reviewOTPImport"], in: app)
    XCTAssertTrue(app.staticTexts["otpImportIssue"].waitForExistence(timeout: 10))
    tap(app.buttons["cancelOTPImport"], in: app)
    for save in [false, true] {
      openOTPImport(app)
      focus(app.secureTextFields["otpURI"], in: app)
      app.secureTextFields["otpURI"].typeText(
        "otpauth://totp/Acme:alice?secret=JBSWY3DPEHPK3PXP&issuer=Acme")
      tap(app.buttons["reviewOTPImport"], in: app)
      XCTAssertTrue(app.textFields["otpName"].waitForExistence(timeout: 10))
      XCTAssertTrue(app.staticTexts["Service, Acme"].exists)
      XCTAssertTrue(app.staticTexts["Account, alice"].exists)
      attach(app, name: "Native imported OTP review")
      if save {
        tap(app.buttons["saveOTP"], in: app)
        XCTAssertTrue(app.buttons["otpActions_alice"].waitForExistence(timeout: 15))
      } else {
        tap(app.buttons["Cancel"].firstMatch, in: app)
        XCTAssertTrue(app.staticTexts["No one-time codes"].waitForExistence(timeout: 10))
      }
    }
    XCTAssertTrue(app.staticTexts["otpValue"].waitForExistence(timeout: 10))
    attach(app, name: "Native imported OTP saved")
    tap(app.buttons["Done"], in: app)
    tap(app.buttons["cancelCredentialEdit"], in: app)
    XCTAssertTrue(app.staticTexts["otpInlineValue"].waitForExistence(timeout: 15))
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }
  @MainActor
  private func openOTPImport(_ app: XCUIApplication) {
    tap(app.buttons["addOTP"], in: app)
    tap(app.buttons["importOTP"], in: app)
    XCTAssertTrue(app.buttons["reviewOTPImport"].waitForExistence(timeout: 5))
  }

  @MainActor
  func testPasswordGeneratorAppliesOnlyToDraftUntilSaved() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("synthetic-generator-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["lockVault"].firstMatch.waitForExistence(timeout: 20))
    tap(app.buttons["addCredential"], in: app)
    focus(app.textFields["credential_title"], in: app)
    app.textFields["credential_title"].typeText("Generated login")
    tap(app.secureTextFields["credential_password"], in: app)
    app.secureTextFields["credential_password"].typeText("keep-this-draft")
    tap(app.buttons["openPasswordGenerator"], in: app)
    tap(app.buttons["generatePassword"], in: app)
    XCTAssertTrue(app.staticTexts["generatedPassword"].waitForExistence(timeout: 10))
    tap(app.buttons["cancelGenerator"], in: app)
    tap(app.buttons["reveal_password"], in: app)
    XCTAssertEqual(app.textFields["credential_password"].value as? String, "keep-this-draft")
    tap(app.buttons["openPasswordGenerator"], in: app)
    tap(app.buttons["useGeneratedPassword"], in: app)
    XCTAssertTrue(app.staticTexts["generatorIssue"].waitForExistence(timeout: 5))
    for name in ["generatorLowercase", "generatorUppercase", "generatorDigits"] {
      setGeneratorSwitch(name, to: false, in: app)
    }
    tap(app.buttons["generatePassword"], in: app)
    XCTAssertTrue(
      app.staticTexts["Choose at least one character type."].waitForExistence(timeout: 5))
    setGeneratorSwitch("generatorDigits", to: true, in: app)
    tap(app.buttons["generatePassword"], in: app)
    XCTAssertTrue(app.staticTexts["generatedPassword"].waitForExistence(timeout: 10))
    tap(app.buttons["revealGeneratedPassword"], in: app)
    let generated = app.staticTexts["generatedPassword"].label
    XCTAssertEqual(generated.count, 16)
    XCTAssertTrue(generated.allSatisfy { $0.isASCII && $0.isNumber })
    attach(app, name: "Native password generator preview")
    tap(app.buttons["useGeneratedPassword"], in: app)
    XCTAssertTrue(app.buttons["useGeneratedPassword"].waitForNonExistence(timeout: 5))
    tap(app.buttons["reveal_password"], in: app)
    XCTAssertEqual(app.textFields["credential_password"].value as? String, generated)
    tap(app.buttons["saveCredential"], in: app)
    XCTAssertTrue(app.staticTexts["Generated login"].waitForExistence(timeout: 15))
    tap(
      app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_"))
        .firstMatch, in: app)
    tap(app.buttons["showSecret_password"], in: app)
    XCTAssertTrue(app.staticTexts["secretValue_password"].waitForExistence(timeout: 10))
    XCTAssertEqual(app.staticTexts["secretValue_password"].label, generated)
    tap(app.buttons["editCredential"], in: app)
    tap(app.buttons["openPasswordGenerator"], in: app)
    setGeneratorSwitch("generatorSymbols", to: true, in: app)
    tap(app.buttons["generatePassword"], in: app)
    XCTAssertTrue(app.staticTexts["generatedPassword"].waitForExistence(timeout: 10))
    tap(app.buttons["revealGeneratedPassword"], in: app)
    let replacement = app.staticTexts["generatedPassword"].label
    XCTAssertEqual(replacement.count, 16)
    XCTAssertTrue(replacement.contains { $0.isLetter })
    tap(app.buttons["useGeneratedPassword"], in: app)
    tap(app.buttons["reveal_password"], in: app)
    XCTAssertEqual(app.textFields["edit_password"].value as? String, replacement)
    attach(app, name: "Native generated password in editor")
    tap(app.buttons["saveCredentialEdit"], in: app)
    XCTAssertTrue(app.buttons["saveCredentialEdit"].waitForNonExistence(timeout: 15))
    tap(app.buttons["showSecret_password"], in: app)
    XCTAssertTrue(app.staticTexts["secretValue_password"].waitForExistence(timeout: 10))
    XCTAssertEqual(app.staticTexts["secretValue_password"].label, replacement)
    tap(app.buttons["lockVault"].firstMatch, in: app)
    XCTAssertTrue(password.waitForExistence(timeout: 10))
  }

  @MainActor
  private func setGeneratorSwitch(_ identifier: String, to enabled: Bool, in app: XCUIApplication) {
    let control = app.switches[identifier]
    XCTAssertTrue(control.waitForExistence(timeout: 5))
    // SwiftUI exposes the whole labeled row as a switch; activate its visible trailing control.
    control.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
    XCTAssertEqual(control.value as? String, enabled ? "1" : "0")
  }

  @MainActor
  func testSSHCreateEditExportDeleteAndLock() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("air-ssh-ui-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["openSSHKeys"].waitForExistence(timeout: 20))
    tap(app.buttons["openSSHKeys"], in: app)
    XCTAssertTrue(app.staticTexts["No SSH keys yet"].waitForExistence(timeout: 10))
    attach(app, name: "Native SSH empty catalog")
    tap(app.buttons["addSSHKey"], in: app)
    let name = app.textFields["sshName"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Development server")
    attach(app, name: "Native SSH generation form")
    app.buttons["saveSSHKey"].tap()
    let key = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "sshKey_"))
      .firstMatch
    XCTAssertTrue(key.waitForExistence(timeout: 20))
    tap(key, in: app)
    XCTAssertTrue(app.buttons["copySSHPublic"].waitForExistence(timeout: 5))
    tap(app.buttons["copySSHPublic"], in: app)
    XCTAssertTrue(app.buttons["Copied"].waitForExistence(timeout: 10))
    tap(app.buttons["editSSHKey"], in: app)
    let edit = app.textFields["editSSHName"]
    replace(edit, with: "Production server", in: app)
    tap(app.buttons["saveSSHEdit"], in: app)
    XCTAssertTrue(app.staticTexts["Production server"].waitForExistence(timeout: 10))
    attach(app, name: "Native SSH key detail")
    tap(app.buttons["exportSSHPrivate"], in: app)
    tap(app.buttons["saveSSHExport"], in: app)
    XCTAssertTrue(app.buttons["Export unencrypted"].waitForExistence(timeout: 5))
    attach(app, name: "Native SSH explicit private export confirmation")
    app.alerts.firstMatch.buttons["cancelSSHPlaintext"].firstMatch.tap()
    let phrase = app.secureTextFields["sshExportPassphrase"]
    focus(phrase, in: app)
    phrase.typeText("synthetic-export-passphrase")
    tap(app.buttons["saveSSHExport"], in: app)
    XCTAssertTrue(app.buttons["Save"].waitForExistence(timeout: 15))
    attach(app, name: "Native SSH system export picker")
    app.buttons["Save"].firstMatch.tap()
    XCTAssertTrue(app.buttons["deleteSSHKey"].waitForExistence(timeout: 10))
    tap(app.buttons["deleteSSHKey"], in: app)
    app.alerts.firstMatch.buttons["confirmDeleteSSH"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["No SSH keys yet"].waitForExistence(timeout: 10))
    tap(app.buttons["addSSHKey"], in: app)
    app.segmentedControls["sshCreationMode"].buttons["Import"].tap()
    app.buttons["saveSSHKey"].tap()
    XCTAssertTrue(app.staticTexts["sshCreationIssue"].waitForExistence(timeout: 5))
    let input = app.textViews["sshPrivateKey"]
    input.typeText("invalid synthetic key")
    app.buttons["saveSSHKey"].tap()
    XCTAssertTrue(
      app.staticTexts["Couldn’t save this key. Check its format, passphrase and linked credential."]
        .waitForExistence(timeout: 10))
    attach(app, name: "Native SSH import validation")
    app.navigationBars["Add SSH key"].buttons["Cancel"].tap()
    app.alerts.firstMatch.buttons["Discard"].firstMatch.tap()
    // The pushed screen's toolbar is not hittable while the previous presentation settles.
    tap(app.navigationBars["SSH keys"].buttons["Lock vault"], in: app)
    XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 15))
    XCTAssertFalse(app.textViews["sshPrivateKey"].exists)
    attach(app, name: "Native SSH locked return")
  }

  @MainActor
  func testSSHKeysStandAloneFromCredentials() {
    let app = XCUIApplication()
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("air-ssh-catalog-ui-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["addCredential"].waitForExistence(timeout: 20))
    tap(app.buttons["addCredential"], in: app)
    focus(app.textFields["credential_title"], in: app)
    app.textFields["credential_title"].typeText("Infrastructure login")
    tap(app.buttons["saveCredential"], in: app)
    let entry = app.buttons.matching(
      NSPredicate(format: "identifier BEGINSWITH %@", "openCredential_")
    ).firstMatch
    XCTAssertTrue(entry.waitForExistence(timeout: 15))
    tap(entry, in: app)
    // The credential page has no SSH entry point: keys are their own catalog.
    waitEnabled(app.buttons["editCredential"])
    XCTAssertFalse(app.buttons["openCredentialSSH"].exists)
    attach(app, name: "Native credential page without SSH")
    app.navigationBars["Credential"].buttons.firstMatch.tap()
    XCTAssertTrue(app.buttons["openSSHKeys"].waitForExistence(timeout: 10))
    tap(app.buttons["openSSHKeys"], in: app)
    XCTAssertTrue(app.staticTexts["No SSH keys yet"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["Keys linked to this credential"].exists)
    tap(app.buttons["addSSHKey"], in: app)
    focus(app.textFields["sshName"], in: app)
    app.textFields["sshName"].typeText("Infrastructure server key")
    app.buttons["saveSSHKey"].tap()
    let key = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "sshKey_"))
      .firstMatch
    XCTAssertTrue(key.waitForExistence(timeout: 20))
    tap(app.buttons["sshTypeFilter"], in: app)
    app.buttons["RSA"].tap()
    XCTAssertTrue(app.staticTexts["No matching SSH keys"].waitForExistence(timeout: 10))
    tap(app.buttons["clearSSHFilters"], in: app)
    XCTAssertTrue(key.waitForExistence(timeout: 10))
    // The vault's own search field stays in the hierarchy under the sheet; pick the sheet's.
    let search = app.searchFields.matching(
      NSPredicate(format: "placeholderValue CONTAINS %@", "fingerprint")
    ).firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    search.tap()
    search.typeText("Infrastructure")
    XCTAssertTrue(key.waitForExistence(timeout: 10))
    attach(app, name: "Native SSH catalog search")
    tap(key, in: app)
    XCTAssertTrue(app.buttons["copySSHPublic"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["openSSHSource"].exists)
    attach(app, name: "Native SSH key detail without source")
    app.navigationBars["SSH key"].buttons["SSH keys"].tap()
    endSearch(in: app)
    tap(app.navigationBars["SSH keys"].buttons["Lock vault"], in: app)
    XCTAssertTrue(app.secureTextFields["accessPassword"].waitForExistence(timeout: 15))
  }

  @MainActor
  private func launchLockedFixture(_ app: XCUIApplication) -> XCUIElement {
    app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    XCTAssertTrue(app.navigationBars["ChromVoid Air"].waitForExistence(timeout: 20))
    let password = app.secureTextFields["accessPassword"]
    let welcome = app.buttons["continueWelcome"]
    if welcome.waitForExistence(timeout: 3) {
      attach(app, name: "Native welcome")
      tap(welcome, in: app)
    }
    XCTAssertTrue(password.waitForExistence(timeout: 15))
    let confirmation = app.secureTextFields["accessConfirmation"]
    if confirmation.exists {
      tap(app.buttons["submitAccess"], in: app)
      XCTAssertTrue(app.staticTexts["Enter a password."].exists)
      password.tap()
      password.typeText("air-synthetic-ui-administrator")
      confirmation.tap()
      confirmation.typeText("air-synthetic-ui-administrator")
      tap(app.buttons["submitAccess"], in: app)
      XCTAssertTrue(app.buttons["Open vault"].waitForExistence(timeout: 20))
    }
    return password
  }

  /// Launches the host on an offline wallet fixture runtime (`setup` or `send`) and unlocks a
  /// fresh vault through the ordinary access screen, administrator setup included.
  @MainActor
  private func unlockWalletFixture(_ app: XCUIApplication, fixture: String) {
    app.launchEnvironment["AIR_TEST_WALLET_FIXTURE"] = fixture
    let password = launchLockedFixture(app)
    password.tap()
    password.typeText("air-synthetic-wallet-" + UUID().uuidString)
    tap(app.buttons["submitAccess"], in: app)
    XCTAssertTrue(app.buttons["openWallet"].waitForExistence(timeout: 20))
  }

  /// From the vault root: opens the wallet, creates a universal wallet through the Add wallet
  /// menu and waits for its card and TON network row.
  @MainActor
  private func createWallet(named name: String, in app: XCUIApplication) {
    tap(app.buttons["openWallet"], in: app)
    let add = app.navigationBars["Wallet"].buttons["Add wallet"]
    XCTAssertTrue(add.waitForExistence(timeout: 15))
    waitUntilEnabled(add)
    add.tap()
    let create = app.buttons["Create wallet"]
    XCTAssertTrue(create.waitForExistence(timeout: 5))
    create.tap()
    let form = app.collectionViews["walletSetupForm"]
    XCTAssertTrue(form.waitForExistence(timeout: 10))
    // The name is the first (and only required) field of the create form.
    let label = form.textFields.firstMatch
    XCTAssertTrue(label.waitForExistence(timeout: 5))
    tap(label, in: app)
    label.typeText(name)
    attach(app, name: "Native wallet setup form")
    tap(app.buttons["saveWalletSetup"], in: app)
    // Phrase generation and key derivation run through debug-profile Rust on the simulator.
    XCTAssertTrue(form.waitForNonExistence(timeout: 90))
    XCTAssertTrue(app.buttons["walletAsset-ton"].waitForExistence(timeout: 30))
    XCTAssertTrue(
      app.descendants(matching: .any).matching(identifier: "walletCards").firstMatch.exists)
    XCTAssertTrue(app.staticTexts[name].exists)
  }

  /// Toolbar controls stay disabled until their model has loaded; wait for that instead of
  /// tapping a disabled control.
  @MainActor
  private func waitUntilEnabled(_ element: XCUIElement, timeout: TimeInterval = 15) {
    let enabled = expectation(
      for: NSPredicate(format: "isEnabled == true"), evaluatedWith: element)
    wait(for: [enabled], timeout: timeout)
  }

  /// Pops a pushed screen by its navigation bar; the back button is labelled after the
  /// previous title, so match the system identifier first and fall back to the leading button.
  @MainActor
  private func popScreen(titled title: String, in app: XCUIApplication) {
    let bar = app.navigationBars[title]
    XCTAssertTrue(bar.waitForExistence(timeout: 5))
    let back = bar.buttons["BackButton"]
    tap(back.exists ? back : bar.buttons.element(boundBy: 0), in: app)
  }

  @MainActor
  /// In the group picker: creates a group inside the ticked one; the picker closes with it chosen.
  private func createGroup(_ name: String, in app: XCUIApplication) {
    tap(app.buttons["addGroup"], in: app)
    typeGroupName(name, in: app)
    XCTAssertTrue(app.buttons["closeGroups"].waitForNonExistence(timeout: 10))
  }

  /// On the vault screen: holds `+` for the menu and creates a group in the current one.
  @MainActor
  private func createGroupHere(_ name: String, in app: XCUIApplication) {
    app.buttons["addCredential"].press(forDuration: 1.0)
    tap(app.buttons["addGroup"], in: app)
    typeGroupName(name, in: app)
  }

  /// Alert text fields carry no identifiers: fill the group-name alert and save it.
  @MainActor
  private func typeGroupName(_ name: String, in app: XCUIApplication) {
    let alert = app.alerts.firstMatch
    XCTAssertTrue(alert.waitForExistence(timeout: 5))
    let input = alert.textFields.firstMatch
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.tap()
    if let current = input.value as? String, !current.isEmpty {
      input.tap(withNumberOfTaps: 3, numberOfTouches: 1)
    }
    input.typeText(name)
    // SwiftUI exposes alert buttons twice; tap the one that can take the touch.
    let saves = alert.buttons.matching(identifier: "saveGroup").allElementsBoundByIndex
    XCTAssertFalse(saves.isEmpty)
    (saves.first(where: { $0.isHittable }) ?? saves[0]).tap()
    XCTAssertTrue(alert.waitForNonExistence(timeout: 10))
  }

  /// Opens one of the tools behind the vault's `⋯` menu.
  @MainActor
  private func openVaultTool(_ identifier: String, in app: XCUIApplication) {
    tap(app.buttons["vaultTools"], in: app)
    let item = app.buttons[identifier]
    XCTAssertTrue(item.waitForExistence(timeout: 5))
    item.tap()
  }

  /// Long-presses a group row and picks a context-menu action by its label.
  @MainActor
  private func groupAction(_ path: String, _ label: String, in app: XCUIApplication) {
    let row = app.buttons["openGroup_" + path]
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    row.press(forDuration: 1.2)
    let action = app.buttons[label]
    XCTAssertTrue(action.waitForExistence(timeout: 5))
    action.tap()
  }

  @MainActor
  private func showHeader(in app: XCUIApplication) {
    for _ in 0..<4 {
      if app.staticTexts["credentialDetailTitle"].exists { break }
      app.swipeDown()
    }
    XCTAssertTrue(app.staticTexts["credentialDetailTitle"].exists)
  }

  @MainActor
  private func focus(_ field: XCUIElement, in app: XCUIApplication) {
    for _ in 0..<12 {
      if field.exists && field.isHittable { break }
      scrollUp(in: app)
    }
    XCTAssertTrue(field.exists)
    let frame = field.frame
    field.tap()
    // XCTest may scroll a Form row into place while synthesizing its first tap.
    // Target the settled row before typing when that operation moved the field.
    if field.frame != frame { field.tap() }
  }

  @MainActor
  private func replace(_ field: XCUIElement, with value: String, in app: XCUIApplication) {
    focus(field, in: app)
    // Native paragraph selection also works with a Cyrillic software keyboard.
    field.tap(withNumberOfTaps: 3, numberOfTouches: 1)
    field.typeText(value)
  }

  /// A pushed screen's active search hides its navigation bar buttons until it is closed;
  /// the close control is labelled differently across presentations.
  @MainActor
  private func endSearch(in app: XCUIApplication) {
    for label in ["Close", "close", "Cancel"] {
      let button = app.buttons[label].firstMatch
      if button.exists && button.isHittable {
        button.tap()
        _ = app.keyboards.firstMatch.waitForNonExistence(timeout: 3)
        return
      }
    }
  }

  /// Waits for a control that exists from the first frame but is only usable once its page
  /// has loaded, such as the credential page's Edit.
  @MainActor
  private func waitEnabled(_ element: XCUIElement, timeout: TimeInterval = 15) {
    let ready = expectation(
      for: NSPredicate(format: "exists == true AND isEnabled == true"), evaluatedWith: element)
    wait(for: [ready], timeout: timeout)
  }

  @MainActor
  private func tap(_ element: XCUIElement, in app: XCUIApplication) {
    // Seek the control in the foreground scroll container before tapping.
    for _ in 0..<12 {
      if element.exists && element.isHittable {
        let keyboard = app.keyboards.firstMatch
        if !keyboard.exists || element.frame.maxY <= keyboard.frame.minY { break }
      }
      scrollUp(in: app)
    }
    waitEnabled(element)
    element.tap()
  }

  @MainActor
  private func scrollUp(in app: XCUIApplication) {
    // Use the foreground Form/list, not the whole iPad behind a smaller sheet.
    // Keep successive viewports overlapping so a lazy field cannot be skipped.
    let identifiers = [
      "passkeyDetail", "passkeysCatalog", "credentialImportForm", "websiteEditorForm",
      "sshCreation", "sshDetail", "sshCatalog",
      "passwordGeneratorForm", "otpImportForm", "otpForm", "credentialAudit",
      "credentialSelectionForm", "credentialTagsForm", "credentialGroupsForm",
      "credentialEditorForm",
      "credentialCreationForm",
      "credentialsGroup",
      "credentialsCatalog",
    ]
    let bounds =
      identifiers.compactMap { identifier -> CGRect? in
        let container = app.collectionViews[identifier]
        guard container.exists else { return nil }
        let frame = container.frame.intersection(app.frame)
        return frame.isEmpty || frame.isInfinite ? nil : frame
      }.first ?? app.frame
    let bottom =
      app.keyboards.firstMatch.exists
      ? min(bounds.maxY, app.keyboards.firstMatch.frame.minY) : bounds.maxY
    let height = bottom - bounds.minY
    let origin = app.coordinate(withNormalizedOffset: .zero)
    let x = bounds.midX - app.frame.minX
    let top = bounds.minY - app.frame.minY
    origin.withOffset(CGVector(dx: x, dy: top + height * 0.75))
      .press(
        forDuration: 0.05,
        thenDragTo: origin.withOffset(CGVector(dx: x, dy: top + height * 0.45)),
        withVelocity: .slow, thenHoldForDuration: 0.2)
  }

  @MainActor
  private func attach(_ app: XCUIApplication, name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
