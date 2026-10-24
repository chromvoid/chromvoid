package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.root.CoversTabBar
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirSwitchRow
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowAction
import com.chromvoid.air.ui.design.RowDivider
import kotlin.math.roundToInt

public const val GENERATOR_CLOSE_TAG: String = "generator-close"
public const val GENERATOR_USE_TAG: String = "generator-use"
public const val GENERATOR_RUN_TAG: String = "generator-run"
public const val GENERATOR_LENGTH_TAG: String = "generator-length"
public const val GENERATOR_LENGTH_SLIDER_TAG: String = "generator-length-slider"
public const val GENERATOR_VALUE_TAG: String = "generator-value"
public const val GENERATOR_REVEAL_TAG: String = "generator-reveal"
public const val GENERATOR_ISSUE_TAG: String = "generator-issue"

/** The switch of one character type; the name is the iOS one. */
public fun generatorTypeTag(type: String): String = "generator-type-$type"

/**
 * The password generator as the iOS sheet: Cancel and Use in the bar, the
 * length, the character types, the candidate once there is one, and the
 * action that makes another. Nothing here saves: Use hands the candidate to
 * the form.
 */
@Composable
public fun PasswordGeneratorSheet(model: PasswordGeneratorModel, onDismiss: () -> Unit) {
    CoversTabBar()
    val pane = stringResource(R.string.gen_title)
    val state by model.state.collectAsStateWithLifecycle()
    val colors = Air.colors
    val ready = state.status == PasswordGeneratorModel.Status.READY
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.canvas)
            // Takes the touches of whatever it covers, without merging the sheet
            // into one accessibility node the way a clickable would.
            .pointerInput(Unit) { detectTapGestures {} },
    ) {
        AirScreen(
            title = pane,
            largeTitle = false,
            modifier = Modifier.semantics { paneTitle = pane },
            leading = {
                DoneButton(
                    stringResource(R.string.gen_cancel),
                    onClick = onDismiss,
                    modifier = Modifier.testTag(GENERATOR_CLOSE_TAG),
                )
            },
            actions = {
                PillText(
                    stringResource(R.string.gen_use),
                    onClick = model::use,
                    enabled = ready,
                    emphasized = true,
                    modifier = Modifier.testTag(GENERATOR_USE_TAG),
                )
            },
        ) {
            state.issue?.let { issue ->
                item(key = "issue") {
                    Text(
                        stringResource(generatorIssueText(issue)),
                        style = AirType.subheadline,
                        color = colors.danger,
                        modifier = Modifier
                            .padding(horizontal = 36.dp, vertical = 8.dp)
                            .testTag(GENERATOR_ISSUE_TAG),
                    )
                }
            }
            item(key = "length") { LengthSection(model, state) }
            item(key = "types") { TypesSection(model, state.settings) }
            state.password?.let { password ->
                item(key = "candidate") { CandidateSection(model, state, password) }
            }
            item(key = "run") {
                AirSection(footer = stringResource(R.string.gen_footer)) {
                    if (state.status == PasswordGeneratorModel.Status.GENERATING) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(20.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            CircularProgressIndicator(
                                color = colors.accent,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(20.dp),
                            )
                            Text(stringResource(R.string.gen_working), style = AirType.body, color = colors.text)
                        }
                    } else {
                        ActionRow(
                            stringResource(if (state.password == null) R.string.gen_generate else R.string.gen_again),
                            onClick = model::generate,
                            icon = Icons.Rounded.Refresh,
                            enabled = ready,
                            modifier = Modifier.testTag(GENERATOR_RUN_TAG),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LengthSection(model: PasswordGeneratorModel, state: PasswordGeneratorModel.State) {
    val length = state.settings.length
    AirSection(header = stringResource(R.string.gen_length)) {
        AirRow(
            title = stringResource(R.string.gen_characters),
            value = length.toString(),
            modifier = Modifier.testTag(GENERATOR_LENGTH_TAG),
            trailing = {
                RowAction(
                    Icons.Rounded.Remove,
                    stringResource(R.string.gen_shorter),
                    onClick = { model.change { it.copy(length = it.length - 1) } },
                    enabled = length > PasswordGeneratorModel.MIN_LENGTH,
                )
                RowAction(
                    Icons.Rounded.Add,
                    stringResource(R.string.gen_longer),
                    onClick = { model.change { it.copy(length = it.length + 1) } },
                    enabled = length < PasswordGeneratorModel.MAX_LENGTH,
                )
            },
        )
        RowDivider()
        val description = stringResource(R.string.gen_length)
        val lengthRange = PasswordGeneratorModel.MIN_LENGTH.toFloat()..PasswordGeneratorModel.MAX_LENGTH.toFloat()
        Slider(
            value = length.toFloat(),
            onValueChange = { value -> model.change { it.copy(length = value.roundToInt()) } },
            valueRange = lengthRange,
            colors = SliderDefaults.colors(
                thumbColor = Air.colors.accent,
                activeTrackColor = Air.colors.accent,
                inactiveTrackColor = Air.colors.separator,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 4.dp)
                .testTag(GENERATOR_LENGTH_SLIDER_TAG)
                // Replace the inner M3 slider semantics with one named, adjustable node.
                .clearAndSetSemantics {
                    contentDescription = description
                    stateDescription = length.toString()
                    // Keep continuous thumb geometry with one-character accessibility steps.
                    progressBarRangeInfo = ProgressBarRangeInfo(
                        current = length.toFloat(),
                        range = lengthRange,
                        steps = PasswordGeneratorModel.MAX_LENGTH - PasswordGeneratorModel.MIN_LENGTH - 1,
                    )
                    setProgress { value ->
                        val previousLength = model.state.value.settings.length
                        model.change { it.copy(length = value.roundToInt()) }
                        model.state.value.settings.length != previousLength
                    }
                },
        )
    }
}

@Composable
private fun TypesSection(model: PasswordGeneratorModel, settings: PasswordGeneratorModel.Settings) {
    AirSection(header = stringResource(R.string.gen_types)) {
        TypeRow(R.string.gen_lowercase, "lowercase", settings.lowercase) { on ->
            model.change { it.copy(lowercase = on) }
        }
        RowDivider()
        TypeRow(R.string.gen_uppercase, "uppercase", settings.uppercase) { on ->
            model.change { it.copy(uppercase = on) }
        }
        RowDivider()
        TypeRow(R.string.gen_digits, "digits", settings.digits) { on ->
            model.change { it.copy(digits = on) }
        }
        RowDivider()
        TypeRow(R.string.gen_symbols, "symbols", settings.symbols) { on ->
            model.change { it.copy(symbols = on) }
        }
    }
}

@Composable
private fun TypeRow(title: Int, tag: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    AirSwitchRow(
        title = stringResource(title),
        checked = checked,
        onCheckedChange = onChange,
        modifier = Modifier.testTag(generatorTypeTag(tag)),
    )
}

@Composable
private fun CandidateSection(
    model: PasswordGeneratorModel,
    state: PasswordGeneratorModel.State,
    password: String,
) {
    AirSection(header = stringResource(R.string.gen_password)) {
        AirRow(
            title = if (state.revealed) password else HIDDEN,
            titleFamily = FontFamily.Monospace,
            modifier = Modifier.testTag(GENERATOR_VALUE_TAG),
            trailing = {
                PillText(
                    stringResource(if (state.revealed) R.string.gen_hide else R.string.gen_show),
                    onClick = model::toggleReveal,
                    modifier = Modifier.testTag(GENERATOR_REVEAL_TAG),
                )
            },
        )
    }
}

private const val HIDDEN = "••••••••••••"

internal fun generatorIssueText(issue: PasswordGeneratorModel.Issue): Int = when (issue) {
    PasswordGeneratorModel.Issue.NO_TYPES -> R.string.gen_issue_types
    PasswordGeneratorModel.Issue.INVALID -> R.string.gen_issue_invalid
    PasswordGeneratorModel.Issue.FAILED -> R.string.gen_issue_failed
    PasswordGeneratorModel.Issue.NOTHING_TO_USE -> R.string.gen_issue_none
    PasswordGeneratorModel.Issue.REVOKED -> R.string.gen_issue_revoked
}
