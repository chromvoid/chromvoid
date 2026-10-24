package com.chromvoid.air.ui.design

import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics

/** The persistent field label and validation belong to the editable node itself. */
public fun Modifier.airEditableField(label: String, error: String? = null): Modifier = semantics {
    contentDescription = label
    if (error != null) this.error(error)
}
