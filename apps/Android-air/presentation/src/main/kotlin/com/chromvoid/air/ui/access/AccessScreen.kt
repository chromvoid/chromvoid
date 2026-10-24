package com.chromvoid.air.ui.access

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.rounded.DeviceHub
import androidx.compose.material.icons.rounded.Fingerprint
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.MoveToInbox
import androidx.compose.material.icons.rounded.PhonelinkLock
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.editableText
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.password
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AccessInputProblem
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.LinkButton
import com.chromvoid.air.ui.design.PrimaryButton
import com.chromvoid.air.ui.design.RoundButton
import com.chromvoid.air.ui.design.airEditableField
import com.chromvoid.air.ui.support.legalNotice

public const val ACCESS_PASSWORD_TAG: String = "access-password"
public const val ACCESS_CONFIRMATION_TAG: String = "access-confirmation"
public const val ACCESS_SUBMIT_TAG: String = "access-submit"
public const val ACCESS_ERROR_TAG: String = "access-error"
public const val ACCESS_REVEAL_TAG: String = "access-reveal"
public const val WELCOME_CONTINUE_TAG: String = "welcome-continue"
public const val ACCESS_HELP_TAG: String = "access-help"
public const val WELCOME_RESTORE_TAG: String = "welcome-restore"
public const val ACCESS_RESTORE_TAG: String = "access-restore"
public const val ACCESS_UTILITIES_TAG: String = "access-utilities"
public const val ACCESS_CONNECTIONS_TAG: String = "access-connections"
public const val ACCESS_SHARE_NOTICE_TAG: String = "access-share-notice"
public const val ACCESS_SHARE_DISCARD_TAG: String = "access-share-discard"
public const val ACCESS_LOGIN_NOTICE_TAG: String = "access-login-notice"
public const val ACCESS_LOGIN_DISCARD_TAG: String = "access-login-discard"
public const val ACCESS_LEGAL_TAG: String = "access-legal"

/**
 * First run, as on iOS: a welcome that says what the app is, then the
 * administrative password, which is not the vault password.
 */
@Composable
public fun AdministratorSetupScreen(
    model: AccessViewModel,
    onHelp: (() -> Unit)? = null,
    /** Restoring a backup instead of setting up anew; null where nothing can restore one. */
    onRestore: (() -> Unit)? = null,
) {
    var welcomed by rememberSaveable { mutableStateOf(false) }
    if (!welcomed) {
        Welcome(onContinue = { welcomed = true }, onHelp = onHelp, onRestore = onRestore)
        return
    }
    val form by model.form.collectAsStateWithLifecycle()
    AccessForm(
        model = model,
        setup = true,
        onSubmit = model::submitAdministrator,
        onHelp = onHelp,
        // Rare actions live at the bottom, away from the primary path.
        footer = onRestore?.let { restore ->
            {
                LinkButton(
                    stringResource(R.string.restore_title),
                    onClick = restore,
                    enabled = !form.submitting,
                    style = AirType.subheadline,
                    modifier = Modifier.padding(bottom = 12.dp).testTag(ACCESS_RESTORE_TAG),
                )
            }
        },
    )
}

@Composable
public fun UnlockScreen(
    model: AccessViewModel,
    onHelp: (() -> Unit)? = null,
    /** Opens the device utilities; null where the locked device offers none. */
    onUtilities: (() -> Unit)? = null,
    /** Opens Connections, which work while the vault is locked; null where the client offers none. */
    onConnections: (() -> Unit)? = null,
    /** Files another app shared, waiting for the unlock. */
    pendingShare: Int = 0,
    onDiscardShare: () -> Unit = {},
    /** The site of a login another app offered to save, waiting for the unlock. */
    pendingLogin: String? = null,
    onDiscardLogin: () -> Unit = {},
) {
    val form by model.form.collectAsStateWithLifecycle()
    AccessForm(
        model = model,
        setup = false,
        onSubmit = model::submitUnlock,
        onHelp = onHelp,
        notice = if (pendingShare > 0 || pendingLogin != null) {
            {
                Column {
                    if (pendingLogin != null) OfferedLoginNotice(pendingLogin, onDiscardLogin)
                    if (pendingShare > 0) SharedFilesNotice(pendingShare, onDiscardShare)
                }
            }
        } else {
            null
        },
        barTrailing = onConnections?.let { open ->
            {
                RoundButton(
                    icon = Icons.Rounded.DeviceHub,
                    description = stringResource(R.string.root_connections),
                    onClick = open,
                    modifier = Modifier.testTag(ACCESS_CONNECTIONS_TAG),
                )
            }
        },
        // Rare actions live behind one row at the bottom, away from the primary path.
        footer = onUtilities?.let { open -> { UtilitiesRow(onClick = open, enabled = !form.submitting) } },
    )
}

/**
 * Files another app shared while the vault was locked: how many wait, that
 * nothing is read before the unlock, and a way to let them go.
 */
@Composable
private fun SharedFilesNotice(count: Int, onDiscard: () -> Unit) {
    WaitingNotice(
        icon = Icons.Rounded.MoveToInbox,
        title = pluralStringResource(R.plurals.incoming_waiting, count, count),
        note = stringResource(R.string.incoming_waiting_note),
        discard = stringResource(R.string.incoming_discard),
        onDiscard = onDiscard,
        tag = ACCESS_SHARE_NOTICE_TAG,
        discardTag = ACCESS_SHARE_DISCARD_TAG,
    )
}

/** A login another app offered to save: it waits, in memory, for the unlock that opens its form. */
@Composable
private fun OfferedLoginNotice(site: String, onDiscard: () -> Unit) {
    WaitingNotice(
        icon = Icons.Rounded.Key,
        title = stringResource(R.string.login_offer_waiting, site),
        note = stringResource(R.string.login_offer_waiting_note),
        discard = stringResource(R.string.login_offer_discard),
        onDiscard = onDiscard,
        tag = ACCESS_LOGIN_NOTICE_TAG,
        discardTag = ACCESS_LOGIN_DISCARD_TAG,
    )
}

/** Something another app handed ChromVoid that waits for the unlock, and the way to let it go. */
@Composable
private fun WaitingNotice(
    icon: ImageVector,
    title: String,
    note: String,
    discard: String,
    onDiscard: () -> Unit,
    tag: String,
    discardTag: String,
) {
    val colors = Air.colors
    Row(
        modifier = Modifier
            .padding(start = 24.dp, end = 24.dp, top = 20.dp)
            .widthIn(max = 560.dp)
            .fillMaxWidth()
            .background(colors.card, RoundedCornerShape(16.dp))
            .padding(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 4.dp)
            .testTag(tag),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, contentDescription = null, tint = colors.accent, modifier = Modifier.size(24.dp))
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = AirType.body, color = colors.text)
            Text(note, style = AirType.footnote, color = colors.textSecondary)
            LinkButton(discard, onClick = onDiscard, modifier = Modifier.testTag(discardTag))
        }
    }
}

/** "Device utilities" under the unlock form, as on iOS: one row that opens the rare actions. */
@Composable
private fun UtilitiesRow(onClick: () -> Unit, enabled: Boolean) {
    val colors = Air.colors
    // The last row keeps a little air above the gesture bar, as iOS keeps above the home indicator.
    Column(modifier = Modifier.widthIn(max = 560.dp).fillMaxWidth().padding(bottom = 8.dp)) {
        Box(
            Modifier
                .padding(horizontal = 24.dp)
                .fillMaxWidth()
                .height(0.5.dp)
                .background(colors.separator),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = 24.dp, vertical = 14.dp)
                .testTag(ACCESS_UTILITIES_TAG),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Rounded.Tune,
                contentDescription = null,
                tint = colors.textSecondary,
                modifier = Modifier.size(24.dp),
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(stringResource(R.string.utilities_title), style = AirType.headline, color = colors.text)
                Text(
                    stringResource(R.string.utilities_subtitle),
                    style = AirType.footnote,
                    color = colors.textSecondary,
                )
            }
            Icon(
                Icons.Rounded.KeyboardArrowUp,
                contentDescription = null,
                tint = colors.textTertiary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/**
 * The entry screens' frame: the brand canvas with "ChromVoid Air" small in
 * the middle of the bar and, as on iOS, Help on its leading side. The canvas
 * runs edge to edge; the bar and the content keep to the safe area - the
 * status bar and a cutout above, the navigation bar or, while it shows, the
 * keyboard below - so a screen's last control never sits on the gesture bar.
 */
@Composable
public fun AccessFrame(
    onHelp: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val colors = Air.colors
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.canvas)
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)),
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(60.dp).padding(horizontal = 16.dp)) {
            if (onHelp != null) {
                RoundButton(
                    icon = Icons.AutoMirrored.Outlined.HelpOutline,
                    description = stringResource(R.string.help_title),
                    onClick = onHelp,
                    modifier = Modifier.align(Alignment.CenterStart).testTag(ACCESS_HELP_TAG),
                )
            }
            Text(
                stringResource(R.string.access_bar_title),
                style = AirType.headline,
                color = colors.text,
                modifier = Modifier.align(Alignment.Center),
            )
            if (trailing != null) {
                Box(modifier = Modifier.align(Alignment.CenterEnd)) { trailing() }
            }
        }
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)),
        ) { content() }
    }
}

@Composable
private fun Welcome(onContinue: () -> Unit, onHelp: (() -> Unit)?, onRestore: (() -> Unit)?) {
    val colors = Air.colors
    AccessFrame(onHelp = onHelp) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(32.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
                BrandMark(size = 72.dp, animated = true)
                Text(
                    stringResource(R.string.welcome_title),
                    style = AirType.largeTitle,
                    color = colors.text,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    stringResource(R.string.welcome_text),
                    style = AirType.title3.copy(fontWeight = FontWeight.Normal),
                    color = colors.textSecondary,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
                WelcomePoint(Icons.Rounded.Smartphone, stringResource(R.string.welcome_encrypted))
                WelcomePoint(Icons.Rounded.Key, stringResource(R.string.welcome_administrator))
                WelcomePoint(Icons.Rounded.Fingerprint, stringResource(R.string.welcome_presence))
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton(
                    text = stringResource(R.string.welcome_continue),
                    onClick = onContinue,
                    modifier = Modifier.testTag(WELCOME_CONTINUE_TAG),
                )
                if (onRestore != null) {
                    LinkButton(
                        stringResource(R.string.restore_title),
                        onClick = onRestore,
                        modifier = Modifier.testTag(WELCOME_RESTORE_TAG),
                    )
                }
            }
            Text(stringResource(R.string.welcome_edition), style = AirType.footnote, color = colors.textSecondary)
        }
    }
}

@Composable
private fun WelcomePoint(icon: ImageVector, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = Air.colors.accent, modifier = Modifier.size(24.dp))
        Text(text, style = AirType.body, color = Air.colors.text)
    }
}

@Composable
private fun AccessForm(
    model: AccessViewModel,
    setup: Boolean,
    onSubmit: () -> Unit,
    onHelp: (() -> Unit)?,
    barTrailing: (@Composable () -> Unit)? = null,
    footer: (@Composable () -> Unit)? = null,
    notice: (@Composable () -> Unit)? = null,
) {
    val colors = Air.colors
    val form by model.form.collectAsStateWithLifecycle()
    val unlockMotion by model.unlockMotion.collectAsStateWithLifecycle()
    val problem = accessProblemMessage(form)
    val passwordFocus = remember { FocusRequester() }
    val confirmationFocus = remember { FocusRequester() }
    val formIntoView = remember { BringIntoViewRequester() }
    var focusedField by remember { mutableStateOf<AccessField?>(null) }
    var revealed by rememberSaveable { mutableStateOf(false) }

    // A rejected submit moves focus to the control it is about, so the
    // explanation and the thing to correct are never in different places.
    LaunchedEffect(form.problem, form.refusalCode) {
        when (form.invalidField) {
            AccessField.PASSWORD -> passwordFocus.requestFocus()
            AccessField.CONFIRMATION -> confirmationFocus.requestFocus()
            null -> Unit
        }
    }

    AccessFrame(onHelp = onHelp, trailing = barTrailing) {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val height = maxHeight
            // The field's default relocation keeps only its text above the IME.
            // Re-request the whole form when the safe viewport changes, including
            // its submit action and the bottom breathing room.
            LaunchedEffect(height, focusedField, form.problem, form.refusalCode) {
                if (focusedField != null) formIntoView.bringIntoView()
            }
            Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                Column(
                    modifier = Modifier.heightIn(min = height).fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // A weight gives no height once the content is taller than the screen - with the
                    // keyboard up - so the smallest gap is a spacer of its own.
                    Spacer(Modifier.weight(1f))
                    Spacer(Modifier.height(16.dp))
                    Column(
                        modifier = Modifier.padding(horizontal = 24.dp).widthIn(max = 560.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(20.dp),
                    ) {
                        BrandMark(
                            size = 96.dp,
                            animated = !setup,
                            motion = unlockMotion,
                            onReducedMotionChanged = model::setReducedMotion,
                        )
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            if (!setup) {
                                Text(
                                    stringResource(R.string.access_device_locked).uppercase(),
                                    style = AirType.caption.copy(
                                        fontWeight = FontWeight.SemiBold,
                                        letterSpacing = 2.sp,
                                    ),
                                    color = colors.textSecondary,
                                )
                            }
                            Text(
                                stringResource(
                                    if (setup) R.string.access_setup_title else R.string.access_unlock_heading,
                                ),
                                style = AirType.largeTitle,
                                color = colors.text,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.semantics { heading() },
                            )
                            Text(
                                stringResource(
                                    if (setup) R.string.access_setup_explainer else R.string.access_unlock_text,
                                ),
                                style = AirType.body,
                                color = colors.textSecondary,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.widthIn(max = 340.dp),
                            )
                        }
                    }
                    if (!setup) {
                        Row(
                            modifier = Modifier.padding(start = 28.dp, end = 28.dp, top = 24.dp).widthIn(max = 560.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Icon(
                                Icons.Rounded.PhonelinkLock,
                                contentDescription = null,
                                tint = colors.accent,
                                modifier = Modifier.size(24.dp),
                            )
                            Text(
                                stringResource(R.string.access_unlock_note),
                                style = AirType.subheadline,
                                color = colors.textSecondary,
                            )
                        }
                    }
                    notice?.invoke()
                    // The form sits in the lower third, within thumb reach and right above the keyboard.
                    Spacer(Modifier.weight(1f))
                    Spacer(Modifier.height(28.dp))
                    Column(
                        modifier = Modifier
                            .bringIntoViewRequester(formIntoView)
                            .padding(start = 24.dp, end = 24.dp, bottom = 20.dp)
                            .widthIn(max = 560.dp)
                            .fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(colors.card, RoundedCornerShape(16.dp)),
                        ) {
                            SecretField(
                                value = form.password,
                                onValueChange = model::onPasswordChanged,
                                placeholder = stringResource(
                                    if (setup) R.string.access_setup_password else R.string.access_unlock_title,
                                ),
                                icon = if (setup) Icons.Rounded.Key else Icons.Outlined.Lock,
                                revealed = revealed,
                                onReveal = { revealed = !revealed },
                                enabled = !form.submitting,
                                imeAction = if (setup) ImeAction.Next else ImeAction.Go,
                                onImeAction = { if (setup) confirmationFocus.requestFocus() else onSubmit() },
                                error = problem.takeIf { form.invalidField == AccessField.PASSWORD },
                                modifier = Modifier
                                    .focusRequester(passwordFocus)
                                    .onFocusChanged {
                                        focusedField = if (it.isFocused) AccessField.PASSWORD else null
                                    }
                                    .testTag(ACCESS_PASSWORD_TAG),
                            )
                            if (setup) {
                                Box(
                                    Modifier
                                        .padding(start = 52.dp)
                                        .fillMaxWidth()
                                        .height(0.5.dp)
                                        .background(colors.separator),
                                )
                                SecretField(
                                    value = form.confirmation,
                                    onValueChange = model::onConfirmationChanged,
                                    placeholder = stringResource(R.string.access_setup_confirmation),
                                    icon = Icons.Rounded.Key,
                                    revealed = revealed,
                                    onReveal = { revealed = !revealed },
                                    enabled = !form.submitting,
                                    imeAction = ImeAction.Go,
                                    onImeAction = onSubmit,
                                    error = problem.takeIf { form.invalidField == AccessField.CONFIRMATION },
                                    showReveal = false,
                                    modifier = Modifier
                                        .focusRequester(confirmationFocus)
                                        .onFocusChanged {
                                            focusedField = if (it.isFocused) AccessField.CONFIRMATION else null
                                        }
                                        .testTag(ACCESS_CONFIRMATION_TAG),
                                )
                            }
                        }
                        AccessProblem(problem)
                        // The action stays available: a disabled control explains nothing.
                        PrimaryButton(
                            text = stringResource(
                                if (setup) R.string.access_setup_submit else R.string.access_unlock_submit,
                            ),
                            onClick = onSubmit,
                            busy = form.submitting,
                            modifier = Modifier.testTag(ACCESS_SUBMIT_TAG),
                        )
                        if (setup) LegalNotice()
                    }
                    footer?.invoke()
                }
            }
        }
    }
}

/**
 * The first-run line under the setup action, as on iOS: the Terms of Service
 * and the Privacy Policy apply, each a link to the browser. It is information
 * only - nothing to tick, and the action never waits for it.
 */
@Composable
private fun LegalNotice() {
    val colors = Air.colors
    val uri = LocalUriHandler.current
    val template = stringResource(R.string.access_setup_legal)
    val terms = stringResource(R.string.access_setup_legal_terms)
    val privacy = stringResource(R.string.access_setup_legal_privacy)
    val links = TextLinkStyles(SpanStyle(color = colors.accent))
    val text = remember(template, terms, privacy, links, uri) {
        legalNotice(template, terms, privacy) { document ->
            // Without a browser to take it, the tap opens nothing rather than failing.
            LinkAnnotation.Url(document.url, links) { runCatching { uri.openUri(document.url) } }
        }
    }
    Text(
        text,
        style = AirType.footnote,
        color = colors.textSecondary,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().testTag(ACCESS_LEGAL_TAG),
    )
}

/** A password in the white entry card: a leading symbol, the field, and the eye. */
@Composable
private fun SecretField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    icon: ImageVector,
    revealed: Boolean,
    onReveal: () -> Unit,
    enabled: Boolean,
    imeAction: ImeAction,
    onImeAction: () -> Unit,
    error: String?,
    modifier: Modifier = Modifier,
    showReveal: Boolean = true,
) {
    val colors = Air.colors
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp).padding(start = 16.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, contentDescription = null, tint = colors.textSecondary, modifier = Modifier.size(24.dp))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            singleLine = true,
            textStyle = AirType.body.copy(color = colors.text),
            cursorBrush = SolidColor(colors.accent),
            visualTransformation = if (revealed) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                autoCorrectEnabled = false,
                imeAction = imeAction,
            ),
            keyboardActions = KeyboardActions(onAny = { onImeAction() }),
            modifier = modifier
                .weight(1f)
                .airEditableField(placeholder, error)
                .semantics {
                    // Reveal changes pixels, not what accessibility services read aloud.
                    password()
                    editableText = AnnotatedString("•".repeat(value.length))
                },
            decorationBox = { field ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) Text(placeholder, style = AirType.body, color = colors.textSecondary)
                    field()
                }
            },
        )
        if (showReveal) {
            val description = stringResource(
                if (revealed) R.string.access_hide_password else R.string.access_show_password,
            )
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clickable(role = Role.Button, onClick = onReveal)
                    .semantics { contentDescription = description }
                    .testTag(ACCESS_REVEAL_TAG),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (revealed) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                    contentDescription = null,
                    tint = colors.textSecondary,
                    modifier = Modifier.size(24.dp),
                )
            }
        } else {
            Spacer(Modifier.size(44.dp))
        }
    }
}

@Composable
private fun accessProblemMessage(form: AccessFormState): String? =
    when (form.problem) {
        AccessInputProblem.EMPTY_PASSWORD -> stringResource(R.string.access_error_empty_password)
        AccessInputProblem.EMPTY_CONFIRMATION ->
            stringResource(R.string.access_error_empty_confirmation)
        AccessInputProblem.CONFIRMATION_MISMATCH ->
            stringResource(R.string.access_error_mismatch)
        // A refusal says the vault did not open and that nothing changed. It
        // does not claim the password was wrong: an empty vault is not a failure.
        null -> form.refusalCode?.let { stringResource(R.string.access_refused) }
    }

@Composable
private fun AccessProblem(message: String?) {
    AnimatedVisibility(visible = message != null, enter = fadeIn(), exit = fadeOut()) {
        Text(
            text = message.orEmpty(),
            color = Air.colors.danger,
            style = AirType.footnote,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp).testTag(ACCESS_ERROR_TAG),
        )
    }
}

/**
 * The entry screens' message: a symbol, a title, what it means and one action
 * (the presence gate, storage that needs attention).
 */
@Composable
public fun AccessMessage(
    icon: ImageVector,
    title: String,
    message: String,
    action: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
    busy: Boolean = false,
    titleModifier: Modifier = Modifier,
    actionModifier: Modifier = Modifier,
    onHelp: (() -> Unit)? = null,
    extra: @Composable ColumnScope.() -> Unit = {},
) {
    val colors = Air.colors
    AccessFrame(onHelp = onHelp) {
        Column(
            modifier = modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterVertically),
        ) {
            Icon(icon, contentDescription = null, tint = colors.textSecondary, modifier = Modifier.size(40.dp))
            Text(
                title,
                style = AirType.title2.copy(fontWeight = FontWeight.Bold),
                color = colors.text,
                textAlign = TextAlign.Center,
                modifier = titleModifier.semantics { heading() },
            )
            Text(message, style = AirType.body, color = colors.textSecondary, textAlign = TextAlign.Center)
            extra()
            PrimaryButton(
                text = action,
                onClick = onAction,
                busy = busy,
                modifier = actionModifier.widthIn(max = 360.dp),
            )
        }
    }
}
