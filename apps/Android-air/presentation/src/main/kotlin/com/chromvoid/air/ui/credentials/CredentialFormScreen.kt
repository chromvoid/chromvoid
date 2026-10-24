package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddCircleOutline
import androidx.compose.material.icons.rounded.Casino
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Tag
import androidx.compose.material.icons.rounded.Sell
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.root.CoversTabBar
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.credentials.CredentialFormModel.Field
import com.chromvoid.air.ui.credentials.CredentialFormModel.FieldError
import com.chromvoid.air.ui.credentials.CredentialFormModel.Issue
import com.chromvoid.air.ui.credentials.CredentialFormModel.Status
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.ActionPill
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowAction
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.airEditableField

public const val FORM_SAVE_TAG: String = "form-save"
public const val FORM_CLOSE_TAG: String = "form-close"
public const val FORM_ISSUE_TAG: String = "form-issue"
public const val FORM_GENERATE_TAG: String = "form-generate"
public const val FORM_DISCARD_TAG: String = "form-discard"
public const val FORM_KEEP_TAG: String = "form-keep"
public const val FORM_TAGS_TAG: String = "form-tags"
public const val FORM_LIST_TAG: String = "form-list"
public const val FORM_WEBSITES_TAG: String = "form-websites"
public const val FORM_CODES_TAG: String = "form-codes"
public const val FORM_GROUP_TAG: String = "form-group"
public const val FORM_CARD_BRAND_TAG: String = "form-card-brand"
public const val FORM_CARD_WARNING_TAG: String = "form-card-warning"

public fun formFieldTag(field: Field): String = "form-field-${field.name.lowercase()}"

public fun formErrorTag(field: Field): String = "form-error-${field.name.lowercase()}"

public fun formPlaceholderTag(field: Field): String = "form-placeholder-${field.name.lowercase()}"

/**
 * The create and edit form, laid out as the iOS editor: Cancel and Save in
 * the bar, then the name, the login details with the password generator,
 * the websites and codes (whose own editors save as soon as they are done)
 * or the card itself, typed on its face, the private note, and the tags and
 * group. The password is masked unless the user shows it; that choice is not
 * saved with the screen's state, so a masked value never lands in a
 * saved-instance bundle. Save is the only way a draft leaves.
 */
@Composable
public fun CredentialFormScreen(
    model: CredentialFormModel,
    onDismiss: () -> Unit,
    onDiscard: () -> Unit,
    modifier: Modifier = Modifier,
    onGenerate: () -> Unit = {},
    onChooseTags: () -> Unit = {},
    onEditWebsites: () -> Unit = {},
    onManageCodes: () -> Unit = {},
    onChooseGroup: () -> Unit = {},
) {
    CoversTabBar()
    val pane = stringResource(title(model))
    val state by model.state.collectAsStateWithLifecycle()
    val requesters = remember { Field.entries.associateWith { FocusRequester() } }
    val focusManager = LocalFocusManager.current
    val listState = rememberLazyListState()
    // Returning from a helper restores scroll without replaying an already handled focus request.
    var handledFocusRequest by rememberSaveable { mutableIntStateOf(0) }
    LaunchedEffect(state.focusRequest) {
        if (state.focusRequest == handledFocusRequest) return@LaunchedEffect
        handledFocusRequest = state.focusRequest
        // A request that names no field ends the typing: the card is filled in.
        val focus = state.focus ?: return@LaunchedEffect focusManager.clearFocus()
        // Bring a refused field's section into view even when it is partly visible:
        // focusing the input alone can leave its explanation below the viewport.
        val key = sectionKey(focus)
        if (state.errors.containsKey(focus) || listState.layoutInfo.visibleItemsInfo.none { it.key == key }) {
            val index = sectionKeys(state, model.kind).indexOf(key)
            if (index >= 0) listState.animateScrollToItem(index)
        }
        runCatching { requesters.getValue(focus).requestFocus() }
    }
    val editable = state.status == Status.EDITING && !state.refreshing
    AirScreen(
        title = pane,
        largeTitle = false,
        modifier = modifier.imePadding().semantics { paneTitle = pane },
        state = listState,
        listTag = FORM_LIST_TAG,
        leading = {
            ActionPill { PillText(stringResource(R.string.form_cancel), onDismiss, Modifier.testTag(FORM_CLOSE_TAG)) }
        },
        actions = {
            if (state.status == Status.SAVING) {
                Box(modifier = Modifier.padding(14.dp)) {
                    CircularProgressIndicator(
                        color = Air.colors.accent,
                        strokeWidth = 2.dp,
                        modifier = Modifier.heightIn(max = 20.dp),
                    )
                }
            }
            PillText(
                stringResource(R.string.form_save_action),
                onClick = model::save,
                enabled = state.status == Status.EDITING && !state.refreshing,
                emphasized = true,
                modifier = Modifier.testTag(FORM_SAVE_TAG),
            )
        },
    ) {
        state.issue?.let { issue ->
            item(key = KEY_ISSUE) {
                AirSection {
                    Text(
                        stringResource(issueText(issue)),
                        style = AirType.subheadline,
                        color = Air.colors.danger,
                        modifier = Modifier.padding(20.dp).testTag(FORM_ISSUE_TAG),
                    )
                }
            }
        }
        when (state.status) {
            Status.OPENING -> item(key = "opening") {
                Box(modifier = Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Air.colors.accent)
                }
            }
            Status.REVOKED, Status.SAVED -> Unit
            else -> {
                item(key = KEY_NAME) {
                    AirSection {
                        FieldRow(
                            Field.TITLE,
                            model,
                            state,
                            requesters,
                            editable,
                            // A card needs no name: the hint is the one Core will give it.
                            placeholder = if (model.kind == CredentialFormModel.Kind.CARD) {
                                state.cardTitleHint ?: stringResource(R.string.form_card_name_optional)
                            } else {
                                null
                            },
                        )
                    }
                }
                if (model.kind == CredentialFormModel.Kind.LOGIN) {
                    item(key = KEY_LOGIN) {
                        AirSection(header = stringResource(R.string.form_login_details)) {
                            FieldRow(Field.USERNAME, model, state, requesters, editable)
                            RowDivider()
                            FieldRow(Field.PASSWORD, model, state, requesters, editable)
                            RowDivider()
                            ActionRow(
                                stringResource(R.string.form_generate_password),
                                onClick = onGenerate,
                                icon = Icons.Rounded.Casino,
                                enabled = editable,
                                modifier = Modifier.testTag(FORM_GENERATE_TAG),
                            )
                        }
                    }
                    item(
                        key = KEY_WEBSITES,
                    ) { WebsitesAndCodes(model, state, editable, onEditWebsites, onManageCodes) }
                } else {
                    item(key = KEY_CARD) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            PaymentCardEditor(model, state, requesters, editable)
                            CardNotes(state)
                        }
                    }
                }
                item(key = KEY_NOTE) {
                    AirSection {
                        FieldRow(Field.NOTE, model, state, requesters, editable)
                    }
                }
                item(key = KEY_ORGANIZE) {
                    AirSection(footer = stringResource(R.string.form_group_footer)) {
                        AirRow(
                            stringResource(R.string.form_tags),
                            icon = Icons.Rounded.Sell,
                            value = if (state.tags.isEmpty()) {
                                stringResource(R.string.form_choose_tags)
                            } else {
                                state.tags.joinToString(", ") { it.label }
                            },
                            chevron = true,
                            enabled = editable,
                            onClick = onChooseTags,
                            modifier = Modifier.testTag(FORM_TAGS_TAG),
                        )
                        RowDivider(inset = 58.dp)
                        FieldRow(Field.GROUP, model, state, requesters, editable)
                        RowDivider(inset = 58.dp)
                        ActionRow(
                            stringResource(R.string.picker_title),
                            icon = Icons.Rounded.Folder,
                            enabled = editable,
                            onClick = onChooseGroup,
                            modifier = Modifier.testTag(FORM_GROUP_TAG),
                        )
                    }
                }
            }
        }
    }
    if (state.confirmingDiscard) {
        AlertDialog(
            onDismissRequest = model::cancelDiscard,
            title = { Text(stringResource(R.string.form_discard_q)) },
            text = { Text(stringResource(R.string.form_discard_explain)) },
            confirmButton = {
                TextButton(onClick = onDiscard, modifier = Modifier.testTag(FORM_DISCARD_TAG)) {
                    Text(stringResource(R.string.form_discard_draft), color = Air.colors.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = model::cancelDiscard, modifier = Modifier.testTag(FORM_KEEP_TAG)) {
                    Text(stringResource(R.string.form_keep_editing))
                }
            },
        )
    }
}

/** Websites and one-time codes of a login; each opens its own editor, which saves on its own. */
@Composable
private fun WebsitesAndCodes(
    model: CredentialFormModel,
    state: CredentialFormModel.State,
    editable: Boolean,
    onEditWebsites: () -> Unit,
    onManageCodes: () -> Unit,
) {
    val websites = if (model.isNew) state.websites.map { it.value } else state.savedWebsites
    AirSection(
        header = stringResource(R.string.form_websites_codes),
        footer = stringResource(
            if (model.isNew) R.string.form_codes_after_save else R.string.form_websites_codes_footer,
        ),
    ) {
        websites.forEach { website ->
            Text(
                website,
                style = AirType.body,
                color = Air.colors.textSecondary,
                maxLines = 1,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
            )
            RowDivider()
        }
        ActionRow(
            stringResource(if (websites.isEmpty()) R.string.form_add_website else R.string.form_edit_websites),
            onClick = onEditWebsites,
            icon = if (websites.isEmpty()) Icons.Rounded.AddCircleOutline else Icons.Rounded.Language,
            enabled = editable && model.websitesEditable,
            modifier = Modifier.testTag(FORM_WEBSITES_TAG),
        )
        if (!model.isNew) {
            RowDivider(inset = 58.dp)
            ActionRow(
                stringResource(R.string.form_codes),
                onClick = onManageCodes,
                icon = Icons.Rounded.Tag,
                enabled = editable,
                modifier = Modifier.testTag(FORM_CODES_TAG),
            )
        }
    }
}

/**
 * What the card face has no room for, under it: the network Core named, each
 * field's error, and a doubt about the number, which does not stop the save.
 */
@Composable
private fun CardNotes(state: CredentialFormModel.State) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        PaymentCardBrand.of(state.cardFormat?.network)?.let { brand ->
            Text(
                brand.displayName,
                style = AirType.footnote,
                color = Air.colors.textSecondary,
                modifier = Modifier.testTag(FORM_CARD_BRAND_TAG),
            )
        }
        for (field in CARD_FIELDS) {
            val error = state.errors[field] ?: continue
            Text(
                stringResource(fieldLabel(field)) + ": " + stringResource(errorText(error)),
                style = AirType.footnote,
                color = Air.colors.danger,
                modifier = Modifier.testTag(formErrorTag(field)),
            )
        }
        if (state.numberWarning) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(
                    Icons.Rounded.WarningAmber,
                    contentDescription = null,
                    tint = Air.colors.warning,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    stringResource(R.string.form_card_number_warning),
                    style = AirType.footnote,
                    color = Air.colors.warning,
                    modifier = Modifier.testTag(FORM_CARD_WARNING_TAG),
                )
            }
        }
    }
}

private val CARD_FIELDS = listOf(Field.CARDHOLDER, Field.CARD_NUMBER, Field.CARD_CODE, Field.MONTH, Field.YEAR)

private const val KEY_ISSUE = "issue"
private const val KEY_NAME = "name"
private const val KEY_LOGIN = "login"
private const val KEY_WEBSITES = "websites-codes"
private const val KEY_CARD = "card"
private const val KEY_NOTE = "note"
private const val KEY_ORGANIZE = "organize"

/** The form's sections while it is edited, in list order; the list above builds the same. */
private fun sectionKeys(state: CredentialFormModel.State, kind: CredentialFormModel.Kind): List<String> =
    buildList {
        if (state.issue != null) add(KEY_ISSUE)
        add(KEY_NAME)
        if (kind == CredentialFormModel.Kind.LOGIN) {
            add(KEY_LOGIN)
            add(KEY_WEBSITES)
        } else {
            add(KEY_CARD)
        }
        add(KEY_NOTE)
        add(KEY_ORGANIZE)
    }

/** The section a field is typed in. */
private fun sectionKey(field: Field): String = when (field) {
    Field.TITLE -> KEY_NAME
    Field.USERNAME, Field.PASSWORD -> KEY_LOGIN
    Field.CARDHOLDER, Field.CARD_NUMBER, Field.CARD_CODE, Field.MONTH, Field.YEAR -> KEY_CARD
    Field.NOTE -> KEY_NOTE
    Field.GROUP -> KEY_ORGANIZE
}

/**
 * One field of the form inside its section: caption above the value, the
 * value typed in place, a show button for a protected one, the error below.
 */
@Composable
private fun FieldRow(
    field: Field,
    model: CredentialFormModel,
    state: CredentialFormModel.State,
    requesters: Map<Field, FocusRequester>,
    enabled: Boolean,
    /** An optional hint for an empty field, in addition to its persistent caption. */
    placeholder: String? = null,
) {
    val secret = field in CredentialFormModel.SECRET_TYPES && field != Field.NOTE
    // Plain remember, not rememberSaveable: whether a secret is shown is not
    // worth writing to a saved-instance bundle next to the secret itself.
    var shown by remember { mutableStateOf(false) }
    val error = state.errors[field]
    val errorMessage = error?.let { stringResource(errorText(it)) }
    val caption = stringResource(fieldLabel(field))
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(
            min = 60.dp,
        ).padding(start = 20.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                caption,
                style = AirType.footnote,
                color = if (error != null) Air.colors.danger else Air.colors.textSecondary,
            )
            Box {
                val value = state.value(field)
                if (value.isEmpty() && placeholder != null) {
                    Text(
                        placeholder,
                        style = AirType.body,
                        color = Air.colors.textSecondary,
                        modifier = Modifier.testTag(formPlaceholderTag(field)),
                    )
                }
                BasicTextField(
                    value = value,
                    onValueChange = { model.change(field, it) },
                    enabled = enabled,
                    singleLine = field != Field.NOTE,
                    minLines = if (field == Field.NOTE) 3 else 1,
                    textStyle = AirType.body.copy(
                        color = Air.colors.text,
                        fontFamily = if (secret && shown) FontFamily.Monospace else null,
                    ),
                    cursorBrush = SolidColor(Air.colors.accent),
                    visualTransformation = if (secret && !shown) {
                        PasswordVisualTransformation()
                    } else {
                        VisualTransformation.None
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = keyboardType(field),
                        imeAction = if (field == Field.NOTE) ImeAction.Default else ImeAction.Next,
                        autoCorrectEnabled = field == Field.TITLE,
                    ),
                    keyboardActions = KeyboardActions(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(requesters.getValue(field))
                        .airEditableField(caption, errorMessage)
                        .testTag(formFieldTag(field)),
                )
            }
            if (errorMessage != null) {
                Text(
                    errorMessage,
                    style = AirType.footnote,
                    color = Air.colors.danger,
                    modifier = Modifier.testTag(formErrorTag(field)),
                )
            }
        }
        if (secret) {
            RowAction(
                if (shown) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                stringResource(if (shown) R.string.detail_hide else R.string.detail_show, caption),
                onClick = { shown = !shown },
            )
        }
    }
}

private fun title(model: CredentialFormModel): Int = when {
    !model.isNew -> R.string.form_edit_title
    model.kind == CredentialFormModel.Kind.CARD -> R.string.form_new_card
    else -> R.string.form_new_login
}

private fun keyboardType(field: Field): KeyboardType = when (field) {
    Field.PASSWORD -> KeyboardType.Password
    Field.USERNAME -> KeyboardType.Email
    else -> KeyboardType.Text
}

private fun fieldLabel(field: Field): Int = when (field) {
    Field.TITLE -> R.string.form_name
    Field.USERNAME -> R.string.form_username
    Field.PASSWORD -> R.string.form_password
    Field.CARDHOLDER -> R.string.form_cardholder
    Field.CARD_NUMBER -> R.string.form_card_number
    Field.CARD_CODE -> R.string.form_card_code
    Field.MONTH -> R.string.form_month
    Field.YEAR -> R.string.form_year
    Field.NOTE -> R.string.form_note
    Field.GROUP -> R.string.form_group_path
}

internal fun errorText(error: FieldError): Int = when (error) {
    FieldError.REQUIRED -> R.string.form_error_required
    FieldError.MONTH -> R.string.form_error_month
    FieldError.YEAR -> R.string.form_error_year
    FieldError.NAME_TAKEN -> R.string.form_error_name_taken
    FieldError.CARD_NUMBER -> R.string.form_error_card_number
    FieldError.INVALID_CARD_NUMBER -> R.string.form_issue_invalid_card_number
    FieldError.INVALID_CARD_CODE -> R.string.form_issue_invalid_card_code
    FieldError.GROUP -> R.string.form_group_invalid
}

private fun issueText(issue: Issue): Int = when (issue) {
    Issue.OPEN_FAILED -> R.string.form_issue_open_failed
    Issue.GROUP_FAILED -> R.string.form_group_check_failed
    Issue.INVALID -> R.string.form_issue_invalid
    Issue.INVALID_CARD_NUMBER -> R.string.form_issue_invalid_card_number
    Issue.INVALID_CARD_CODE -> R.string.form_issue_invalid_card_code
    Issue.DENIED -> R.string.form_issue_denied
    Issue.TOO_LARGE -> R.string.form_issue_too_large
    Issue.PARTIAL -> R.string.form_issue_partial
    Issue.STALE -> R.string.form_issue_stale
    Issue.GONE -> R.string.form_issue_gone
    Issue.UNCERTAIN -> R.string.form_issue_uncertain
}
