package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.design.airEditableField

/** A shared name input whose editing controller belongs to the dialog or picker model. */
@Composable
internal fun GroupNameField(state: TextFieldState, error: String? = null, modifier: Modifier = Modifier) {
    val caption = stringResource(R.string.group_name)
    OutlinedTextField(
        state = state,
        label = { Text(caption) },
        lineLimits = TextFieldLineLimits.SingleLine,
        isError = error != null,
        supportingText = error?.let { { Text(it) } },
        modifier = modifier.airEditableField(caption, error),
    )
}
