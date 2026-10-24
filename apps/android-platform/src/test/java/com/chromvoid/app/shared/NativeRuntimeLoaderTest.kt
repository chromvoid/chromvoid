package com.chromvoid.app.shared

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NativeRuntimeLoaderTest {
    @After
    fun tearDown() {
        NativeRuntimeLoader.resetForTests()
    }

    @Test
    fun ensureLoadedLoadsLibraryOnlyOnce() {
        var loadCalls = 0
        NativeRuntimeLoader.setLoadLibraryForTests {
            loadCalls += 1
        }

        assertTrue(NativeRuntimeLoader.ensureLoaded("test"))
        assertTrue(NativeRuntimeLoader.ensureLoaded("test"))

        assertEquals(1, loadCalls)
        assertEquals("loaded", NativeRuntimeLoader.stateForTests())
    }

    @Test
    fun callWhenLoadedReturnsFallbackWhenLibraryLoadFails() {
        NativeRuntimeLoader.setLoadLibraryForTests {
            throw UnsatisfiedLinkError("missing")
        }

        val result = NativeRuntimeLoader.callWhenLoaded("test", "fallback") {
            "native"
        }

        assertEquals("fallback", result)
        assertEquals("failed", NativeRuntimeLoader.stateForTests())
    }

    @Test
    fun runWhenLoadedReturnsFalseWhenNativeInvocationLosesLink() {
        NativeRuntimeLoader.setLoadLibraryForTests {
            // Loaded successfully; the call itself fails below.
        }

        val result = NativeRuntimeLoader.runWhenLoaded("test") {
            throw UnsatisfiedLinkError("missing symbol")
        }

        assertFalse(result)
        assertEquals("failed", NativeRuntimeLoader.stateForTests())
    }

    @Test
    fun resetForTestsRestoresNotStartedState() {
        NativeRuntimeLoader.setLoadLibraryForTests {
            throw UnsatisfiedLinkError("missing")
        }
        assertFalse(NativeRuntimeLoader.ensureLoaded("test"))

        NativeRuntimeLoader.resetForTests()

        assertEquals("not_started", NativeRuntimeLoader.stateForTests())
    }
}
