package com.chromvoid.air.ui.access

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

public class BrandMotionTest {
    @Test
    public fun `appearance is claimed once per process including when motion is reduced`() {
        val process = BrandIntroState()
        val first = process.claim()
        assertEquals(BrandEntry.APPEAR, first)
        assertEquals(BrandMotionFrame(), frame(entry = first, reduced = true))
        assertEquals(BrandEntry.RETURN, process.claim())
        assertEquals(BrandEntry.RETURN, process.claim())
        assertEquals(BrandEntry.APPEAR, BrandIntroState().claim())
    }

    @Test
    public fun `intro reaches rest and return never redraws the spiral`() {
        assertEquals(BrandMotionFrame(), frame(entry = BrandEntry.APPEAR, age = 1440))
        val returning = frame(entry = BrandEntry.RETURN)
        assertEquals(1f, returning.trace)
        assertEquals(0.85f, returning.coreScale)
        assertEquals(BrandMotionFrame(), frame(entry = BrandEntry.RETURN, age = 350))
        assertEquals(BrandMotionFrame(), frame(entry = BrandEntry.APPEAR, motion = BrandUnlockMotion.Rest))
    }

    @Test
    public fun `working signal accelerates along the trace and then the core responds`() {
        val start = frame(motion = BrandUnlockMotion.Deriving(0), now = 0)
        val middle = frame(motion = BrandUnlockMotion.Deriving(0), now = 575)
        val response = frame(motion = BrandUnlockMotion.Deriving(0), now = 1280)
        assertEquals(-78f, start.signalStart)
        assertEquals(0f, start.signalOpacity)
        assertTrue(checkNotNull(middle.signalStart) < 603f / 2)
        assertNull(response.signalStart)
        assertTrue(response.coreScale > 1f)
        val nextCycle = frame(motion = BrandUnlockMotion.Deriving(0), now = 1400)
        assertEquals(start.signalStart, nextCycle.signalStart)
        assertEquals(start.signalOpacity, nextCycle.signalOpacity)
        assertTrue(nextCycle.coreScale > 1f)
        assertEquals(1f, frame(motion = BrandUnlockMotion.Deriving(0), now = 1410).coreScale)
    }

    @Test
    public fun `success finishes from the current position within 220 milliseconds`() {
        val working = frame(motion = BrandUnlockMotion.Deriving(0), now = 600)
        val finishing = BrandUnlockMotion.Finishing(0, 600)
        assertEquals(working.signalStart, frame(motion = finishing, now = 600).signalStart)
        assertEquals(603f, frame(motion = finishing, now = 820).signalStart)
        assertEquals(220L, BrandMotionSpec.finishDuration(0, 600))
        assertEquals(0L, BrandMotionSpec.finishDuration(0, 1200))
    }

    @Test
    public fun `reduced motion has no spatial motion and only pulses the working core`() {
        val working = BrandUnlockMotion.Deriving(0)
        assertEquals(BrandMotionFrame(), frame(motion = working, now = 0, reduced = true))
        assertEquals(
            BrandMotionFrame(coreOpacity = 0.6f),
            frame(motion = working, now = 1200, reduced = true),
        )
        assertEquals(BrandMotionFrame(), frame(motion = working, now = 2400, reduced = true))
        assertEquals(BrandMotionFrame(), frame(motion = BrandUnlockMotion.Open(0), reduced = true))
    }

    private fun frame(
        entry: BrandEntry = BrandEntry.STILL,
        age: Long = 0,
        motion: BrandUnlockMotion = BrandUnlockMotion.Idle,
        now: Long = 0,
        reduced: Boolean = false,
    ): BrandMotionFrame = brandMotionFrame(entry, age, motion, now, reduced, 603f)
}
