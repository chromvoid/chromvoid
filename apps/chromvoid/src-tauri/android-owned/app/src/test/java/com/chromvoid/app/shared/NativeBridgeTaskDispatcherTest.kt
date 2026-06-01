package com.chromvoid.app.shared

import java.util.concurrent.Executor
import java.util.concurrent.RejectedExecutionException
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NativeBridgeTaskDispatcherTest {
    @After
    fun tearDown() {
        NativeBridgeTaskDispatcher.resetForTests()
    }

    @Test
    fun executeRunsTask() {
        var executed = false
        NativeBridgeTaskDispatcher.setExecutorForTests(Executor { runnable -> runnable.run() })

        val accepted = NativeBridgeTaskDispatcher.execute("test.success") {
            executed = true
        }

        assertTrue(accepted)
        assertTrue(executed)
    }

    @Test
    fun executeReturnsFalseWhenExecutorRejectsTask() {
        NativeBridgeTaskDispatcher.setExecutorForTests(
            Executor {
                throw RejectedExecutionException("full")
            },
        )

        val accepted = NativeBridgeTaskDispatcher.execute("test.rejected") {
            error("should not run")
        }

        assertFalse(accepted)
    }

    @Test
    fun executeCatchesTaskFailure() {
        NativeBridgeTaskDispatcher.setExecutorForTests(Executor { runnable -> runnable.run() })

        val accepted = NativeBridgeTaskDispatcher.execute("test.failure") {
            error("boom")
        }

        assertTrue(accepted)
    }
}
