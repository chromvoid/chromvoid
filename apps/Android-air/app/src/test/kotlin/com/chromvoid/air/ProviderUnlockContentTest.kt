package com.chromvoid.air

import android.app.Application
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AccessSession
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.access.ACCESS_PASSWORD_TAG
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.access.BRAND_MARK_RETAINED_TAG
import com.chromvoid.air.ui.access.BRAND_MARK_TAG
import com.chromvoid.air.ui.access.BrandUnlockMotion
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, sdk = [31], qualifiers = "w411dp-h891dp")
public class ProviderUnlockContentTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val scheduler = TestCoroutineScheduler()
    private val session = ProviderAccessSession()
    private val observation = CoroutineScope(SupervisorJob() + UnconfinedTestDispatcher(scheduler))
    private val phases = mutableListOf<BrandUnlockMotion>()
    private val resultRequests = mutableListOf<Long>()
    private lateinit var model: AccessViewModel

    @Before
    public fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher(scheduler))
        rule.mainClock.autoAdvance = false
    }

    @After
    public fun tearDown() {
        observation.cancel()
        rule.mainClock.autoAdvance = true
        Dispatchers.resetMain()
    }

    @Test
    public fun `accepted provider unlock requests its result immediately without completion motion`() {
        show()
        submit()
        advance(600)
        rule.onNodeWithTag(BRAND_MARK_TAG, useUnmergedTree = true).assertExists()
        rule.runOnIdle {
            assertTrue(model.unlockMotion.value is BrandUnlockMotion.Deriving)
            assertTrue(resultRequests.isEmpty())
            // Publishing session state alone must not answer before unlock has returned its outcome.
            session.publishUnlocked()
            scheduler.runCurrent()
        }
        advance(100)
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertExists()
        rule.runOnIdle {
            assertEquals(AirSessionState.Locked, model.displayState.value)
            assertTrue(resultRequests.isEmpty())
            session.result.complete(AccessOutcome.Accepted)
            scheduler.runCurrent()
        }
        advance(0)
        rule.runOnIdle {
            assertEquals(listOf(700L), resultRequests)
            assertTrue(model.displayState.value is AirSessionState.Unlocked)
            assertEquals(BrandUnlockMotion.Idle, model.unlockMotion.value)
            assertFalse(phases.any { it is BrandUnlockMotion.Finishing || it is BrandUnlockMotion.Open })
        }
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertDoesNotExist()
        rule.onNodeWithTag(BRAND_MARK_TAG, useUnmergedTree = true).assertDoesNotExist()
        rule.onNodeWithTag(BRAND_MARK_RETAINED_TAG, useUnmergedTree = true).assertDoesNotExist()
        advance(1_000)
        rule.onNodeWithTag(BRAND_MARK_RETAINED_TAG, useUnmergedTree = true).assertDoesNotExist()
        rule.runOnIdle { assertEquals(listOf(700L), resultRequests) }
    }

    @Test
    public fun `provider failure settles its entry mark and never requests a result`() {
        show()
        submit()
        advance(600)
        rule.runOnIdle {
            session.result.complete(AccessOutcome.Refused("disk_failure"))
            scheduler.runCurrent()
        }
        advance(0)
        rule.runOnIdle {
            assertEquals(BrandUnlockMotion.Rest, model.unlockMotion.value)
            assertEquals(AirSessionState.Locked, model.displayState.value)
            assertTrue(resultRequests.isEmpty())
            assertFalse(phases.any { it is BrandUnlockMotion.Finishing || it is BrandUnlockMotion.Open })
        }
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertExists()
        rule.onNodeWithTag(BRAND_MARK_TAG, useUnmergedTree = true).assertExists()
        rule.onNodeWithTag(BRAND_MARK_RETAINED_TAG, useUnmergedTree = true).assertDoesNotExist()
    }

    private fun show() {
        model = AccessViewModel(session, animateUnlockCompletion = false) { scheduler.currentTime }
        observation.launch { model.unlockMotion.collect { phases += it } }
        rule.setContent {
            AirTheme {
                ProviderUnlockContent(
                    model,
                    onUnlocked = { resultRequests += scheduler.currentTime },
                    onUnavailable = {},
                )
            }
        }
        rule.runOnIdle { scheduler.runCurrent() }
        rule.onNodeWithTag(BRAND_MARK_TAG, useUnmergedTree = true).assertExists()
    }

    private fun submit() {
        rule.runOnIdle {
            model.onPasswordChanged("synthetic-provider-password")
            model.submitUnlock()
            scheduler.runCurrent()
        }
        advance(0)
    }

    private fun advance(milliseconds: Long) {
        rule.runOnIdle {
            scheduler.advanceTimeBy(milliseconds)
            scheduler.runCurrent()
        }
        rule.mainClock.advanceTimeByFrame()
        rule.runOnIdle { scheduler.runCurrent() }
        rule.waitForIdle()
    }
}

private class ProviderAccessSession : AccessSession {
    private val mutableState = MutableStateFlow<AirSessionState>(AirSessionState.Locked)
    override val state: StateFlow<AirSessionState> = mutableState
    override val sequence: StateFlow<ULong> = MutableStateFlow(0uL)
    override val administration: StateFlow<ULong?> = MutableStateFlow(1uL)
    val result = CompletableDeferred<AccessOutcome>()

    fun publishUnlocked() {
        mutableState.value = AirSessionState.Unlocked(1uL)
    }

    override suspend fun unlock(password: String): AccessOutcome {
        check(password == "synthetic-provider-password")
        return result.await()
    }

    override suspend fun setUpAdministrator(password: String, confirmation: String): AccessOutcome =
        error("the provider fixture is already set up")

    override suspend fun lock() {
        mutableState.value = AirSessionState.Locked
    }

    override suspend fun refresh() = Unit
}
