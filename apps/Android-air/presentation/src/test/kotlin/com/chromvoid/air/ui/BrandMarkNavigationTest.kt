package com.chromvoid.air.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.chromvoid.air.ui.access.ACCESS_PASSWORD_TAG
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.access.BRAND_MARK_RETAINED_TAG
import com.chromvoid.air.ui.access.BRAND_MARK_TAG
import com.chromvoid.air.ui.access.BrandUnlockMotion
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class BrandMarkNavigationTest {
    @get:Rule
    public val rule = createComposeRule()

    private val scheduler = TestCoroutineScheduler()
    private val dispatcher = StandardTestDispatcher(scheduler)
    private val session = FakeAccessSession.locked()
    private lateinit var model: AccessViewModel

    @Before
    public fun setUp() {
        Dispatchers.setMain(dispatcher)
        model = AccessViewModel(session) { scheduler.currentTime }
    }

    @After
    public fun tearDown() {
        rule.mainClock.autoAdvance = true
        Dispatchers.resetMain()
    }

    @Test
    public fun `real app navigation starts at 150 ms and retains only the mark until 550 ms`() {
        showApp()
        startOpen()
        advance(149)
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertExists()
        advance(1)
        rule.onNodeWithTag("root-vault").assertIsDisplayed()
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertDoesNotExist()
        advance(150)
        rule.onNodeWithTag(BRAND_MARK_RETAINED_TAG, useUnmergedTree = true).assertIsDisplayed()
        rule.onNodeWithTag(BRAND_MARK_TAG, useUnmergedTree = true).assertIsDisplayed()
        advance(249)
        rule.onNodeWithTag(BRAND_MARK_RETAINED_TAG, useUnmergedTree = true).assertExists()
        advance(1)
        rule.onNodeWithTag(BRAND_MARK_RETAINED_TAG, useUnmergedTree = true).assertDoesNotExist()
        rule.onNodeWithTag(BRAND_MARK_TAG, useUnmergedTree = true).assertDoesNotExist()
        rule.onNodeWithTag("root-vault").assertIsDisplayed()
    }

    @Test
    public fun `locking during the retained ring removes vault content and the retained mark immediately`() {
        showApp()
        startOpen()
        advance(300)
        rule.onNodeWithTag(BRAND_MARK_RETAINED_TAG, useUnmergedTree = true).assertExists()
        rule.runOnIdle {
            session.move(AirSessionState.Locked)
            scheduler.runCurrent()
        }
        rule.mainClock.advanceTimeByFrame()
        rule.onNodeWithTag("root-vault").assertDoesNotExist()
        rule.onNodeWithTag(BRAND_MARK_RETAINED_TAG, useUnmergedTree = true).assertDoesNotExist()
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertExists()
    }

    @Test
    public fun `reduced motion skips the retained layer and navigates immediately`() {
        showApp()
        rule.runOnIdle {
            model.setReducedMotion(true)
            model.onPasswordChanged("synthetic-password")
            model.submitUnlock()
            scheduler.runCurrent()
        }
        rule.mainClock.advanceTimeByFrame()
        rule.onNodeWithTag("root-vault").assertIsDisplayed()
        rule.onNodeWithTag(BRAND_MARK_RETAINED_TAG, useUnmergedTree = true).assertDoesNotExist()
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertDoesNotExist()
    }

    private fun showApp() {
        val shell = ShellViewModel(session, FakeCredentialStore(), FakeClipboard(), dispatcher)
        rule.mainClock.autoAdvance = false
        rule.setContent { AirTheme { AirApp(model, shell, onRetry = {}) } }
        rule.runOnIdle { scheduler.runCurrent() }
        rule.mainClock.advanceTimeByFrame()
        rule.onNodeWithTag(BRAND_MARK_TAG, useUnmergedTree = true).assertExists()
    }

    private fun startOpen() {
        rule.runOnIdle {
            model.onPasswordChanged("synthetic-password")
            model.submitUnlock()
            scheduler.runCurrent()
        }
        advance(220)
        rule.runOnIdle { assertTrue(model.unlockMotion.value is BrandUnlockMotion.Open) }
    }

    private fun advance(milliseconds: Long) {
        rule.runOnIdle {
            scheduler.advanceTimeBy(milliseconds)
            scheduler.runCurrent()
        }
        rule.mainClock.advanceTimeByFrame()
        rule.waitForIdle()
    }
}
