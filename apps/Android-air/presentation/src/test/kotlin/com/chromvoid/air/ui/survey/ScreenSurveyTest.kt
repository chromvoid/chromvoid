package com.chromvoid.air.ui.survey

import android.graphics.Bitmap
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.OtpPreviewResponse
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordRequest
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordsResponse
import com.chromvoid.air.ui.credentials.CodesCollection
import com.chromvoid.air.ui.credentials.CodesCollectionScreen
import com.chromvoid.air.ui.credentials.CredentialStore
import com.chromvoid.air.ui.credentials.CredentialFormModel
import com.chromvoid.air.ui.credentials.FORM_GROUP_TAG
import com.chromvoid.air.ui.credentials.FORM_LIST_TAG
import com.chromvoid.air.ui.dispatchSystemInsets
import com.chromvoid.air.ui.scrollToEnd
import com.chromvoid.air.ui.credentials.PICKER_NEW_TAG
import com.chromvoid.air.ui.credentials.PICKER_NEW_USE_TAG
import com.chromvoid.air.ui.credentials.PICKER_NEW_NAME_TAG
import com.chromvoid.air.ui.credentials.groupMenuTag
import com.chromvoid.air.ui.credentials.formFieldTag
import androidx.compose.ui.test.performTextInput
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.rounded.Check
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.test.doubleClick
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.chromvoid.air.bridge.wire.CredentialOtpSummary
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.FakeAccessSession
import com.chromvoid.air.ui.access.ACCESS_SUBMIT_TAG
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.access.AdministratorSetupScreen
import com.chromvoid.air.ui.access.DeviceUtilitiesSheet
import com.chromvoid.air.ui.access.PresenceCheck
import com.chromvoid.air.ui.access.PresenceGate
import com.chromvoid.air.ui.access.PresencePreference
import com.chromvoid.air.ui.access.PresenceScreen
import com.chromvoid.air.ui.access.UnlockScreen
import com.chromvoid.air.ui.access.WELCOME_CONTINUE_TAG
import com.chromvoid.air.ui.credentials.DETAIL_EDIT_TAG
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import com.chromvoid.air.ui.credentials.GENERATOR_REVEAL_TAG
import com.chromvoid.air.ui.credentials.GENERATOR_RUN_TAG
import com.chromvoid.air.ui.credentials.TAGS_NEW_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.air.ui.design.AirToast
import com.chromvoid.air.ui.design.PrimaryButton
import com.chromvoid.air.ui.documents.DOCUMENT_SOURCE_MODE_TAG
import com.chromvoid.air.ui.documents.DocumentModel
import com.chromvoid.air.ui.documents.DocumentNavigator
import com.chromvoid.air.ui.documents.DocumentScreen
import com.chromvoid.air.ui.documents.FakeMarkdown
import com.chromvoid.air.ui.documents.MARKDOWN_PREVIEW_TAG
import com.chromvoid.air.ui.help.HelpTopic
import com.chromvoid.air.ui.help.helpTopicTag
import com.chromvoid.air.ui.maintenance.BACKUP_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.APP_RESET_ACKNOWLEDGE_TAG
import com.chromvoid.air.ui.maintenance.APP_RESET_REVIEW_TAG
import com.chromvoid.air.ui.maintenance.AppReset
import com.chromvoid.air.ui.maintenance.AppResetModel
import com.chromvoid.air.ui.maintenance.AppResetScreen
import com.chromvoid.air.ui.maintenance.MAINTENANCE_LIST_TAG
import com.chromvoid.air.ui.maintenance.BackupDestination
import com.chromvoid.air.ui.maintenance.BackupRun
import com.chromvoid.air.ui.maintenance.BackupStore
import com.chromvoid.air.ui.maintenance.ERASE_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.EraseOutcome
import com.chromvoid.air.ui.maintenance.EraseReview
import com.chromvoid.air.ui.maintenance.EraseStore
import com.chromvoid.air.ui.maintenance.FakeMaintenanceStore
import com.chromvoid.air.ui.maintenance.MAINTENANCE_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.MaintenanceHost
import com.chromvoid.air.ui.maintenance.MaintenanceScope
import com.chromvoid.air.ui.maintenance.MaintenanceServices
import com.chromvoid.air.ui.maintenance.RESTORE_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.RestoreRun
import com.chromvoid.air.ui.maintenance.RestoreStore
import com.chromvoid.air.ui.root.RootScaffold
import com.chromvoid.air.ui.settings.AppearanceModel
import com.chromvoid.air.ui.settings.AppearancePreferences
import com.chromvoid.air.ui.settings.SETTINGS_BACKUP_TAG
import com.chromvoid.air.ui.settings.SETTINGS_ERASE_TAG
import com.chromvoid.air.ui.settings.SETTINGS_HELP_TAG
import com.chromvoid.air.ui.settings.SETTINGS_LIST_TAG
import com.chromvoid.air.ui.settings.SETTINGS_RESTORE_TAG
import com.chromvoid.air.ui.settings.SETTINGS_VAULT_PASSWORD_TAG
import com.chromvoid.air.ui.settings.SettingsRoot
import com.chromvoid.air.ui.vault.VaultRoot
import com.chromvoid.air.ui.vault.VaultScope
import java.io.File
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import org.junit.runners.model.Statement
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * A design survey, not a verification step: renders the vault's main screens
 * with Robolectric's native graphics on a phone-sized screen and writes them
 * to `build/survey`, for a side-by-side look with the iOS client's shots in
 * `design/ios-reference`. Runs only with `-Pair.survey=1` (or `-Dair.survey=1`).
 * Add `-Pair.survey.variant=dark|ru|phone360|phone360-ru|compact|compact-ru` (or the equivalent system property)
 * for separate `build/survey-<variant>` folders. All variants capture the same routes.
 * Phone360 variants use 360dp at fontScale 1.0; compact variants use 360dp at fontScale 1.3.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w393dp-h852dp-xxhdpi")
public class ScreenSurveyTest {
    private val variant = System.getProperty("air.survey.variant") ?: "light"

    // Configure resources before the activity starts, including dialogs and platform strings.
    @get:Rule(order = 0)
    public val surveyEnvironment: TestRule = TestRule { base, description ->
        object : Statement() {
            override fun evaluate() {
                assumeTrue(System.getProperty("air.survey") == "1")
                val variants = setOf("light", "dark", "ru", "phone360", "phone360-ru", "compact", "compact-ru")
                require(variant in variants) {
                    "Unknown survey variant: $variant"
                }
                val locale = Locale.getDefault()
                val qualifiers = RuntimeEnvironment.getQualifiers()
                val fontScale = RuntimeEnvironment.getFontScale()
                try {
                    when (variant) {
                        "dark" -> RuntimeEnvironment.setQualifiers("+night")
                        "ru" -> {
                            RuntimeEnvironment.setQualifiers("+ru")
                            Locale.setDefault(Locale.forLanguageTag("ru"))
                        }
                        "phone360", "phone360-ru", "compact", "compact-ru" -> {
                            val russian = variant.endsWith("-ru")
                            val language = if (russian) "ru-" else ""
                            RuntimeEnvironment.setQualifiers("${language}w360dp-h800dp-xxhdpi")
                            if (russian) Locale.setDefault(Locale.forLanguageTag("ru"))
                            RuntimeEnvironment.setFontScale(if (variant.startsWith("compact")) 1.3f else 1f)
                        }
                    }
                    base.evaluate()
                } finally {
                    RuntimeEnvironment.setQualifiers(qualifiers)
                    RuntimeEnvironment.setFontScale(fontScale)
                    Locale.setDefault(locale)
                }
            }
        }
    }

    @get:Rule(order = 1)
    public val rule = createAndroidComposeRule<ComponentActivity>()

    /** The root must draw even between screens, including a forced theme opposite to the system. */
    @Test
    public fun surveyRootCanvas() {
        val appearance = AppearanceModel(object : AppearancePreferences {
            override var theme = "system"
            override var language = "system"
        })
        rule.setContent {
            AirTheme(appearance.state.collectAsState().value.theme) {
                RootScaffold(unlocked = true, vault = {})
            }
        }
        for (theme in listOf(AppearanceModel.Theme.DARK, AppearanceModel.Theme.LIGHT, AppearanceModel.Theme.SYSTEM)) {
            rule.runOnIdle { appearance.setTheme(theme) }
            shot("root-canvas-${theme.stored}")
        }
    }

    /** Captures the command context while working and the short result announcement. */
    @Test
    public fun surveyActionFeedback() {
        rule.setContent {
            AirTheme {
                Column(
                    modifier = Modifier.fillMaxSize().background(Air.colors.canvas).padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(24.dp),
                ) {
                    PrimaryButton(stringResource(R.string.access_unlock_submit), onClick = {}, busy = true)
                    AirToast(
                        stringResource(R.string.wallet_copied),
                        androidx.compose.material.icons.Icons.Rounded.Check,
                    )
                }
            }
        }
        shot("action-feedback")
    }

    private val store = FakeCredentialStore(
        listOf(
            summary("cloud", "Cloud drive", "alice.m").copy(hasCodes = true),
            summary("wifi", "Home Wi-Fi", "home-network").copy(groupPath = "/Personal"),
            summary("mail", "Personal mail", "alice@example.com").copy(groupPath = "/Personal"),
            summary("work", "Work account", "a.miller").copy(groupPath = "/Work"),
        ),
    ).apply {
        secrets["cloud" to "password"] = "u7#Kq9!vT2@pLx4"
        secrets["cloud" to "note"] = "Synthetic note"
        tags["work"] = "Work" to "blue"
        websiteRules["cloud"] = listOf(
            com.chromvoid.air.bridge.wire.CredentialWebsiteRule("base_domain", 0, "cloud.example.com"),
            com.chromvoid.air.bridge.wire.CredentialWebsiteRule("starts_with", 1, "https://login.example.com/"),
        )
        groups += listOf("/Personal", "/Work", "/Work/Clients")
        tags["family"] = "Family" to "pink"
        tags["travel"] = "Travel" to "amber"
        sshKeys["k1"] = com.chromvoid.air.bridge.wire.SSHKeyMetadata(
            comment = "alice@laptop",
            fingerprint = "SHA256:q3v1Xw9kR7mPzT2bN8cLd4Yh6Jf0sEa5Uo1iWgKxVbE",
            id = "k1",
            name = "Deploy key",
            type = "ed25519",
        )
        otps["cloud"] = mutableListOf(
            CredentialOtpSummary(
                algorithm = "SHA1",
                digits = 6,
                encoding = "base32",
                label = "Main code",
                otpType = "TOTP",
                period = 30,
            ),
        )
    }

    @Test
    public fun surveyTheVault() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val vault = VaultScope(store, generation = 1uL, clipboard = FakeClipboard(), searchDelayMillis = 0)
        rule.setContent { AirTheme { RootScaffold(unlocked = true, vault = { VaultRoot(vault, it) }) } }
        rule.waitForIdle()
        shot("vault")
        rule.onNodeWithTag(catalogRowTag("cloud")).performClick()
        rule.waitForIdle()
        shot("credential")
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        rule.waitForIdle()
        rule.dispatchSystemInsets()
        shot("edit")
        rule.onNodeWithTag(FORM_LIST_TAG).scrollToEnd()
        shot("edit-end")
        rule.dispatchSystemInsets(navigationBottomDp = 0)
        vault.openCodesManager()
        shot("codes-manager")
        vault.closeCodesManager()
        vault.discardForm()
        vault.closeDetail()
        vault.openCodesCollection()
        rule.waitForIdle()
        shot("codes")
        vault.closeCodesCollection()
        vault.openTagFilter()
        rule.waitForIdle()
        shot("tags")
        rule.onNodeWithTag(TAGS_NEW_TAG).performClick()
        shot("tag-new")
        vault.closeTags()
        vault.openSsh()
        rule.waitForIdle()
        shot("ssh")
        vault.closeSsh()
        vault.openAudit()
        rule.waitForIdle()
        shot("audit")
        vault.closeAudit()
        rule.onNodeWithTag(catalogRowTag("cloud")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        rule.waitForIdle()
        vault.chooseGroup()
        shot("group-picker")
        vault.closePicker()
        vault.openGenerator()
        rule.waitForIdle()
        rule.onNodeWithTag(GENERATOR_RUN_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(GENERATOR_REVEAL_TAG).performClick()
        shot("generator")
        vault.closeGenerator()
        vault.openWebsites()
        rule.waitForIdle()
        shot("websites")
        vault.closeWebsites()
        vault.discardForm()
        vault.closeDetail()
        vault.beginCreate(com.chromvoid.air.ui.credentials.CredentialFormModel.Kind.LOGIN)
        shot("login-new")
    }

    @Test
    public fun surveyGroupActions() {
        val vault = VaultScope(store, generation = 1uL, clipboard = FakeClipboard(), searchDelayMillis = 0)
        rule.setContent { AirTheme { RootScaffold(unlocked = true, vault = { VaultRoot(vault, it) }) } }
        rule.onNodeWithTag(groupMenuTag("/Personal")).performClick()
        shot("group-menu")
    }

    @Test
    public fun surveyDraftGroup() {
        val vault = VaultScope(store, generation = 1uL, clipboard = FakeClipboard(), searchDelayMillis = 0)
        rule.setContent { AirTheme { RootScaffold(unlocked = true, vault = { VaultRoot(vault, it) }) } }
        vault.beginCreate(CredentialFormModel.Kind.LOGIN)
        val form = checkNotNull(vault.form.value)
        form.change(CredentialFormModel.Field.TITLE, "New login")
        vault.chooseGroup()
        checkNotNull(vault.picker.value).open("/Personal")
        rule.onNodeWithTag(PICKER_NEW_TAG).performClick()
        rule.onNodeWithTag(PICKER_NEW_NAME_TAG).performTextInput("Travel")
        shot("group-picker-new")
        rule.onNodeWithTag(PICKER_NEW_USE_TAG).performClick()
        rule.onNodeWithTag(FORM_GROUP_TAG).performScrollTo()
        shot("group-draft")
        form.change(CredentialFormModel.Field.GROUP, "/Personal/..")
        store.failWith = CoreRefusal("INVALID_PATH", "passmanager:group:page")
        form.save()
        settle { form.state.value.errors.containsKey(CredentialFormModel.Field.GROUP) }
        rule.onNodeWithTag(formFieldTag(CredentialFormModel.Field.GROUP)).performScrollTo()
        shot("group-draft-error")
    }

    @Test
    public fun surveyCodesReadFailure() {
        store.entries += summary("bank", "Bank account", "alice").copy(hasCodes = true)
        store.otps["bank"] = store.otps.getValue("cloud").toMutableList()
        val partialStore = object : CredentialStore by store {
            override suspend fun otpRecords(id: String, generation: ULong): PassmanagerOtpRecordsResponse {
                if (id == "cloud") throw CoreRefusal("INTERNAL", "passmanager:otp:records")
                return store.otpRecords(id, generation)
            }
        }
        val collection = CodesCollection(partialStore, 1uL, CoroutineScope(Dispatchers.Main), FakeClipboard())
        rule.setContent {
            AirTheme { RootScaffold(unlocked = true, vault = { CodesCollectionScreen(collection, {}, {}, {}) }) }
        }
        settle { collection.codesFor("cloud").state.value.status ==
            com.chromvoid.air.ui.credentials.CodesModel.Status.FAILED }
        shot("codes-entry-error")
    }

    @Test
    public fun surveyCodeRefresh() {
        val refreshed = CompletableDeferred<OtpPreviewResponse>()
        var requests = 0
        val refreshingStore = object : CredentialStore by store {
            override suspend fun otpCode(request: PassmanagerOtpRecordRequest, generation: ULong): OtpPreviewResponse {
                requests += 1
                return if (requests == 1) store.otpCode(request, generation) else refreshed.await()
            }
        }
        val collection = CodesCollection(refreshingStore, 1uL, CoroutineScope(Dispatchers.Main), FakeClipboard())
        rule.setContent {
            AirTheme { RootScaffold(unlocked = true, vault = { CodesCollectionScreen(collection, {}, {}, {}) }) }
        }
        val codes = collection.codesFor("cloud")
        settle { codes.state.value.shown.containsKey("Main code") }
        rule.runOnIdle { codes.hideShown() }
        settle { requests == 2 }
        shot("codes-updating")
        rule.runOnIdle { refreshed.complete(OtpPreviewResponse(leftSeconds = 30, otp = "654321", period = 30)) }
        settle { codes.state.value.shown["Main code"]?.code == "654321" }
        shot("codes-refreshed")
        rule.runOnIdle { collection.close() }
    }

    @Test
    public fun surveySshResults() {
        val vault = VaultScope(store, generation = 1uL, clipboard = FakeClipboard(), searchDelayMillis = 0)
        rule.setContent { AirTheme { RootScaffold(unlocked = true, vault = { VaultRoot(vault, it) }) } }
        vault.openSsh()
        val model = checkNotNull(vault.ssh.value)
        model.search("missing")
        shot("ssh-no-match")
        model.clearFilters()
        store.failWith = CoreRefusal("SYNC_CONFLICT", "passmanager:ssh:page")
        model.reload()
        shot("ssh-stale")
        store.failWith = CoreRefusal("INTERNAL", "passmanager:ssh:page")
        model.reload()
        shot("ssh-failed")
    }

    @Test
    public fun surveySecondaryTextStates() {
        val vault = VaultScope(store, generation = 1uL, clipboard = FakeClipboard(), searchDelayMillis = 0)
        rule.setContent { AirTheme { RootScaffold(unlocked = true, vault = { VaultRoot(vault, it) }) } }
        vault.catalog.search("cloud")
        shot("vault-search")
        vault.catalog.clearSearch()
        rule.waitForIdle()
        vault.catalog.beginSelection("cloud")
        shot("vault-select")
        vault.catalog.endSelection()
        vault.beginCreate(com.chromvoid.air.ui.credentials.CredentialFormModel.Kind.LOGIN)
        shot("login-new")
        vault.openWebsites()
        checkNotNull(vault.websites.value).add()
        shot("websites-new")
        vault.closeWebsites()
        vault.discardForm()
        vault.openTransfers(com.chromvoid.air.ui.transfer.TransferMode.IMPORT)
        shot("credential-import")
    }

    @Test
    public fun surveyUnavailableSession() {
        val session = FakeAccessSession(AirSessionState.Unavailable("STORAGE_UNAVAILABLE"))
        val model = AccessViewModel(session)
        val shell = com.chromvoid.air.ui.ShellViewModel(session, store, FakeClipboard())
        rule.setContent { AirTheme { com.chromvoid.air.ui.AirApp(model, shell, onRetry = {}) } }
        shot("session-unavailable")
    }

    @Test
    public fun surveySshForms() {
        val model = com.chromvoid.air.ui.ssh.SshModel(store, 1uL, CoroutineScope(Dispatchers.Main), FakeClipboard())
        rule.setContent { AirTheme { com.chromvoid.air.ui.ssh.SshScreen(model, onBack = {}) } }
        model.beginCreation()
        val form = checkNotNull(model.creation.value)
        form.change(com.chromvoid.air.ui.ssh.SshCreationModel.Field.NAME, "Deploy key")
        shot("ssh-create")
        form.setMode(com.chromvoid.air.ui.ssh.SshCreationModel.Mode.IMPORT)
        form.change(com.chromvoid.air.ui.ssh.SshCreationModel.Field.NAME, "Imported key")
        shot("ssh-import")
        model.endCreation()
        rule.waitForIdle()
        model.select("k1")
        val detail = checkNotNull(model.selected.value)
        detail.beginEdit()
        shot("ssh-rename")
        detail.cancelEdit()
        detail.beginExport(com.chromvoid.air.ui.ssh.SshDetailModel.ExportKind.PRIVATE_KEY)
        detail.changePassphrase("synthetic-passphrase")
        shot("ssh-export")
    }

    /** Cards as objects: the page's face, the form typed on the face, and every network's colours. */
    @Test
    public fun surveyCards() {
        assumeTrue(System.getProperty("air.survey") == "1")
        store.entries += summary("visa", "Everyday Visa").copy(entryType = "payment_card")
        store.cards["visa"] = com.chromvoid.air.bridge.wire.PaymentCardMetadata(
            brand = "visa",
            cardholderName = "ALICE MILLER",
            expMonth = 6,
            expYear = 2031,
            last4 = "1111",
        )
        store.secrets["visa" to "card_pan"] = "4111111111111111"
        store.secrets["visa" to "card_cvv"] = "123"
        val cards = com.chromvoid.air.ui.credentials.FakeCardRules
        val vault = VaultScope(
            store,
            generation = 1uL,
            clipboard = FakeClipboard(),
            searchDelayMillis = 0,
            cards = cards,
        )
        val gallery = mutableStateOf(false)
        rule.setContent {
            AirTheme {
                if (gallery.value) {
                    CardGallery()
                } else {
                    RootScaffold(unlocked = true, vault = { VaultRoot(vault, it) })
                }
            }
        }
        rule.waitForIdle()
        vault.open("visa")
        rule.waitUntil(5_000) { vault.detail.value?.state?.value?.detail != null }
        shot("card")
        val page = checkNotNull(vault.detail.value)
        page.reveal("card_pan")
        rule.waitUntil(5_000) { page.state.value.revealed.containsKey("card_pan") }
        page.reveal("card_cvv")
        rule.waitUntil(5_000) { page.state.value.revealed.containsKey("card_cvv") }
        shot("card-revealed")
        vault.closeDetail()
        vault.beginCreate(com.chromvoid.air.ui.credentials.CredentialFormModel.Kind.CARD)
        rule.waitForIdle()
        shot("card-new")
        val form = checkNotNull(vault.form.value)
        form.change(com.chromvoid.air.ui.credentials.CredentialFormModel.Field.CARD_NUMBER, "3782822463")
        form.change(com.chromvoid.air.ui.credentials.CredentialFormModel.Field.CARDHOLDER, "ALICE MILLER")
        rule.waitForIdle()
        shot("card-typing")
        form.change(com.chromvoid.air.ui.credentials.CredentialFormModel.Field.CARD_NUMBER, "4111111111111112")
        form.numberFocusChanged(false)
        form.save()
        rule.waitForIdle()
        shot("card-checks")
        vault.discardForm()
        gallery.value = true
        shot("card-networks")
    }

    @androidx.compose.runtime.Composable
    private fun CardGallery() {
        val brands = listOf(null) + com.chromvoid.air.ui.credentials.PaymentCardBrand.entries
        androidx.compose.foundation.lazy.LazyColumn(
            modifier = androidx.compose.ui.Modifier.background(com.chromvoid.air.ui.Air.colors.canvas),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(16.dp),
        ) {
            items(brands.size) { index ->
                val brand = brands[index]
                com.chromvoid.air.ui.credentials.PaymentCardFace(
                    com.chromvoid.air.ui.credentials.CredentialDetailModel.CardFace(
                        brand = brand,
                        number = if (brand == com.chromvoid.air.ui.credentials.PaymentCardBrand.AMEX) {
                            "•••• •••••• •4242"
                        } else {
                            "•••• •••• •••• 4242"
                        },
                        holder = "Alice Miller",
                        expiry = "06/31",
                        code = null,
                    ),
                    onToggleCode = {},
                    codeBusy = false,
                )
            }
        }
    }

    /** The same vault on a landscape tablet: the list and the open record side by side. */
    @Test
    @Config(qualifiers = "w1280dp-h800dp-land-xhdpi")
    public fun surveyTheVaultOnATablet() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val vault = VaultScope(store, generation = 1uL, clipboard = FakeClipboard(), searchDelayMillis = 0)
        rule.setContent { AirTheme { RootScaffold(unlocked = true, vault = { VaultRoot(vault, it) }) } }
        rule.waitForIdle()
        shot("tablet-vault")
        rule.onNodeWithTag(catalogRowTag("cloud")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(catalogRowTag("cloud")).assertIsSelected()
        shot("tablet-credential")
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        rule.dispatchSystemInsets()
        shot("tablet-edit")
        rule.onNodeWithTag(FORM_LIST_TAG).scrollToEnd()
        shot("tablet-edit-end")
        rule.dispatchSystemInsets(navigationBottomDp = 0)
        vault.openGenerator()
        shot("tablet-generator")
    }

    @Test
    public fun surveyTheEntryScreens() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val screen = mutableStateOf("setup")
        val gate = gate()
        rule.setContent {
            AirTheme {
                when (screen.value) {
                    "setup" -> AdministratorSetupScreen(
                        AccessViewModel(FakeAccessSession.firstRun()),
                        onHelp = {},
                        onRestore = {},
                    )
                    "unlock" -> UnlockScreen(
                        AccessViewModel(FakeAccessSession.locked()),
                        onHelp = {},
                        onUtilities = {},
                    )
                    "utilities" -> DeviceUtilitiesSheet(offers = { true }, onChoose = {}, onClose = {})
                    else -> PresenceScreen(gate)
                }
            }
        }
        shot("welcome")
        rule.onNodeWithTag(WELCOME_CONTINUE_TAG).performClick()
        shot("setup")
        screen.value = "unlock"
        shot("locked")
        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performClick()
        shot("locked-error")
        screen.value = "utilities"
        shot("utilities")
        screen.value = "presence"
        shot("presence")
    }

    @Test
    public fun surveyFiles() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val files = filesFixture()
        rule.setContent {
            AirTheme { RootScaffold(unlocked = true, files = { com.chromvoid.air.ui.files.FilesRoot(files, it) }) }
        }
        rule.onNodeWithTag("root-files").performClick()
        shot("files")
        files.top.setNotesOnly(true)
        shot("files-notes")
        files.top.setNotesOnly(false)
        rule.waitForIdle()
        files.open(files.top.state.value.items.first { it.name == "Trips" })
        shot("files-folder")
        files.closeFolder()
        rule.waitForIdle()
        files.top.beginSelection(files.top.state.value.items.first { it.name == "Receipt.jpg" })
        files.beginOperation(com.chromvoid.air.ui.files.FileOperationModel.Kind.MOVE)
        shot("files-move")
        files.closeOperation()
        files.top.endSelection()
        rule.waitForIdle()
        files.beginCreateFolder()
        shot("files-name")
        files.cancelEdit()
        rule.waitForIdle()
        files.showInfo(files.top.state.value.items.first { it.name == "Receipt.jpg" })
        shot("files-info")
        files.closeInfo()
        rule.waitForIdle()
        files.beginImport()
        shot("files-import")
        files.closeImport()
        rule.waitForIdle()
        files.beginNote()
        shot("files-note-new")
        files.note.value?.setName("Packing")
        files.note.value?.setText("- [ ] Passport\n- [ ] Tickets")
        shot("files-note")
        files.discardNote()
        rule.waitForIdle()
        files.top.beginSelection(files.top.state.value.items.first { it.name == "Trip.md" })
        files.top.toggleSelection(files.top.state.value.items.first { it.name == "Documents" })
        files.beginExport()
        shot("files-export")
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp-land-xhdpi")
    public fun surveyFilesOnATablet() {
        val files = filesFixture()
        rule.setContent {
            AirTheme { RootScaffold(unlocked = true, files = { com.chromvoid.air.ui.files.FilesRoot(files, it) }) }
        }
        rule.onNodeWithTag("root-files").performClick()
        shot("tablet-files")
    }

    private fun filesFixture(): com.chromvoid.air.ui.files.FilesScope {
        val store = com.chromvoid.air.ui.files.FakeFileStore().apply {
            folder("Documents")
            folder("Trips")
            file("Plan.md", parent = "/Trips", size = 1_204)
            file("Passport.pdf", parent = "/Documents", size = 842_112, mimeType = "application/pdf")
            file("Trip.md", size = 57, mimeType = "text/markdown")
            file("Receipt.jpg", size = 214_530, mimeType = "image/jpeg")
        }
        return com.chromvoid.air.ui.files.FilesScope(
            store,
            generation = 1uL,
            settings = com.chromvoid.air.ui.files.FileSettings(com.chromvoid.air.ui.files.MemoryFilePreferences()),
            searchDelayMillis = 0,
        )
    }

    @Test
    public fun surveyFileRecoveryStates() {
        val store = com.chromvoid.air.ui.files.FakeFileStore().apply {
            repeat(40) { file("Receipt-%02d.pdf".format(it + 1), mimeType = "application/pdf", size = 2_048) }
        }
        val files = com.chromvoid.air.ui.files.FilesScope(
            store,
            generation = 1uL,
            settings = com.chromvoid.air.ui.files.FileSettings(com.chromvoid.air.ui.files.MemoryFilePreferences()),
            searchDelayMillis = 0,
            device = com.chromvoid.air.ui.files.ExportTestDevice(),
        )
        rule.setContent {
            AirTheme { RootScaffold(unlocked = true, files = { com.chromvoid.air.ui.files.FilesRoot(files, it) }) }
        }
        rule.onNodeWithTag("root-files").performClick()
        files.top.setNotesOnly(true)
        shot("files-notes-empty")
        files.top.setNotesOnly(false)
        rule.waitForIdle()
        files.top.beginSelection()
        val last = files.top.state.value.items.last()
        rule.onNodeWithTag(com.chromvoid.air.ui.files.FILES_LIST_TAG).performScrollToKey("item:${last.nodeID}")
        rule.onNodeWithTag(com.chromvoid.air.ui.files.fileRowTag(last.name)).performClick()
        shot("files-select")
        files.beginExport()
        files.export.value?.pickerFailed(com.chromvoid.air.ui.files.FileExportModel.PickerIssue.UNAVAILABLE)
        shot("files-export-error")
    }

    @Test
    public fun surveyGallery() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val pixels = IntArray(1200 * 800) { index ->
            val x = index % 1200
            val y = index / 1200
            android.graphics.Color.rgb(40 + x * 150 / 1200, 90 + y * 120 / 800, 170)
        }
        val png = java.io.ByteArrayOutputStream().use { out ->
            android.graphics.Bitmap.createBitmap(pixels, 1200, 800, android.graphics.Bitmap.Config.ARGB_8888)
                .compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out)
            out.toByteArray()
        }
        val store = com.chromvoid.air.ui.files.FakeFileStore().apply {
            file("Lake.png", png, mimeType = "image/png")
            file("Harbour.png", png, mimeType = "image/png")
        }
        val files = com.chromvoid.air.ui.files.FilesScope(
            store,
            generation = 1uL,
            settings = com.chromvoid.air.ui.files.FileSettings(com.chromvoid.air.ui.files.MemoryFilePreferences()),
            searchDelayMillis = 0,
        )
        rule.setContent {
            AirTheme { RootScaffold(unlocked = true, files = { com.chromvoid.air.ui.files.FilesRoot(files, it) }) }
        }
        rule.onNodeWithTag("root-files").performClick()
        rule.waitForIdle()
        files.open(files.top.state.value.items.first { it.name == "Harbour.png" })
        // Robolectric cannot finish a platform decode: the frame surveys the gallery's chrome.
        shot("gallery")
        rule.onNodeWithTag(com.chromvoid.air.ui.media.GALLERY_INFO_TAG).performClick()
        shot("gallery-info")
    }

    @Test
    public fun surveyPdf() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val store = com.chromvoid.air.ui.files.FakeFileStore().apply { file("Statement.pdf", ByteArray(64) { 1 }) }
        val document = object : com.chromvoid.air.ui.media.PdfDocument {
            override val pageCount: Int = 3

            override val readsText: Boolean = true

            override fun find(index: Int, query: String): List<List<com.chromvoid.air.ui.media.PdfRect>> =
                emptyList()

            override fun links(index: Int): List<com.chromvoid.air.ui.media.PdfLink> = emptyList()

            override fun pageSize(index: Int): Pair<Int, Int> = 595 to 842

            override fun text(index: Int): String = "Statement - page ${index + 1}"

            override fun renderRegion(
                index: Int, pagePixelWidth: Int, left: Int, top: Int, width: Int, height: Int,
            ): android.graphics.Bitmap {
                val bitmap = android.graphics.Bitmap.createBitmap(
                    width,
                    height,
                    android.graphics.Bitmap.Config.ARGB_8888,
                )
                val canvas = android.graphics.Canvas(bitmap)
                canvas.drawColor(android.graphics.Color.WHITE)
                canvas.translate(-left.toFloat(), -top.toFloat())
                val fullWidth = pagePixelWidth
                val fullHeight = fullWidth * 842 / 595
                val paint = android.graphics.Paint().apply { textSize = fullWidth / 18f }
                canvas.drawText("Statement - page ${index + 1}", fullWidth / 10f, fullHeight / 8f, paint)
                repeat(12) { line ->
                    paint.color = android.graphics.Color.LTGRAY
                    canvas.drawRect(
                        fullWidth / 10f,
                        fullHeight / 5f + line * fullHeight / 20f,
                        fullWidth * 0.9f,
                        fullHeight / 5f + line * fullHeight / 20f + fullHeight / 60f,
                        paint,
                    )
                }
                return bitmap
            }

            override fun close() = Unit
        }
        val model = com.chromvoid.air.ui.media.PdfPreviewModel(
            store,
            store.named("Statement.pdf").id,
            1uL,
            "Statement.pdf",
            CoroutineScope(Dispatchers.Main),
            open = { _, _ -> document },
        )
        rule.setContent { AirTheme { com.chromvoid.air.ui.media.PdfPreviewScreen(model, onClose = {}, onLock = {}) } }
        rule.waitUntil(5_000) {
            rule.onAllNodesWithTag(com.chromvoid.air.ui.media.pdfDrawnTag(0)).fetchSemanticsNodes().isNotEmpty()
        }
        shot("pdf")
        rule.onNodeWithTag(com.chromvoid.air.ui.media.pdfPageTag(0)).performTouchInput {
            doubleClick(androidx.compose.ui.geometry.Offset(width * 0.25f, height * 0.18f))
        }
        rule.waitUntil(SURVEY_WAIT_MILLIS) {
            model.state.value.viewport(0).zoom > 1f &&
                rule.onAllNodesWithTag(com.chromvoid.air.ui.media.pdfDrawnTag(0)).fetchSemanticsNodes().isNotEmpty()
        }
        shot("pdf-zoomed")
    }

    @Test
    public fun surveyDocument() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val store = com.chromvoid.air.ui.files.FakeFileStore().apply {
            documentByteLimit = 4096
            file(
                "Trip.md",
                (
                    "# Trip\n- [x] Passport\n- [ ] Insurance\n- [ ] Hotel booking\n" +
                        "Flights are in [the booking](note:Booking).\n# Packing\nWarm layers for the evenings."
                    ).encodeToByteArray(),
                mimeType = "text/markdown",
            )
        }
        val markdown = FakeMarkdown()
        val scope = CoroutineScope(Dispatchers.Main)
        val settings = com.chromvoid.air.ui.files.FileSettings(com.chromvoid.air.ui.files.MemoryFilePreferences())
        val navigator = DocumentNavigator(store, store.named("Trip.md").id, 1uL, scope) { id, anchor ->
            DocumentModel(
                store,
                id,
                1uL,
                scope,
                anchor,
                parse = markdown::parse,
                toggle = markdown::toggle,
                settings = settings,
            )
        }
        val device = object : com.chromvoid.air.ui.files.FileDevice {
            override fun source(document: android.net.Uri): com.chromvoid.air.ui.files.FileSource = error("survey")

            override fun openImageNow(document: android.net.Uri): com.chromvoid.air.ui.files.FileSource? = null

            override fun destination(document: android.net.Uri): com.chromvoid.air.ui.files.FileDestination =
                error("survey")

            override fun destination(
                folder: android.net.Uri,
                name: String,
                mimeType: String?,
            ): com.chromvoid.air.ui.files.FileDestination = error("survey")

            override fun gallery(name: String, mimeType: String?): com.chromvoid.air.ui.files.FileDestination? = null
        }
        rule.setContent { AirTheme { DocumentScreen(navigator, onClose = {}, onLock = {}, device = device) } }
        rule.waitUntil(5_000) { rule.onAllNodesWithTag(MARKDOWN_PREVIEW_TAG).fetchSemanticsNodes().isNotEmpty() }
        shot("document")
        rule.onNodeWithTag(DOCUMENT_SOURCE_MODE_TAG).performClick()
        shot("document-source")
    }

    @Test
    public fun surveyAttachmentFolder() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val store = com.chromvoid.air.ui.files.FakeFileStore().apply {
            folder("attachments")
            folder("Photos")
            folder("Trips")
        }
        val settings = com.chromvoid.air.ui.files.FileSettings(com.chromvoid.air.ui.files.MemoryFilePreferences())
        val files = com.chromvoid.air.ui.files.FilesScope(store, 1uL, settings, searchDelayMillis = 0)
        rule.setContent { AirTheme { SettingsRoot(presence = null, files = settings, attachments = files) } }
        rule.onNodeWithTag(com.chromvoid.air.ui.settings.SETTINGS_ATTACHMENT_FOLDER_TAG).performScrollTo()
        shot("settings-attachments")
        files.chooseAttachmentFolder()
        rule.waitForIdle()
        shot("attachment-folder")
    }

    @Test
    public fun surveyIncomingShare() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val screen = mutableStateOf("locked")
        val files = com.chromvoid.air.ui.files.FilesScope(
            com.chromvoid.air.ui.files.FakeFileStore(),
            1uL,
            com.chromvoid.air.ui.files.FileSettings(com.chromvoid.air.ui.files.MemoryFilePreferences()),
            searchDelayMillis = 0,
        )
        files.receiveShare(
            listOf(com.chromvoid.air.ui.files.MemorySource("1password-export.1pux", ByteArray(4), "application/zip")),
            onCredentials = {},
        )
        rule.setContent {
            AirTheme {
                when (screen.value) {
                    "locked" -> UnlockScreen(
                        AccessViewModel(FakeAccessSession.locked()),
                        onHelp = {},
                        onUtilities = {},
                        pendingShare = 1,
                    )
                    else -> com.chromvoid.air.ui.files.IncomingShareScreen(
                        files.incoming.value!!,
                        device = null,
                        onClose = {},
                        onLock = {},
                    )
                }
            }
        }
        shot("incoming-locked")
        screen.value = "review"
        shot("incoming-review")
    }

    @Test
    public fun surveyWallet() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val store = com.chromvoid.air.ui.wallet.FakeWalletStore()
        store.wallet("Everyday", listOf("ton", "bitcoin", "ethereum"))
        store.wallet("Savings", listOf("bitcoin"))
        store.accounts[0] = store.accounts[0].copy(mnemonicStandard = "rotation")
        store.contacts += com.chromvoid.air.bridge.wire.WalletAddressBookEntry(
            "UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG",
            1,
            "c1",
            "Анна · холодный",
            "ton",
            1,
        )
        store.contacts += com.chromvoid.air.bridge.wire.WalletAddressBookEntry(
            "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
            1,
            "c2",
            "Exchange deposit",
            "bitcoin",
            1,
        )
        store.accounts.forEach { account ->
            store.live[account.accountID] = when (account.network) {
                "ton" -> "12500000000"
                "bitcoin" -> "4210000"
                else -> "310000000000000000"
            }
        }
        val model = com.chromvoid.air.ui.wallet.WalletModel(
            store,
            1uL,
            CoroutineScope(Dispatchers.Main),
            FakeClipboard(),
        )
        rule.setContent { AirTheme { com.chromvoid.air.ui.wallet.WalletRoot(model, onBack = {}, onLock = {}) } }
        rule.waitForIdle()
        shot("wallet")
        model.openNetwork(model.state.value.walletAccounts.first().accountID)
        shot("wallet-network")
        model.openReceive()
        shot("wallet-receive")
        model.closeAccountRoute()
        model.closeNetwork()
        model.beginSetup(com.chromvoid.air.ui.wallet.WalletSetupModel.Intent.CREATE)
        shot("wallet-create")
        model.state.value.setup!!.change(com.chromvoid.air.ui.wallet.WalletSetupModel.Field.LABEL, "Everyday")
        shot("wallet-create-filled")
        model.closeSetup()
        model.beginSetup(com.chromvoid.air.ui.wallet.WalletSetupModel.Intent.RESTORE)
        shot("wallet-restore")
        val restore = checkNotNull(model.state.value.setup)
        restore.change(com.chromvoid.air.ui.wallet.WalletSetupModel.Field.LABEL, "Restored")
        restore.change(com.chromvoid.air.ui.wallet.WalletSetupModel.Field.MNEMONIC, store.phrase.joinToString(" "))
        shot("wallet-restore-filled")
        model.closeSetup()
        model.openSend()
        val send = model.state.value.send!!
        val recipient = send.state.value.recipients.first().id
        send.change(
            com.chromvoid.air.ui.wallet.WalletSendModel.Field.Address(recipient),
            "UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG",
        )
        send.change(com.chromvoid.air.ui.wallet.WalletSendModel.Field.Amount(recipient), "1.5")
        send.calculateQuote()
        shot("wallet-send")
        send.prepare()
        shot("wallet-send-review")
        send.cancelReview()
        rule.waitForIdle()
        store.warnings = listOf(
            com.chromvoid.air.bridge.wire.WalletWarning("destination_uninitialized_bounceable", "uninitialized"),
        )
        send.prepare()
        shot("wallet-send-warnings")
        send.toggleWarning("destination_uninitialized_bounceable")
        send.change(com.chromvoid.air.ui.wallet.WalletSendModel.Field.Password, "admin")
        send.confirm()
        shot("wallet-send-result")
        model.showSendHistory()
        shot("wallet-activity")
        model.closeHistory()
        model.openAddressBook()
        shot("wallet-contacts")
        model.addressBook.add()
        model.addressBook.change(com.chromvoid.air.ui.wallet.WalletAddressBookModel.Field.LABEL, "Market")
        model.addressBook.change(com.chromvoid.air.ui.wallet.WalletAddressBookModel.Field.NETWORK, "ton")
        shot("wallet-contact-editor")
        model.addressBook.discard()
        model.closeAddressBook()
        model.openRecovery()
        shot("wallet-recovery")
        val recovery = model.state.value.recovery!!
        recovery.changePassword(store.adminPassword)
        shot("wallet-recovery-filled")
        recovery.rotateKey()
        shot("wallet-recovery-revealed")
    }

    @Test
    public fun surveyWalletRebroadcast() {
        val store = com.chromvoid.air.ui.wallet.FakeWalletStore().apply { wallet("Everyday", listOf("ton")) }
        val account = store.accounts.single()
        store.journal += store.entry(account, "synthetic-transfer", status = "broadcast_unknown").copy(
            createdAt = 1_726_000_000_000,
            updatedAt = 1_726_000_000_000,
        )
        val model = com.chromvoid.air.ui.wallet.WalletHistoryModel(
            account.walletID,
            account.accountID,
            account.network,
            store,
            1uL,
            CoroutineScope(Dispatchers.Main),
            FakeClipboard(),
        )
        model.updateAvailability(
            com.chromvoid.air.bridge.wire.WalletStatusResponse(
                enabled = true,
                initialized = true,
                networks = store.networks,
                walletCount = 1,
            ),
        )
        rule.setContent {
            AirTheme {
                com.chromvoid.air.ui.wallet.WalletHistoryScreen(model, "Everyday", onBack = {}, onLock = {})
            }
        }
        settle { model.state.value.phase == com.chromvoid.air.ui.wallet.WalletHistoryModel.Phase.READY }
        model.open("synthetic-transfer")
        model.beginRebroadcast()
        rule.waitForIdle()
        rule.onNodeWithTag(com.chromvoid.air.ui.wallet.TRANSACTION_TAG).performScrollToKey("rebroadcast")
        shot("wallet-rebroadcast")
    }

    @Test
    public fun surveyPasskeys() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val store = com.chromvoid.air.ui.passkeys.FakePasskeyStore()
        store.passkey("p1", "github.com", "octocat", "The Octocat", used = 1_726_000_000_000)
        store.passkey("p2", "accounts.google.com", "alice@gmail.com", "Alice")
        store.passkey("p3", "docs.example.test", "", "Боб", portable = false)
        val model = com.chromvoid.air.ui.passkeys.PasskeysModel(store, 1uL, CoroutineScope(Dispatchers.Main))
        model.reload()
        rule.setContent { AirTheme { com.chromvoid.air.ui.passkeys.PasskeysScreen(model, onBack = {}) } }
        rule.waitForIdle()
        shot("passkeys")
        model.select("p1")
        rule.waitForIdle()
        shot("passkey-detail")
    }

    @Test
    public fun surveyAutoFill() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val store = com.chromvoid.air.ui.autofill.FakeAutoFillStore()
        val model = com.chromvoid.air.ui.autofill.AutoFillModel(store, 1uL, CoroutineScope(Dispatchers.Main))
        rule.setContent {
            AirTheme { com.chromvoid.air.ui.autofill.AutoFillScreen(model, onDismiss = {}) }
        }
        rule.waitForIdle()
        shot("autofill")
    }

    @Test
    public fun surveyConnections() {
        assumeTrue(System.getProperty("air.survey") == "1")
        val store = com.chromvoid.air.ui.connections.FakeHostStore()
        store.peers += com.chromvoid.air.ffi.AirHostPeer("desk", "MacBook Pro", "desktop")
        val model = com.chromvoid.air.ui.connections.ConnectionsModel(
            store,
            "Pixel 8",
            CoroutineScope(Dispatchers.Main),
            FakeClipboard(),
        )
        model.synchronize(1uL, vaultOpen = false)
        rule.setContent {
            AirTheme {
                RootScaffold(
                    unlocked = true,
                    request = com.chromvoid.air.ui.root.AirRoot.CONNECTIONS,
                    connections = { modifier ->
                        com.chromvoid.air.ui.connections.ConnectionsScreen(model, modifier, onLock = {})
                    },
                )
                com.chromvoid.air.ui.connections.UsbApprovalPrompt(model)
            }
        }
        rule.waitForIdle()
        shot("connections")
        model.pair()
        rule.waitForIdle()
        rule.onNodeWithTag(com.chromvoid.air.ui.connections.CONNECTIONS_LIST_TAG).performScrollToKey("pairing")
        shot("connections-pairing")
        store.peers.clear()
        store.computerPairs("desk", "MacBook Pro")
        rule.waitForIdle()
        rule.onNodeWithTag(com.chromvoid.air.ui.connections.CONNECTIONS_LIST_TAG).performScrollToKey("host")
        shot("connections-connected")

        // A computer on the USB cable: pairing with its PIN, then its session.
        store.desktopAsksToPair(pin = "305172", attemptsLeft = 4)
        settle { model.state.value.usb != null }
        shot("usb-pairing")
        model.answerUsbPairing(allow = true)
        settle { model.state.value.usb?.pairing?.allowed == true }
        shot("usb-pairing-allowed")
        store.desktopAsksForSession()
        settle { model.state.value.usb?.session != null }
        shot("usb-session")
        model.answerUsbSession(allow = true)
        settle { model.state.value.usb?.session == null }
        rule.onNodeWithTag(com.chromvoid.air.ui.connections.CONNECTIONS_LIST_TAG).performScrollToKey("usb")
        shot("connections-usb")
    }

    @Test
    public fun surveySettings() {
        assumeTrue(System.getProperty("air.survey") == "1")
        showSettings()
        rule.onNodeWithTag("root-settings").performClick()
        shot("settings")
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("storage")
        shot("settings-storage")
        rule.onNodeWithTag(SETTINGS_BACKUP_TAG).performClick()
        rule.waitForIdle()
        shot("backup")
        rule.onNodeWithTag(BACKUP_CLOSE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("storage")
        rule.onNodeWithTag(SETTINGS_RESTORE_TAG).performClick()
        rule.waitForIdle()
        shot("restore")
        rule.onNodeWithTag(RESTORE_CLOSE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("erase")
        rule.onNodeWithTag(SETTINGS_ERASE_TAG).performClick()
        rule.waitForIdle()
        shot("erase")
        rule.onNodeWithTag(ERASE_CLOSE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("passwords")
        shot("settings-bottom")
        rule.onNodeWithTag(SETTINGS_VAULT_PASSWORD_TAG).performClick()
        rule.waitForIdle()
        shot("password-change")
        rule.onNodeWithTag(MAINTENANCE_CLOSE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("about")
        shot("settings-about")
        rule.onNodeWithTag(SETTINGS_HELP_TAG).performClick()
        shot("help")
        rule.onNodeWithTag(helpTopicTag(HelpTopic.STORAGE)).performClick()
        shot("help-storage")
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp-land-xhdpi")
    public fun surveySettingsOnATablet() {
        showSettings()
        rule.onNodeWithTag("root-settings").performClick()
        shot("tablet-settings")
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("about")
        rule.onNodeWithTag(SETTINGS_HELP_TAG).performClick()
        shot("tablet-help")
        rule.onNodeWithTag(helpTopicTag(HelpTopic.STORAGE)).performClick()
        shot("tablet-help-storage")
    }

    @Test
    public fun surveyAppReset() {
        val model = AppResetModel(AppReset { error("the survey never resets the app") })
        rule.setContent { AirTheme { AppResetScreen(model, onDismiss = {}) } }
        shot("app-reset-warning")
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToKey("acknowledgement")
        rule.onNodeWithTag(APP_RESET_ACKNOWLEDGE_TAG).performClick()
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToKey("review")
        rule.onNodeWithTag(APP_RESET_REVIEW_TAG).performClick()
        shot("app-reset-confirmation")
    }

    private fun showSettings() {
        val gate = gate()
        val session = com.chromvoid.air.ui.settings.SessionSettingsModel(
            { true },
            object : com.chromvoid.air.ui.settings.SessionPreferences {
                override var autoLockSeconds: Long = 300
                override var keepScreenAwake: Boolean = false
                override var lockOnLeave: Boolean = false
                override var lockOnScreenOff: Boolean = false
                override var lockNotification: Boolean = true
            },
            CoroutineScope(Dispatchers.Unconfined),
            lockTile = {},
        )
        val maintenance = maintenance()
        rule.setContent {
            AirTheme {
                MaintenanceHost(maintenance) {
                    RootScaffold(
                        unlocked = true,
                        settings = {
                            SettingsRoot(
                                gate,
                                it,
                                onLock = {},
                                session = session,
                                files = com.chromvoid.air.ui.files.FileSettings(
                                    com.chromvoid.air.ui.files.MemoryFilePreferences(),
                                ),
                                maintenance = maintenance,
                                onAutoFill = {},
                                version = com.chromvoid.air.ui.settings.AppVersion("0.1.0", "1"),
                                appearance = AppearanceModel(
                                    object : AppearancePreferences {
                                        override var theme: String = ""
                                        override var language: String = ""
                                    },
                                ),
                            )
                        },
                    )
                }
            }
        }
    }

    private fun maintenance(): MaintenanceScope = MaintenanceScope(
        1uL,
        maintenanceServices(),
        CoroutineScope(Dispatchers.Unconfined),
        session = { AirSessionState.Unlocked(1uL) },
    )

    private fun maintenanceServices(): MaintenanceServices = MaintenanceServices(
        passwords = FakeMaintenanceStore(),
        backups = object : BackupStore {
            override suspend fun prepareBackup(masterPassword: String, generation: ULong): BackupRun =
                error("the survey never starts one")
        },
        restores = object : RestoreStore {
            override suspend fun beginRestore(generation: ULong): RestoreRun = error("the survey never starts one")
        },
        restoreSources = { _ -> error("the survey never chooses one") },
        erasure = object : EraseStore {
            override suspend fun reviewErase(generation: ULong): EraseReview = object : EraseReview {
                override suspend fun commit(masterPassword: String): EraseOutcome = error("the survey never deletes")
                override fun cancel() = Unit
            }
        },
        backupDestinations = { _ ->
            object : BackupDestination {
                override val label: String = "Backups"
                override suspend fun writeArtifact(name: String, next: suspend () -> ByteArray) = Unit
                override suspend fun discard() = Unit
            }
        },
    )

    private fun gate(): PresenceGate = PresenceGate(
        check = object : PresenceCheck {
            override suspend fun authenticate(): PresenceCheck.Result = PresenceCheck.Result.CANCELLED
            override fun cancel() = Unit
        },
        preference = object : PresencePreference {
            override var enabled: Boolean = true
        },
        scope = CoroutineScope(Dispatchers.Unconfined),
    )

    /** Runs the main looper, where the models' work is queued, until [done]. */
    private fun settle(done: () -> Boolean) {
        val deadline = System.currentTimeMillis() + SURVEY_WAIT_MILLIS
        while (!done()) {
            check(System.currentTimeMillis() < deadline) { "the survey's model never settled" }
            rule.waitForIdle()
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle()
        }
    }

    private fun shot(name: String) {
        rule.waitForIdle()
        val view = rule.activity.window.decorView
        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bitmap)
        view.draw(canvas)
        // A dialog is its own window; it is drawn over the screen, centred, with its scrim.
        val shown = org.robolectric.shadows.ShadowDialog.getLatestDialog()?.takeIf { it.isShowing }
        shown?.window?.decorView?.let { dialog ->
            canvas.drawColor(android.graphics.Color.argb(SCRIM_ALPHA, 0, 0, 0))
            canvas.save()
            canvas.translate((view.width - dialog.width) / 2f, (view.height - dialog.height) / 2f)
            dialog.draw(canvas)
            canvas.restore()
        }
        val activityOrigin = IntArray(2).also(view::getLocationOnScreen)
        android.view.inspector.WindowInspector.getGlobalWindowViews()
            .filter { it !== view && it !== shown?.window?.decorView && it.isShown && it.width > 0 && it.height > 0 }
            .forEach { popup ->
                val origin = IntArray(2).also(popup::getLocationOnScreen)
                canvas.save()
                canvas.translate((origin[0] - activityOrigin[0]).toFloat(), (origin[1] - activityOrigin[1]).toFloat())
                popup.draw(canvas)
                canvas.restore()
            }
        val folder = if (variant == "light") "survey" else "survey-$variant"
        val dir = File(System.getProperty("user.dir"), "build/$folder").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private companion object {
        val COMPACT_TESTS = setOf(
            "surveyTheVault", "surveyTheEntryScreens", "surveyFiles", "surveyConnections", "surveySettings",
            "surveyCards", "surveyDocument", "surveyWallet", "surveyActionFeedback", "surveyFileRecoveryStates",
        )
        val COMPACT_FRAMES = setOf(
            "vault", "credential", "edit", "edit-end", "codes", "files", "connections", "settings", "locked",
            "files-notes", "files-folder", "files-select", "document", "document-source", "wallet-send",
            "tag-new", "card-new", "card-typing", "card-revealed", "locked-error", "action-feedback",
            "files-notes-empty", "files-export-error",
        )
        const val SURVEY_WAIT_MILLIS = 5_000L
        const val SCRIM_ALPHA = 82
    }
}
