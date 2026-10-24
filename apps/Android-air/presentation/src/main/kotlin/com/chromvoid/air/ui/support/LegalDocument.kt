package com.chromvoid.air.ui.support

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withLink
import com.chromvoid.air.presentation.R

/**
 * The published legal documents, as on iOS. Settings → About opens them in
 * the browser and the first-run setup says they apply; their addresses live
 * only here. The site publishes them in English.
 */
public enum class LegalDocument(public val url: String, public val title: Int) {
    PRIVACY_POLICY("https://chromvoid.com/en/legal/privacy-policy/", R.string.legal_privacy_policy),
    TERMS_OF_SERVICE("https://chromvoid.com/en/legal/terms-of-service-eula/", R.string.legal_terms_of_service),
}

/** `%1$s` and `%2$s`, the positional arguments of a string resource. */
private val NOTICE_PLACEHOLDER = Regex("%([12])\\\$s")

/**
 * The first-run line under the setup action: nothing to accept, only that both
 * documents apply. [template]'s `%1$s` becomes [terms] and `%2$s` [privacy],
 * each a [link] to its document; the translation owns the sentence, where the
 * names fall in it and the form they take there.
 */
internal fun legalNotice(
    template: String,
    terms: String,
    privacy: String,
    link: (LegalDocument) -> LinkAnnotation,
): AnnotatedString = buildAnnotatedString {
    var at = 0
    NOTICE_PLACEHOLDER.findAll(template).forEach { match ->
        append(template, at, match.range.first)
        val (document, name) = when (match.groupValues[1]) {
            "1" -> LegalDocument.TERMS_OF_SERVICE to terms
            else -> LegalDocument.PRIVACY_POLICY to privacy
        }
        withLink(link(document)) { append(name) }
        at = match.range.last + 1
    }
    append(template, at, template.length)
}
