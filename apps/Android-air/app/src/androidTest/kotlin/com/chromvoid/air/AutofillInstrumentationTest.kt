package com.chromvoid.air

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToKey
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.presentation.R as PresentationR
import com.chromvoid.air.probe.AutofillProbeActivity
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.autofill.AUTOFILL_ACCESS_TAG
import com.chromvoid.air.ui.autofill.AUTOFILL_CLOSE_TAG
import com.chromvoid.air.ui.autofill.AUTOFILL_REFRESH_TAG
import com.chromvoid.air.ui.autofill.AUTOFILL_SYSTEM_TAG
import com.chromvoid.air.ui.credentials.FORM_SAVE_TAG
import com.chromvoid.air.ui.settings.SETTINGS_AUTOFILL_TAG
import com.chromvoid.air.ui.settings.SETTINGS_LIST_TAG
import java.util.UUID
import java.util.regex.Pattern
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A50 and A19 against real Core, with ChromVoid selected as the emulator's autofill
 * service for the test and restored after it. Another app - this test package, a WebView
 * sign-in page on example.com - asks to be filled. With the vault open the system offers the vault's
 * login for that site; choosing it reads the password then and fills both fields. With the
 * vault locked the system offers "Unlock ChromVoid"; the vault's unlock screen opens over
 * the page, and once the vault is open the same login is offered and fills.
 */
@RunWith(AndroidJUnit4::class)
public class AutofillInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val device: UiDevice get() = UiDevice.getInstance(instrumentation)
    private val session get() = AirAppGraph.of(rule.activity).session
    private var previousService: String? = null

    /** The system's autofill list offers the unlock in the app's own words, in the phone's language. */
    private val unlockText get() = rule.activity.getString(com.chromvoid.platform.R.string.provider_unlock_title)

    /** Set when the test chose ChromVoid itself; a device whose person chose it keeps its setting. */
    private var selected = false

    @Before
    public fun selectChromVoid() {
        val ours = "${rule.activity.packageName}/$SERVICE"
        val current = shell("settings get secure autofill_service").trim()
            .takeUnless { it == "null" || it.isEmpty() }
        if (current == ours) return
        previousService = current
        shell("settings put secure autofill_service $ours")
        selected = true
    }

    @After
    public fun restoreService() {
        // The save route opens the notification shade; a failure there must not leave it open.
        shell("cmd statusbar collapse")
        if (!selected) return
        val previous = previousService
        shell(
            if (previous == null) {
                "settings delete secure autofill_service"
            } else {
                "settings put secure autofill_service $previous"
            },
        )
    }

    @Test
    public fun aSitesLoginFillsOpenAndAfterAnUnlock() {
        unlocked()
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = SECRET),
                    title = "Example",
                    urls = buildJsonArray {
                        add(
                            buildJsonObject {
                                put("value", "https://example.com")
                                put("match", "base_domain")
                            },
                        )
                    },
                    username = ACCOUNT,
                ),
                generation,
            )
        }

        // The vault is open: the login is offered, and choosing it fills both fields.
        openProbe()
        tap(By.res("username"))
        tap(By.text(ACCOUNT))
        awaitFilled()

        // Locked: the fill asks for the vault first, then offers the same login.
        runBlocking { session.lock() }
        awaitState { it == AirSessionState.Locked }
        openProbe()
        tap(By.res("username"))
        tap(By.text(unlockText))
        // The unlock screen is ChromVoid's own, over the page: its field, not the page's.
        val password = await(By.clazz("android.widget.EditText").pkg(rule.activity.packageName))
        password.text = VAULT
        tap(By.text(rule.activity.getString(PresentationR.string.access_unlock_submit)))
        awaitState { it is AirSessionState.Unlocked }
        tap(By.text(ACCOUNT))
        awaitFilled()
    }

    /**
     * A login typed by hand into another app's page, while the vault is locked, is offered to
     * ChromVoid by the system when the page is submitted. ChromVoid holds it in memory, offers
     * the review in a notification, names its site on the unlock screen, opens it filled in
     * once the vault is open, and after the save the same page is offered it and fills.
     */
    @Test
    public fun aLoginTypedElsewhereIsSavedAfterAnUnlockAndThenFills() {
        allowNotifications()
        unlocked()
        runBlocking { session.lock() }
        awaitState { it == AirSessionState.Locked }

        // Typed as a person would: each field focused first, which is what starts autofill.
        // The password goes first: the suggestion under a field would cover the one below it.
        openProbe()
        // Key by key, as a keyboard does: the page reports input, not a value set from outside.
        // The page's own status says what arrived; its empty account collapses in the text.
        type(By.res("password"), TYPED_SECRET, By.text(Pattern.compile("filled\\s+${TYPED_SECRET.length}")))
        type(By.res("username"), TYPED_ACCOUNT, By.text("filled $TYPED_ACCOUNT ${TYPED_SECRET.length}"))
        // Typing hid the suggestion, so the button is the page's own again.
        tap(By.clazz("android.widget.Button").text("Sign in"))
        // The system asks, over the page, whether to save what was typed to ChromVoid.
        tap(By.res("android", "autofill_save_yes"))

        // ChromVoid keeps it in memory and offers the review in a notification.
        device.openNotification()
        tap(By.text(rule.activity.getString(R.string.login_offer_title, SITE)))
        await(By.text(rule.activity.getString(PresentationR.string.login_offer_waiting, SITE)))
        runBlocking { assertEquals(AccessOutcome.Accepted, session.unlock(VAULT)) }
        awaitState { it is AirSessionState.Unlocked }
        rule.waitUntil(TIMEOUT_MILLIS) { rule.onAllNodesWithTag(FORM_SAVE_TAG).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        rule.waitUntil(TIMEOUT_MILLIS) { rule.onAllNodesWithTag(FORM_SAVE_TAG).fetchSemanticsNodes().isEmpty() }

        openProbe()
        tap(By.res("username"))
        tap(By.text(TYPED_ACCOUNT))
        await(By.text("filled $TYPED_ACCOUNT ${TYPED_SECRET.length}"))
    }

    /** Route A19: Settings says ChromVoid is the service and this vault can answer. */
    @Test
    public fun theAutoFillPageSaysWhereFillingStands() {
        unlocked()
        rule.waitUntil(TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(ROOT_SETTINGS_TAG).fetchSemanticsNodes().isNotEmpty()
        }
        rule.onNodeWithTag(ROOT_SETTINGS_TAG).performClick()
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("passwords-passkeys")
        rule.onNodeWithTag(SETTINGS_AUTOFILL_TAG).performClick()
        rule.waitUntil(TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(AUTOFILL_ACCESS_TAG).fetchSemanticsNodes().isNotEmpty()
        }
        val serviceChosen = rule.activity.getString(PresentationR.string.autofill_system_selected)
        rule.onNodeWithTag(AUTOFILL_SYSTEM_TAG).assertTextEquals(serviceChosen)
        val authorized = rule.activity.getString(PresentationR.string.autofill_access_authorized)
        rule.onNodeWithTag(AUTOFILL_ACCESS_TAG).assertTextEquals(authorized)

        // Another service chosen meanwhile shows as the page is read again. Only where the test
        // chose the service itself: a person's own choice is never undone.
        if (selected) {
            shell("settings delete secure autofill_service")
            rule.onNodeWithTag(AUTOFILL_REFRESH_TAG).performClick()
            rule.waitUntil(TIMEOUT_MILLIS) {
                val notSelected = rule.activity.getString(PresentationR.string.autofill_system_not_selected)
                rule.onAllNodesWithText(notSelected).fetchSemanticsNodes().isNotEmpty()
            }
        }
        rule.onNodeWithTag(AUTOFILL_CLOSE_TAG).performClick()
        rule.onNodeWithTag(SETTINGS_AUTOFILL_TAG).assertIsDisplayed()
    }

    /**
     * The review waits in a notification, which Android 13 shows only with the person's leave. A
     * phone that refuses the shell's grant asks its person, who allows it.
     */
    private fun allowNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val permission = android.Manifest.permission.POST_NOTIFICATIONS
        shell("pm grant ${rule.activity.packageName} $permission")
        val granted = { rule.activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED }
        if (granted()) return
        rule.runOnUiThread { rule.activity.requestPermissions(arrayOf(permission), 0) }
        tap(By.res("com.android.permissioncontroller", "permission_allow_button"))
        rule.waitUntil(TIMEOUT_MILLIS) { granted() }
    }

    private fun openProbe() {
        val context = instrumentation.context
        context.startActivity(
            Intent(context, AutofillProbeActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        )
        await(By.text(NOTHING_FILLED))
    }

    private fun awaitFilled() {
        await(By.text("filled $ACCOUNT ${SECRET.length}"))
    }

    /**
     * Focuses a page's field and types into it with key events until the page shows [typed].
     * The suggestion that opens under the field holds the focus for a moment, and keys sent
     * to it are dropped; the field is cleared and typed again then.
     */
    private fun type(selector: BySelector, text: String, typed: BySelector) {
        tap(selector)
        repeat(TYPE_ATTEMPTS) {
            shell("input text $text")
            if (find(typed, TYPE_SETTLE_MILLIS) != null) return
            await(selector).clear()
        }
        await(typed)
    }

    private fun find(selector: BySelector, millis: Long): UiObject2? {
        var found: UiObject2? = null
        runCatching {
            rule.waitUntil(millis) {
                found = device.findObject(selector)
                found != null
            }
        }
        return found
    }

    private fun tap(selector: BySelector) {
        await(selector).click()
    }

    /**
     * The compose rule drives the frame clock of every composition in this process - the
     * unlock screen over the page as well - so waiting goes through it, and the screens keep
     * drawing while the system's windows are searched.
     */
    private fun await(selector: BySelector): UiObject2 =
        checkNotNull(find(selector, TIMEOUT_MILLIS)) { "nothing matched $selector; on screen: ${ourScreen()}" }

    /**
     * What the page, the app, the system's autofill UI and the keyboard show - nothing of any
     * other app - to say why a wait failed.
     */
    private fun ourScreen(): String {
        val ours = setOf(rule.activity.packageName, instrumentation.context.packageName, "android")
        val keyboard = shell("settings get secure default_input_method").substringBefore('/').trim()
        return device.findObjects(By.pkg(Pattern.compile(".*")))
            .filter { it.applicationPackage in ours || it.applicationPackage == keyboard }
            .filter { it.text != null || it.resourceName != null || it.isFocused }
            .joinToString(" | ") { node ->
                val focus = if (node.isFocused) " *focused*" else ""
                "${node.applicationPackage}:${node.resourceName} '${node.text}' ${node.visibleBounds}$focus"
            }
    }

    private fun shell(command: String): String {
        val output = instrumentation.uiAutomation.executeShellCommand(command)
        return ParcelFileDescriptor.AutoCloseInputStream(output).bufferedReader().use { it.readText() }
    }

    private fun unlocked() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        runCatching { rule.waitUntil(TIMEOUT_MILLIS) { accept(session.state.value) } }
        check(accept(session.state.value)) { "session still ${session.state.value}" }
    }

    private companion object {
        const val SERVICE = "com.chromvoid.app.ChromVoidAutofillService"
        const val ROOT_SETTINGS_TAG = "root-settings"
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val ACCOUNT = "alice@example.com"
        const val SECRET = "synthetic-autofill-password"
        const val TYPED_ACCOUNT = "bob@example.com"
        const val TYPED_SECRET = "typed-by-hand-synthetic"
        const val TYPE_ATTEMPTS = 3
        const val TYPE_SETTLE_MILLIS = 3_000L
        const val SITE = "example.com"
        const val NOTHING_FILLED = "nothing filled"
        const val TIMEOUT_MILLIS = 20_000L
    }
}
