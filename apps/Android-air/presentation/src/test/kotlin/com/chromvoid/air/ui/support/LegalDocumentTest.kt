package com.chromvoid.air.ui.support

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import org.junit.Assert.assertEquals
import org.junit.Test

public class LegalDocumentTest {
    @Test
    public fun `the documents are the published pages`() {
        assertEquals(
            mapOf(
                LegalDocument.PRIVACY_POLICY to "https://chromvoid.com/en/legal/privacy-policy/",
                LegalDocument.TERMS_OF_SERVICE to "https://chromvoid.com/en/legal/terms-of-service-eula/",
            ),
            LegalDocument.entries.associateWith { it.url },
        )
    }

    @Test
    public fun `each name in the notice links its own document`() {
        val text = notice("By continuing, you agree to the %1\$s and acknowledge the %2\$s.")

        assertEquals("By continuing, you agree to the Terms and acknowledge the Privacy.", text.text)
        assertEquals(
            listOf("Terms" to LegalDocument.TERMS_OF_SERVICE.url, "Privacy" to LegalDocument.PRIVACY_POLICY.url),
            text.links(),
        )
    }

    @Test
    public fun `a translation may put the names in its own order`() {
        val text = notice("%2\$s and %1\$s apply.")

        assertEquals("Privacy and Terms apply.", text.text)
        assertEquals(
            listOf("Privacy" to LegalDocument.PRIVACY_POLICY.url, "Terms" to LegalDocument.TERMS_OF_SERVICE.url),
            text.links(),
        )
    }

    private fun notice(template: String): AnnotatedString =
        legalNotice(template, terms = "Terms", privacy = "Privacy") { LinkAnnotation.Url(it.url) }

    private fun AnnotatedString.links(): List<Pair<String, String>> =
        getLinkAnnotations(0, length).map { substring(it.start, it.end) to (it.item as LinkAnnotation.Url).url }
}
