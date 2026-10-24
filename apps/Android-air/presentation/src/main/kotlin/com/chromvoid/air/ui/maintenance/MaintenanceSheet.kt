package com.chromvoid.air.ui.maintenance

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton

public const val MAINTENANCE_LIST_TAG: String = "maintenance-list"

/**
 * The frame every administration screen shares, as the iOS sheets: the title
 * small in the bar and Close on its leading side, with back doing what Close
 * does. While [closable] is false - work that cannot be walked away from -
 * neither closes it, and back is taken rather than passed to whatever lies
 * underneath, which would otherwise leave the app.
 */
@Composable
internal fun MaintenanceSheet(
    title: String,
    onDismiss: () -> Unit,
    closeTag: String,
    closable: Boolean = true,
    closeLabel: String = stringResource(R.string.maint_close),
    content: LazyListScope.() -> Unit,
) {
    BackHandler { if (closable) onDismiss() }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            // Touches stop here; unlike clickable, this keeps the sheet's own nodes separate for accessibility.
            .pointerInput(Unit) { detectTapGestures {} }
            .imePadding(),
    ) {
        AirScreen(
            title = title,
            largeTitle = false,
            leading = {
                if (closable) {
                    DoneButton(
                        closeLabel,
                        onClick = onDismiss,
                        modifier = Modifier.testTag(closeTag),
                    )
                }
            },
            listTag = MAINTENANCE_LIST_TAG,
            content = content,
        )
    }
}

/** A spinner and what is being done, in one row of a section. */
@Composable
internal fun MaintenanceProgress(text: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(color = Air.colors.accent, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        Text(text, style = AirType.body, color = Air.colors.text)
    }
}

/** How an operation ended: a symbol and a headline, as the iOS labels. */
@Composable
internal fun MaintenanceOutcome(icon: ImageVector, tint: Color, title: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth().padding(20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint)
        Text(title, style = AirType.headline, color = Air.colors.text)
    }
}

/** An explanation under the sections: secondary, or in red when it is a problem. */
@Composable
internal fun MaintenanceNote(text: String, modifier: Modifier = Modifier, problem: Boolean = false) {
    Text(
        text,
        style = AirType.subheadline,
        color = if (problem) Air.colors.danger else Air.colors.textSecondary,
        modifier = modifier.padding(horizontal = 36.dp, vertical = 8.dp),
    )
}

/** A password in a section row: masked, never corrected, and Done submits. */
@Composable
internal fun MaintenanceSecretRow(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = label,
) {
    val colors = Air.colors
    Box(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 20.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty() && placeholder != null) {
            Text(placeholder, style = AirType.body, color = colors.textSecondary)
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = AirType.body.copy(color = colors.text),
            cursorBrush = SolidColor(colors.accent),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                autoCorrectEnabled = false,
                imeAction = ImeAction.Go,
            ),
            keyboardActions = KeyboardActions(onAny = { onDone() }),
            modifier = modifier
                .fillMaxWidth()
                .semantics { contentDescription = label },
        )
    }
}
