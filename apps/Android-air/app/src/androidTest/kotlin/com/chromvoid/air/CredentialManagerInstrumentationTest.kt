package com.chromvoid.air

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToKey
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.StaleObjectException
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.presentation.R as PresentationR
import com.chromvoid.air.probe.PasskeyProbeActivity
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.autofill.AUTOFILL_PASSKEYS_TAG
import com.chromvoid.air.ui.autofill.AUTOFILL_PASSKEY_SETTINGS_TAG
import com.chromvoid.air.ui.settings.SETTINGS_AUTOFILL_TAG
import com.chromvoid.air.ui.settings.SETTINGS_LIST_TAG
import com.chromvoid.app.passkey.TestBrowserTrust
import java.security.MessageDigest
import java.util.UUID
import java.util.regex.Pattern
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A18 and A19 through Credential Manager (Android 14+) against real Core: another
 * app - this test package, as a website's sign-in for example.com - asks the system for a
 * passkey, and ChromVoid is the provider, selected for the test and restored after it. The
 * emulator gets a screen-lock PIN for the test, as user verification needs one, and loses it
 * after.
 *
 * With the vault locked, creating a passkey opens the vault's unlock screen first, then asks
 * for the PIN and creates it. Signing in with the vault open offers that passkey; the probe
 * checks the assertion's challenge and signature against the registered public key. Locked
 * again, the sheet offers "Unlock ChromVoid", and after the unlock the same passkey signs in.
 * The vault's own list then holds exactly that passkey.
 */
@RunWith(AndroidJUnit4::class)
public class CredentialManagerInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val device: UiDevice get() = UiDevice.getInstance(instrumentation)
    private val session get() = AirAppGraph.of(rule.activity).session
    private var previousServices: String? = null

    /** The sheet offers the unlock in the app's own words, in the phone's language. */
    private val unlockText get() = rule.activity.getString(com.chromvoid.platform.R.string.provider_unlock_title)
    private var previousPrimary: String? = null

    /** Set when the test chose ChromVoid itself; a device whose person chose it keeps its settings. */
    private var selected = false

    /**
     * Set when the test gave the device its screen lock. A device with its own lock - a phone - keeps
     * it, and its person answers user verification in the system's prompt.
     */
    private var pinSet = false

    @Before
    public fun selectChromVoid() {
        assumeTrue("Credential Manager providers need Android 14", Build.VERSION.SDK_INT >= 34)
        val provider = "${rule.activity.packageName}/$SERVICE"
        previousServices = setting("credential_service")
        previousPrimary = setting("credential_service_primary")
        val chosen = previousServices?.split(':')?.contains(provider) == true && previousPrimary == provider
        if (!chosen) {
            shell("settings put secure credential_service $provider")
            shell("settings put secure credential_service_primary $provider")
            selected = true
        }
        val keyguard = rule.activity.getSystemService(android.app.KeyguardManager::class.java)
        if (!keyguard.isDeviceSecure) {
            shell("locksettings set-pin $PIN")
            pinSet = true
        }
    }

    @After
    public fun restore() {
        if (Build.VERSION.SDK_INT < 34) return
        if (selected) {
            restoreSetting("credential_service", previousServices)
            restoreSetting("credential_service_primary", previousPrimary)
        }
        if (pinSet) shell("locksettings clear --old $PIN")
    }

    @Test
    public fun aPasskeyIsCreatedAfterAnUnlockAndSignsInOpenAndLocked() {
        unlocked()
        runBlocking { session.lock() }
        awaitState { it == AirSessionState.Locked }

        // Locked: the passkey waits for the vault's own unlock, then for user verification.
        openProbe()
        tap(By.text("Create passkey"))
        // The system's sheet - and once per device its introduction to passkeys - asks to go on.
        continueUntil(By.clazz("android.widget.EditText").pkg(rule.activity.packageName))
        unlockVault()
        verifyUser()
        val created = awaitVerified(By.textStartsWith("created ")).text.removePrefix("created ")

        // Open: the sheet offers the passkey; the probe verifies what it signed.
        tap(By.text("Sign in with passkey"))
        chooseAccount()
        verifyUser()
        awaitVerified(By.text("signed in $created verified"))

        // Locked again: the sheet offers the unlock, then the same passkey.
        runBlocking { session.lock() }
        awaitState { it == AirSessionState.Locked }
        openProbe()
        tap(By.text("Sign in with passkey"))
        tap(By.text(unlockText))
        unlockVault()
        chooseAccount()
        verifyUser()
        awaitVerified(By.text("signed in $created verified"))

        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val stored = runBlocking { session.passkeys.listPasskeys(generation) }.passkeys
        assertEquals(listOf(PasskeyProbeActivity.RP_ID), stored.map { it.rpID })
        assertEquals(created, stored.single().credentialIDB64URL)
    }

    /**
     * A website's password through Credential Manager, asked as a browser asks it - for the site's
     * origin. Only an app trusted as a browser may name one: the release browsers, and here the
     * probe, trusted by this development build for the test alone. With the vault open the sheet
     * offers the site's login and hands back its account and password.
     */
    @Test
    public fun aWebsitesPasswordIsOfferedAndHandedBack() {
        unlocked()
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = PASSWORD),
                    title = "Example",
                    urls = buildJsonArray {
                        add(
                            buildJsonObject {
                                put("value", PasskeyProbeActivity.ORIGIN)
                                put("match", "base_domain")
                            },
                        )
                    },
                    username = PasskeyProbeActivity.USER,
                ),
                generation,
            )
        }
        val probe = instrumentation.context.packageName
        TestBrowserTrust.trust(probe, certificateSha256(probe))
        try {
            openProbe()
            tap(By.text("Sign in with password"))
            chooseAccount()
            await(By.text("password ${PasskeyProbeActivity.USER} $PASSWORD"))
        } finally {
            TestBrowserTrust.clear()
        }
    }

    /** The SHA-256 of the certificate [packageName] is signed with, as `AA:BB:…`. */
    private fun certificateSha256(packageName: String): String {
        val info = instrumentation.targetContext.packageManager
            .getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        val certificate = checkNotNull(info.signingInfo).apkContentsSigners.first().toByteArray()
        return MessageDigest.getInstance("SHA-256").digest(certificate).joinToString(":") { "%02X".format(it) }
    }

    /** Route A19: with ChromVoid chosen, Settings -> AutoFill says it provides passkeys. */
    @Test
    public fun theAutoFillPageSaysChromVoidProvidesPasskeys() {
        unlocked()
        rule.waitUntil(TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(ROOT_SETTINGS_TAG).fetchSemanticsNodes().isNotEmpty()
        }
        rule.onNodeWithTag(ROOT_SETTINGS_TAG).performClick()
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("passwords-passkeys")
        rule.onNodeWithTag(SETTINGS_AUTOFILL_TAG).performClick()
        rule.waitUntil(TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(AUTOFILL_PASSKEYS_TAG).fetchSemanticsNodes().isNotEmpty()
        }
        // Android 14 itself may fail to answer; later versions say it is on.
        val said = rule.onNodeWithTag(AUTOFILL_PASSKEYS_TAG).fetchSemanticsNode()
            .config[SemanticsProperties.Text].joinToString { it.text }
        val provides = rule.activity.getString(PresentationR.string.autofill_passkeys_enabled)
        val notSaid = rule.activity.getString(PresentationR.string.autofill_passkeys_unknown)
        val expected = if (Build.VERSION.SDK_INT == 34) setOf(provides, notSaid) else setOf(provides)
        assertTrue("the page said: $said", said in expected)
        rule.onNodeWithTag(AUTOFILL_PASSKEY_SETTINGS_TAG).assertExists()
    }

    private fun openProbe() {
        val context = instrumentation.context
        context.startActivity(
            Intent(context, PasskeyProbeActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        )
        // A new probe says "ready"; the one it replaces still shows its last outcome.
        await(By.text("ready"))
    }

    /**
     * Taps the system's Continue - in the phone's language - until [until] shows: the passkey
     * sheet, and before a device's first passkey its introduction.
     */
    private fun continueUntil(until: BySelector) {
        repeat(CONTINUE_STEPS) {
            if (find(until, SHORT_MILLIS) != null) return
            if (find(By.text(CONTINUE).pkg(CREDENTIAL_UI), SHORT_MILLIS) != null) {
                tap(By.text(CONTINUE).pkg(CREDENTIAL_UI))
            }
        }
        await(until)
    }

    /**
     * The sheet lists the credential by its account; one choice may also need a Continue, which
     * the sheet may take away again as it goes on by itself.
     */
    private fun chooseAccount() {
        tap(By.textContains(PasskeyProbeActivity.USER))
        find(By.text(CONTINUE).pkg(CREDENTIAL_UI), SHORT_MILLIS)?.let { continuing ->
            runCatching { continuing.click() }
        }
    }

    /** ChromVoid's own unlock screen over the asking app: its password field, not the app's. */
    private fun unlockVault() {
        val password = await(By.clazz("android.widget.EditText").pkg(rule.activity.packageName))
        password.text = VAULT
        tap(By.text(rule.activity.getString(PresentationR.string.access_unlock_submit)))
        awaitState { it is AirSessionState.Unlocked }
    }

    /**
     * User verification: the device's screen lock, in the system's own prompt. The test's own PIN
     * is typed; a device with its own lock - a phone - leaves it to its person, by PIN or finger.
     */
    private fun verifyUser() {
        if (!pinSet) return
        val field = await(By.res("com.android.systemui", "lockPassword"))
        field.text = PIN
        device.pressEnter()
    }

    /** What follows user verification, which a person may take a while over. */
    private fun awaitVerified(selector: BySelector): UiObject2 =
        if (pinSet) await(selector) else find(selector, PERSON_MILLIS) ?: await(selector)

    /** The system's sheets redraw as they settle, so an object found may go stale once. */
    private fun tap(selector: BySelector) {
        for (attempt in 1..TAP_ATTEMPTS) {
            val error = runCatching { await(selector).click() }.exceptionOrNull() ?: return
            if (error !is StaleObjectException || attempt == TAP_ATTEMPTS) throw error
        }
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

    /** Waits through the compose rule, which drives every composition's clock in this process. */
    private fun await(selector: BySelector): UiObject2 =
        find(selector, TIMEOUT_MILLIS) ?: error("nothing matched $selector; on screen: ${ourScreen()}")

    /**
     * What the probe and the app show, and the buttons of the system's passkey sheet - nothing of
     * any other app, and no account the sheet may name.
     */
    private fun ourScreen(): String {
        val ours = setOf(rule.activity.packageName, instrumentation.context.packageName, "android")
        return device.findObjects(By.pkg(Pattern.compile(".*")))
            .filter { node ->
                val sheetButton = CREDENTIAL_UI.matcher(node.applicationPackage).matches() && node.isClickable
                (node.applicationPackage in ours || sheetButton) && (node.text != null || node.resourceName != null)
            }
            .joinToString(" | ") { "${it.applicationPackage}:${it.resourceName} '${it.text}'" }
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

    private fun setting(name: String): String? =
        shell("settings get secure $name").trim().takeUnless { it == "null" || it.isEmpty() }

    private fun restoreSetting(name: String, value: String?) {
        shell(if (value == null) "settings delete secure $name" else "settings put secure $name $value")
    }

    private fun shell(command: String): String {
        val output = instrumentation.uiAutomation.executeShellCommand(command)
        return ParcelFileDescriptor.AutoCloseInputStream(output).bufferedReader().use { it.readText() }
    }

    private companion object {
        const val SERVICE = "com.chromvoid.app.ChromVoidCredentialProviderService"
        const val PASSWORD = "synthetic-site-password"
        const val ROOT_SETTINGS_TAG = "root-settings"
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val PIN = "1357"
        /** The Credential Manager sheet's Continue, in English or Russian. */
        val CONTINUE: Pattern = Pattern.compile("Continue|Продолжить")
        /** The system's passkey sheet: the platform's own, or Google Play services' on a phone with it. */
        val CREDENTIAL_UI: Pattern = Pattern.compile("com\\.android\\.credentialmanager|com\\.google\\.android\\.gms")
        const val CONTINUE_STEPS = 6
        const val TIMEOUT_MILLIS = 20_000L
        const val SHORT_MILLIS = 2_000L
        const val TAP_ATTEMPTS = 3
        const val PERSON_MILLIS = 120_000L
    }
}
