package com.chromvoid.app

import android.content.Context
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.service.autofill.InlinePresentation
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews

internal object AutofillTestUtils {
    fun newAutofillId(context: Context): AutofillId {
        val view = View(context)
        return view.autofillId
    }

    fun datasetAuthentication(dataset: Dataset): Any? =
        reflectField(dataset, "mAuthentication")

    fun datasetFieldIds(dataset: Dataset): List<AutofillId> {
        // Android framework stores these as ArrayList<AutofillId> in most API levels.
        val ids =
            reflectField(dataset, "mFieldIds")
                ?: reflectField(dataset, "mAutofillIds")
                ?: return emptyList()
        @Suppress("UNCHECKED_CAST")
        return when (ids) {
            is List<*> -> ids.filterIsInstance<AutofillId>()
            else -> emptyList()
        }
    }

    fun datasetFieldValueMap(dataset: Dataset): Map<AutofillId, AutofillValue> {
        val ids = datasetFieldIds(dataset)
        val valuesAny =
            reflectField(dataset, "mFieldValues")
                ?: reflectField(dataset, "mAutofillValues")
                ?: return emptyMap()

        @Suppress("UNCHECKED_CAST")
        val values =
            when (valuesAny) {
                is List<*> -> valuesAny.filterIsInstance<AutofillValue>()
                else -> emptyList()
            }

        val out = LinkedHashMap<AutofillId, AutofillValue>()
        for (i in 0 until minOf(ids.size, values.size)) {
            out[ids[i]] = values[i]
        }
        return out
    }

    fun datasetInlinePresentations(dataset: Dataset): List<InlinePresentation> {
        val any =
            reflectField(dataset, "mFieldInlinePresentations")
                ?: return emptyList()
        @Suppress("UNCHECKED_CAST")
        return when (any) {
            is List<*> -> any.filterIsInstance<InlinePresentation>()
            else -> emptyList()
        }
    }

    fun datasetMenuPresentations(dataset: Dataset): List<RemoteViews> {
        val any =
            reflectField(dataset, "mFieldPresentations")
                ?: reflectField(dataset, "mPresentations")
                ?: return emptyList()
        @Suppress("UNCHECKED_CAST")
        return when (any) {
            is List<*> -> any.filterIsInstance<RemoteViews>()
            else -> emptyList()
        }
    }

    fun datasetDialogPresentations(dataset: Dataset): List<RemoteViews> {
        val any =
            reflectField(dataset, "mFieldDialogPresentations")
                ?: return emptyList()
        @Suppress("UNCHECKED_CAST")
        return when (any) {
            is List<*> -> any.filterIsInstance<RemoteViews>()
            else -> emptyList()
        }
    }

    fun remoteViewsLayoutId(remoteViews: RemoteViews): Int? =
        reflectField(remoteViews, "mLayoutId") as? Int

    fun fillResponseDatasets(response: FillResponse): List<Dataset> {
        val datasetsAny = reflectField(response, "mDatasets") ?: return emptyList()
        @Suppress("UNCHECKED_CAST")
        return when (datasetsAny) {
            is List<*> -> datasetsAny.filterIsInstance<Dataset>()
            else -> emptyList()
        }
    }

    fun fillResponseDialogTriggerIds(response: FillResponse): List<AutofillId> {
        val any =
            reflectField(response, "mFillDialogTriggerIds")
                ?: return emptyList()
        @Suppress("UNCHECKED_CAST")
        return when (any) {
            is List<*> -> any.filterIsInstance<AutofillId>()
            is Array<*> -> any.filterIsInstance<AutofillId>()
            else -> emptyList()
        }
    }

    private fun reflectField(target: Any, name: String): Any? {
        return runCatching {
            val field = target.javaClass.getDeclaredField(name)
            field.isAccessible = true
            field.get(target)
        }.getOrNull()
    }
}
