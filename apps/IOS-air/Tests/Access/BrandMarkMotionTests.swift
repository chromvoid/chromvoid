import Foundation
import XCTest

@testable import AirPresentation

final class BrandMarkMotionTests: XCTestCase {
  private let start = Date(timeIntervalSinceReferenceDate: 0)

  func testBusySignalEntersFromTheTailAndAcceleratesTowardTheCore() throws {
    let unlock = BrandUnlockMotion(startedAt: start)
    let initial = frame(0, unlock: unlock)
    XCTAssertEqual(try XCTUnwrap(initial.signalStart), -78, accuracy: 0.000_001)
    XCTAssertEqual(initial.signalOpacity, 0)
    XCTAssertEqual(frame(0.14, unlock: unlock).signalOpacity, 0.85, accuracy: 0.000_001)
    let earlyDistance =
      BrandUnlockMotion.signalStart(at: 0.35) - BrandUnlockMotion.signalStart(at: 0.15)
    let lateDistance =
      BrandUnlockMotion.signalStart(at: 0.95) - BrandUnlockMotion.signalStart(at: 0.75)
    XCTAssertGreaterThan(earlyDistance, 0)
    XCTAssertGreaterThan(lateDistance, earlyDistance)
    XCTAssertLessThan(BrandUnlockMotion.signalStart(at: 1.14), 603)
    XCTAssertNil(unlock.ringStartedAt)
  }

  func testBusyCoreRespondsBetweenRunsAndNextCycleStartsWithoutARing() throws {
    let unlock = BrandUnlockMotion(startedAt: start)
    let response = frame(1.28, unlock: unlock)
    XCTAssertNil(response.signalStart)
    XCTAssertGreaterThan(response.coreScale, 1)
    XCTAssertGreaterThan(response.auraOpacity, 0.05)
    let nextRun = frame(1.4, unlock: unlock)
    XCTAssertEqual(try XCTUnwrap(nextRun.signalStart), -78, accuracy: 0.000_001)
    XCTAssertEqual(nextRun.signalOpacity, 0)
    XCTAssertGreaterThan(nextRun.coreScale, 1, "The response finishes 10 ms into the next run")
    let beforeWrap = frame(1.4 - 0.000_001, unlock: unlock)
    XCTAssertEqual(beforeWrap.coreScale, nextRun.coreScale, accuracy: 0.000_001)
    XCTAssertEqual(frame(1.411, unlock: unlock).coreScale, 1, accuracy: 0.000_001)
    XCTAssertNil(nextRun.ringProgress)
  }

  func testSuccessContinuesFromTheInterruptedSignalPositionWithQuadraticRunout() throws {
    let completion = 0.62
    let running = BrandUnlockMotion(startedAt: start)
    let completed = BrandUnlockMotion(
      startedAt: start, completedAt: start.addingTimeInterval(completion))
    let interruptedPosition = try XCTUnwrap(frame(completion, unlock: running).signalStart)
    let runoutStart = try XCTUnwrap(frame(completion, unlock: completed).signalStart)
    XCTAssertEqual(runoutStart, interruptedPosition, accuracy: 0.000_001)
    let halfRunout = try XCTUnwrap(frame(completion + 0.11, unlock: completed).signalStart)
    XCTAssertEqual(
      (halfRunout - interruptedPosition) / (603 - interruptedPosition), 0.25,
      accuracy: 0.000_001)
    let lastSignal = frame(completion + 0.219, unlock: completed)
    XCTAssertGreaterThan(try XCTUnwrap(lastSignal.signalStart), halfRunout)
    XCTAssertLessThan(try XCTUnwrap(lastSignal.signalStart), 603)
    XCTAssertNil(lastSignal.ringProgress)
    let ringStart = try XCTUnwrap(completed.ringStartedAt)
    XCTAssertEqual(
      ringStart.timeIntervalSince(completed.completedAt ?? start), 0.22, accuracy: 0.000_001)
    let firstRing = BrandMarkFrame(date: ringStart, unlock: completed)
    XCTAssertNil(firstRing.signalStart)
    XCTAssertEqual(try XCTUnwrap(firstRing.ringProgress), 0)
  }

  func testSuccessNeverWaitsForTheRemainderOfTheBusyCycle() throws {
    for completion in [0.0, 0.14, 0.575, 1.149, 1.15, 1.28, 1.399, 1.4, 2.1] {
      let completedAt = start.addingTimeInterval(completion)
      let unlock = BrandUnlockMotion(startedAt: start, completedAt: completedAt)
      let ringStart = try XCTUnwrap(unlock.ringStartedAt)
      let runout = ringStart.timeIntervalSince(completedAt)
      XCTAssertGreaterThanOrEqual(runout, 0)
      XCTAssertLessThanOrEqual(runout, 0.22 + 0.000_001)
      XCTAssertNotNil(BrandMarkFrame(date: ringStart, unlock: unlock).ringProgress)
    }
    let betweenRuns = BrandUnlockMotion(
      startedAt: start, completedAt: start.addingTimeInterval(1.28))
    XCTAssertEqual(betweenRuns.ringStartedAt, betweenRuns.completedAt)
    XCTAssertNil(frame(1.28, unlock: betweenRuns).signalStart)
  }

  func testEarlySuccessPreservesTheSignalsFadeInsteadOfFlashing() {
    let completion = 1.42
    let running = BrandUnlockMotion(startedAt: start)
    let completed = BrandUnlockMotion(
      startedAt: start, completedAt: start.addingTimeInterval(completion))
    XCTAssertEqual(
      frame(completion, unlock: running).signalOpacity,
      frame(completion, unlock: completed).signalOpacity, accuracy: 0.000_001)
    XCTAssertLessThan(frame(completion, unlock: completed).signalOpacity, 0.85)
    XCTAssertEqual(frame(completion + 0.14, unlock: completed).signalOpacity, 0.85)
  }

  func testSuccessHasOneFiniteRingAndCoreResponse() throws {
    let unlock = BrandUnlockMotion(startedAt: start, completedAt: start.addingTimeInterval(1.28))
    let ringStart = try XCTUnwrap(unlock.ringStartedAt)
    let middle = BrandMarkFrame(date: ringStart.addingTimeInterval(0.11), unlock: unlock)
    XCTAssertEqual(middle.coreScale, 1.06, accuracy: 0.000_001)
    XCTAssertEqual(middle.auraOpacity, 0.25, accuracy: 0.000_001)
    let progress = try XCTUnwrap(middle.ringProgress)
    XCTAssertGreaterThan(progress, 0)
    XCTAssertLessThan(progress, 1)
    for elapsed in [0.551, 1.4, 2.8] {
      let settled = BrandMarkFrame(date: ringStart.addingTimeInterval(elapsed), unlock: unlock)
      XCTAssertNil(settled.ringProgress)
      XCTAssertNil(settled.signalStart)
      XCTAssertEqual(settled.coreScale, 1, accuracy: 0.000_001)
      XCTAssertEqual(settled.auraOpacity, 0.05, accuracy: 0.000_001)
    }
  }

  func testReducedMotionUsesOnlyCoreOpacityWhileBusy() {
    let unlock = BrandUnlockMotion(startedAt: start)
    for (elapsed, opacity) in [(0.0, 1.0), (1.2, 0.6), (2.4, 1.0), (3.6, 0.6)] {
      let reduced = BrandMarkFrame(
        date: start.addingTimeInterval(elapsed), intro: start, returning: start,
        unlock: unlock, reduceMotion: true)
      XCTAssertEqual(reduced.coreOpacity, opacity, accuracy: 0.000_001)
      XCTAssertEqual(reduced.trace, 1)
      XCTAssertEqual(reduced.spiralScale, 1)
      XCTAssertEqual(reduced.rotation, 0)
      XCTAssertEqual(reduced.coreScale, 1)
      XCTAssertNil(reduced.signalStart)
      XCTAssertNil(reduced.ringProgress)
    }
  }

  func testReducedMotionSuccessIsImmediatelyAtRestWithoutRunoutOrRing() {
    let unlock = BrandUnlockMotion(startedAt: start, completedAt: start.addingTimeInterval(0.62))
    for elapsed in [0.62, 0.73, 0.84, 1.0, 2.4] {
      let reduced = frame(elapsed, unlock: unlock, reduceMotion: true)
      XCTAssertEqual(reduced.coreOpacity, 1)
      XCTAssertEqual(reduced.coreScale, 1)
      XCTAssertEqual(reduced.auraOpacity, 0.05)
      XCTAssertNil(reduced.signalStart)
      XCTAssertNil(reduced.ringProgress)
    }
  }

  func testIntroSettlesAndReturningDoesNotReplayTheSpiral() {
    let beginning = BrandMarkFrame(date: start, intro: start)
    XCTAssertEqual(beginning.trace, 0)
    XCTAssertEqual(beginning.coreOpacity, 0)
    XCTAssertLessThan(beginning.spiralScale, 1)
    XCTAssertLessThan(beginning.rotation, 0)
    let final = BrandMarkFrame(date: start.addingTimeInterval(1.44), intro: start)
    XCTAssertEqual(final.trace, 1)
    XCTAssertEqual(final.width, 72)
    XCTAssertEqual(final.coreScale, 1, accuracy: 0.000_001)
    XCTAssertEqual(final.coreOpacity, 1)
    XCTAssertEqual(final.spiralScale, 1)
    XCTAssertEqual(final.rotation, 0)
    let returning = BrandMarkFrame(date: start, returning: start)
    XCTAssertEqual(returning.trace, 1)
    XCTAssertEqual(returning.spiralOpacity, 1)
    XCTAssertEqual(returning.coreOpacity, 1)
    XCTAssertEqual(returning.coreScale, 0.85, accuracy: 0.000_001)
    let returned = BrandMarkFrame(date: start.addingTimeInterval(0.35), returning: start)
    XCTAssertEqual(returned.coreScale, 1, accuracy: 0.000_001)
  }

  private func frame(
    _ elapsed: TimeInterval, unlock: BrandUnlockMotion, reduceMotion: Bool = false
  ) -> BrandMarkFrame {
    BrandMarkFrame(
      date: start.addingTimeInterval(elapsed), unlock: unlock, reduceMotion: reduceMotion)
  }
}
