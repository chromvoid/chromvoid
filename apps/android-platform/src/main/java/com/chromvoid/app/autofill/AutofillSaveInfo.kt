package com.chromvoid.app.autofill

import android.service.autofill.SaveInfo

/**
 * What the system may offer to save to ChromVoid once a sign-in is submitted: the password,
 * with the account where the page has a field for it. Every answer to a sign-in carries it -
 * the vault's matches, no match at all, or the unlock a locked vault asks for - so a login
 * typed by hand can be kept. The system asks the person first, and a value filled from the
 * vault and left unchanged offers nothing.
 */
internal object AutofillSaveInfo {
    fun forRequest(parsed: ParsedAutofillRequest): SaveInfo? {
        if (parsed.stepKind != ParsedStepKind.PASSWORD || parsed.passwordFieldIds.isEmpty()) return null
        val builder =
            SaveInfo.Builder(
                SaveInfo.SAVE_DATA_TYPE_USERNAME or SaveInfo.SAVE_DATA_TYPE_PASSWORD,
                parsed.passwordFieldIds.toTypedArray(),
            )
        if (parsed.usernameFieldIds.isNotEmpty()) builder.setOptionalIds(parsed.usernameFieldIds.toTypedArray())
        return builder.build()
    }
}
