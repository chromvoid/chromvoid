package com.chromvoid.app.shared

import android.os.SystemClock
import android.util.Log
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.Executor
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

internal object NativeBridgeTaskDispatcher {
    private const val TAG = "ChromVoid/BridgeTasks"
    private const val QUEUE_CAPACITY = 64
    private const val SLOW_TASK_MS = 1_000L

    private val sequence = AtomicLong()
    private val defaultExecutor =
        ThreadPoolExecutor(
            1,
            1,
            0L,
            TimeUnit.MILLISECONDS,
            ArrayBlockingQueue(QUEUE_CAPACITY),
            { runnable ->
                Thread(runnable, "chromvoid-native-bridge").apply {
                    isDaemon = true
                }
            },
        )

    @Volatile
    private var executorForTests: Executor? = null

    fun execute(
        owner: String,
        task: () -> Unit,
    ): Boolean {
        val taskId = sequence.incrementAndGet()
        val runnable =
            Runnable {
                val startedAtMs = SystemClock.elapsedRealtime()
                runCatching(task)
                    .onFailure { error ->
                        Log.w(TAG, "native_bridge_task_failed id=$taskId owner=$owner", error)
                    }
                val elapsedMs = SystemClock.elapsedRealtime() - startedAtMs
                if (elapsedMs >= SLOW_TASK_MS) {
                    Log.w(TAG, "native_bridge_task_slow id=$taskId owner=$owner elapsedMs=$elapsedMs")
                }
            }

        return try {
            (executorForTests ?: defaultExecutor).execute(runnable)
            true
        } catch (error: RejectedExecutionException) {
            Log.w(TAG, "native_bridge_task_rejected id=$taskId owner=$owner", error)
            false
        }
    }

    internal fun setExecutorForTests(executor: Executor?) {
        executorForTests = executor
    }

    internal fun resetForTests() {
        executorForTests = null
    }
}
