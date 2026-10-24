package com.chromvoid.app.autofill

import android.app.assist.AssistStructure
import android.view.autofill.AutofillId

internal class AutofillStructureParser {
    private var webDomain: String? = null
    private val usernameFieldIds = LinkedHashSet<AutofillId>()
    private val passwordFieldIds = LinkedHashSet<AutofillId>()
    private val otpCandidates = mutableListOf<AutofillOtpCandidate>()
    private val focusedFieldCandidates = mutableListOf<AutofillFocusedFieldCandidate>()
    private val pageHintBlobs = mutableListOf<String>()
    private var usernameValue: String? = null
    private var passwordValue: String? = null
    private var fieldOrder: Int = 0

    fun visit(node: AssistStructure.ViewNode?, path: String = "root") {
        if (node == null) return

        if (webDomain.isNullOrBlank()) {
            val domain = node.webDomain
            if (!domain.isNullOrBlank()) {
                webDomain = domain
            }
        }

        val hintBlob = AutofillFieldClassifier.buildHintBlob(node)
        if (hintBlob.isNotBlank()) {
            pageHintBlobs += hintBlob
        }

        val autofillId = node.autofillId
        if (autofillId != null) {
            val visible = AutofillFieldClassifier.isVisible(node)
            val fillable = AutofillFieldClassifier.isFillable(node)
            val isPasswordField = AutofillFieldClassifier.isPasswordField(node, hintBlob)
            val isOtpField = AutofillFieldClassifier.isOtpField(node, hintBlob)
            val isUsernameField = AutofillFieldClassifier.isUsernameField(node, hintBlob)
            when {
                isPasswordField -> {
                    passwordFieldIds.add(autofillId)
                    if (passwordValue.isNullOrBlank()) {
                        passwordValue = AutofillFieldClassifier.readNodeValue(node)
                    }
                }
                isOtpField -> {
                    otpCandidates +=
                        AutofillOtpCandidate(
                            autofillId = autofillId,
                            parentPath = AutofillFieldClassifier.parentPath(path),
                            order = fieldOrder++,
                            visible = visible,
                            fillable = fillable,
                            focused = node.isFocused,
                        )
                }
                isUsernameField -> {
                    usernameFieldIds.add(autofillId)
                    if (usernameValue.isNullOrBlank()) {
                        usernameValue = AutofillFieldClassifier.readNodeValue(node)
                    }
                }
            }
            if (!isPasswordField &&
                !isOtpField &&
                !isUsernameField &&
                AutofillFieldClassifier.isOtpFallbackCandidate(node, visible, fillable)
            ) {
                focusedFieldCandidates +=
                    AutofillFocusedFieldCandidate(
                        autofillId = autofillId,
                        parentPath = AutofillFieldClassifier.parentPath(path),
                        order = fieldOrder++,
                        visible = visible,
                        fillable = fillable,
                        focused = node.isFocused,
                    )
            }
        }

        for (index in 0 until node.childCount) {
            visit(node.getChildAt(index), "$path/$index")
        }
    }

    fun buildSnapshot(): AutofillStructureSnapshot {
        return AutofillStructureSnapshot(
            webDomain = webDomain,
            usernameFieldIds = usernameFieldIds.toList(),
            passwordFieldIds = passwordFieldIds.toList(),
            otpCandidates = otpCandidates,
            focusedFieldCandidates = focusedFieldCandidates,
            pageHintBlobs = pageHintBlobs,
        )
    }

    fun buildSave(): ParsedPasswordSaveRequest? {
        val normalizedDomain = AutofillFieldClassifier.normalizeDomain(webDomain) ?: return null
        val password = passwordValue?.trim().orEmpty()
        if (password.isEmpty()) {
            return null
        }
        return ParsedPasswordSaveRequest(
            origin = "https://$normalizedDomain",
            domain = normalizedDomain,
            username = usernameValue?.trim().orEmpty(),
            password = password,
        )
    }
}
