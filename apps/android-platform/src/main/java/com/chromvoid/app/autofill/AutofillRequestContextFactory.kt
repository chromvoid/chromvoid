package com.chromvoid.app.autofill

import android.app.assist.AssistStructure
import android.content.ComponentName
import android.service.autofill.FillRequest
import android.view.autofill.AutofillId
import com.chromvoid.app.AutofillCompatModeDetector

internal data class AutofillRequestContextBuildResult(
    val context: AutofillRequestContext,
    val snapshot: AutofillStructureSnapshot,
)

internal object AutofillRequestContextFactory {
    fun fromFillRequest(request: FillRequest): AutofillRequestContextBuildResult? {
        val fillContexts = request.fillContexts
        val latestFillContext = fillContexts.lastOrNull() ?: return null
        val latestStructure = latestFillContext.structure
        val activityComponent = resolveActivityComponent(fillContexts)
        return fromSnapshot(
            requestId = request.id,
            snapshot = snapshotFromStructure(latestStructure),
            activityComponent = activityComponent,
            compatMode = AutofillCompatModeDetector.isCompatRequest(request.flags, activityComponent),
            focusedId = latestFillContext.focusedId,
            previousFocusedIds = fillContexts.dropLast(1).mapNotNull { it.focusedId }.distinct(),
        )
    }

    fun fromAssistStructure(
        structure: AssistStructure,
        fallbackDomain: String?,
        fallbackStrategyKind: AutofillStrategyKind,
    ): AutofillRequestContextBuildResult {
        val activityComponent = structure.activityComponent
        return fromSnapshot(
            requestId = 0,
            snapshot = snapshotFromStructure(structure),
            activityComponent = activityComponent,
            compatMode =
                fallbackStrategyKind == AutofillStrategyKind.COMPAT ||
                    AutofillCompatModeDetector.isCompatRequest(flags = 0, activityComponent = activityComponent),
            focusedId = findFocusedAutofillId(structure),
            previousFocusedIds = emptyList(),
            fallbackDomain = fallbackDomain,
        )
    }

    internal fun fromSnapshot(
        requestId: Int,
        snapshot: AutofillStructureSnapshot,
        activityComponent: ComponentName?,
        compatMode: Boolean,
        focusedId: AutofillId?,
        previousFocusedIds: List<AutofillId>,
        fallbackDomain: String? = null,
    ): AutofillRequestContextBuildResult {
        return AutofillRequestContextBuildResult(
            context =
                AutofillRequestContext(
                    requestId = requestId,
                    compatMode = compatMode,
                    activityComponent = activityComponent,
                    normalizedDomain =
                        AutofillFieldClassifier.normalizeDomain(snapshot.webDomain)
                            ?: AutofillFieldClassifier.normalizeDomain(fallbackDomain),
                    focusedId = focusedId,
                    previousFocusedIds = previousFocusedIds,
                    usernameFieldIds = snapshot.usernameFieldIds,
                    passwordFieldIds = snapshot.passwordFieldIds,
                    otpCandidates = snapshot.otpCandidates,
                    focusedFieldCandidates = snapshot.focusedFieldCandidates,
                    pageHintBlobs = snapshot.pageHintBlobs,
                ),
            snapshot = snapshot,
        )
    }

    private fun snapshotFromStructure(structure: AssistStructure): AutofillStructureSnapshot {
        val parser = AutofillStructureParser()
        for (windowIndex in 0 until structure.windowNodeCount) {
            parser.visit(structure.getWindowNodeAt(windowIndex).rootViewNode)
        }
        return parser.buildSnapshot()
    }

    private fun resolveActivityComponent(fillContexts: List<android.service.autofill.FillContext>): ComponentName? {
        val latestStructure = fillContexts.lastOrNull()?.structure
        return latestStructure?.activityComponent
            ?: fillContexts
                .asReversed()
                .mapNotNull { it.structure.activityComponent }
                .firstOrNull()
    }

    private fun findFocusedAutofillId(structure: AssistStructure): AutofillId? {
        for (windowIndex in 0 until structure.windowNodeCount) {
            val focused = findFocusedAutofillId(structure.getWindowNodeAt(windowIndex).rootViewNode)
            if (focused != null) {
                return focused
            }
        }
        return null
    }

    private fun findFocusedAutofillId(node: AssistStructure.ViewNode?): AutofillId? {
        if (node == null) {
            return null
        }
        if (node.isFocused && node.autofillId != null) {
            return node.autofillId
        }
        for (index in 0 until node.childCount) {
            val focused = findFocusedAutofillId(node.getChildAt(index))
            if (focused != null) {
                return focused
            }
        }
        return null
    }
}
