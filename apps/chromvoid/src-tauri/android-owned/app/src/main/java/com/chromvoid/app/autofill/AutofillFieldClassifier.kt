package com.chromvoid.app.autofill

import android.app.assist.AssistStructure
import android.text.InputType
import android.view.View

internal object AutofillFieldClassifier {
    fun isPasswordField(node: AssistStructure.ViewNode, hintText: String = buildHintBlob(node)): Boolean {
        val hints = node.autofillHints?.map { it.lowercase() }.orEmpty()
        if (View.AUTOFILL_HINT_PASSWORD.lowercase() in hints) return true

        if (!looksLikeTextInput(node)) return false
        if ("password" in hintText || "passcode" in hintText) return true

        val variation = node.inputType and InputType.TYPE_MASK_VARIATION
        return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
    }

    fun isUsernameField(node: AssistStructure.ViewNode, hintText: String = buildHintBlob(node)): Boolean {
        val hints = node.autofillHints?.map { it.lowercase() }.orEmpty()
        if (View.AUTOFILL_HINT_USERNAME.lowercase() in hints) return true

        if (!looksLikeTextInput(node)) return false
        return "username" in hintText || "email" in hintText || "login" in hintText
    }

    fun isOtpField(node: AssistStructure.ViewNode, hintText: String = buildHintBlob(node)): Boolean {
        val hints = node.autofillHints?.map { it.lowercase() }.orEmpty()
        if ("one-time-code" in hints) return true

        if (!looksLikeTextInput(node)) return false
        return "one-time-code" in hintText ||
            "one time code" in hintText ||
            "otp" in hintText ||
            "totp" in hintText ||
            "2fa" in hintText ||
            "verification code" in hintText ||
            "auth code" in hintText
    }

    fun isOtpFallbackCandidate(
        node: AssistStructure.ViewNode,
        visible: Boolean,
        fillable: Boolean,
    ): Boolean {
        if (!visible || !fillable) return false
        if (!looksLikeTextInput(node)) return false

        val className = node.className?.lowercase().orEmpty()
        val htmlTag = node.htmlInfo?.getTag()?.lowercase().orEmpty()
        val inputClass = node.inputType and InputType.TYPE_MASK_CLASS
        return node.isFocused ||
            "edittext" in className ||
            "textfield" in className ||
            htmlTag == "input" ||
            htmlTag == "textarea" ||
            inputClass == InputType.TYPE_CLASS_NUMBER ||
            inputClass == InputType.TYPE_CLASS_TEXT ||
            inputClass == InputType.TYPE_CLASS_PHONE
    }

    fun isVisible(node: AssistStructure.ViewNode): Boolean = node.visibility == View.VISIBLE

    fun isFillable(node: AssistStructure.ViewNode): Boolean {
        val importantForAutofill = node.importantForAutofill
        if (importantForAutofill == View.IMPORTANT_FOR_AUTOFILL_NO ||
            importantForAutofill == View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        ) {
            return false
        }
        return node.isEnabled
    }

    fun parentPath(path: String): String = path.substringBeforeLast('/', "root")

    internal fun looksLikeTextInput(node: AssistStructure.ViewNode): Boolean {
        val htmlType =
            node.htmlInfo
                ?.getAttributes()
                ?.firstOrNull { it.first.equals("type", ignoreCase = true) }
                ?.second
                ?.lowercase()

        return looksLikeTextInput(
            className = node.className,
            autofillType = node.autofillType,
            inputType = node.inputType,
            htmlTag = node.htmlInfo?.getTag(),
            htmlType = htmlType,
        )
    }

    internal fun looksLikeTextInput(
        className: String?,
        autofillType: Int,
        inputType: Int,
        htmlTag: String?,
        htmlType: String?,
    ): Boolean {
        val normalizedHtmlTag = htmlTag?.lowercase()
        val normalizedHtmlType = htmlType?.lowercase()
        if (normalizedHtmlTag == "input" || normalizedHtmlTag == "textarea") {
            if (normalizedHtmlType in NON_TEXT_HTML_INPUT_TYPES) {
                return false
            }
            return true
        }

        val normalizedClassName = className?.lowercase().orEmpty()
        if ("edittext" in normalizedClassName || "textfield" in normalizedClassName) {
            return true
        }

        val inputClass = inputType and InputType.TYPE_MASK_CLASS
        if (inputClass == InputType.TYPE_CLASS_TEXT ||
            inputClass == InputType.TYPE_CLASS_NUMBER ||
            inputClass == InputType.TYPE_CLASS_PHONE
        ) {
            return true
        }

        return autofillType == View.AUTOFILL_TYPE_TEXT
    }

    fun buildHintBlob(node: AssistStructure.ViewNode): String {
        return listOfNotNull(
            node.hint,
            node.idEntry,
            node.hintIdEntry,
            node.textIdEntry,
            node.contentDescription,
            node.autofillHints?.joinToString(" "),
            node.htmlInfo?.getTag(),
            node.htmlInfo?.getAttributes()?.joinToString(" ") { attr ->
                listOfNotNull(attr.first, attr.second).joinToString(" ")
            },
        ).joinToString(" ").lowercase()
    }

    fun readNodeValue(node: AssistStructure.ViewNode): String {
        val autofillText =
            runCatching { node.autofillValue?.textValue?.toString() }.getOrNull()
        if (!autofillText.isNullOrBlank()) {
            return autofillText
        }
        return node.text?.toString().orEmpty()
    }

    fun normalizeDomain(domain: String?): String? {
        val raw = domain?.trim().orEmpty()
        if (raw.isEmpty()) return null

        val normalized = raw.removePrefix("https://").removePrefix("http://").trimEnd('/')
        return normalized.ifEmpty { null }
    }

    private val NON_TEXT_HTML_INPUT_TYPES =
        setOf(
            "button",
            "checkbox",
            "color",
            "file",
            "hidden",
            "image",
            "radio",
            "range",
            "reset",
            "submit",
        )
}
