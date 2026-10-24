package com.chromvoid.air

import com.chromvoid.air.ui.credentials.CATALOG_TOOLS_TAG
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.printToString
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.WireEnvelope
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.bridge.wire.PaymentCardMetadata
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.AUDIT_BACK_TAG
import com.chromvoid.air.ui.credentials.AUDIT_FILTER_TAG
import com.chromvoid.air.ui.credentials.AuditModel
import com.chromvoid.air.ui.credentials.CATALOG_AUDIT_TAG
import com.chromvoid.air.ui.credentials.CATALOG_OPTIONS_TAG
import com.chromvoid.air.ui.credentials.CATALOG_SEARCH_TAG
import com.chromvoid.air.ui.credentials.CatalogOptions
import com.chromvoid.air.ui.credentials.DETAIL_BACK_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.auditFilterTag
import com.chromvoid.air.ui.credentials.auditRowTag
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.air.ui.credentials.groupingTag
import com.chromvoid.air.ui.credentials.kindTabTag
import com.chromvoid.air.ui.credentials.sectionTag
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A12 against real Core: the Cards collection, grouping by date, and the
 * security audit, which finds the weak password and returns to itself from
 * the record it opened.
 */
@RunWith(AndroidJUnit4::class)
public class ArrangeAndAuditInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun collectionsGroupingAndTheAuditWork() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val weak = create(generation, "Слабый", "login", PassmanagerEntryCreateSecrets(password = "1234"))
        val strong = create(
            generation,
            "Сильный",
            "login",
            PassmanagerEntryCreateSecrets(password = "u7#Kq9!vT2@pLx4\$zR8m"),
        )
        val cardSecrets = PassmanagerEntryCreateSecrets(cardPan = "4111111111111111")
        val card = create(generation, "Карта", "payment_card", cardSecrets)
        awaitNode(catalogRowTag(card))

        rule.onNodeWithTag(CATALOG_OPTIONS_TAG).performClick()
        awaitNode(kindTabTag(CatalogOptions.Kind.CARDS))
        rule.onNodeWithTag(kindTabTag(CatalogOptions.Kind.CARDS)).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(catalogRowTag(weak)) == 0 && count(catalogRowTag(card)) > 0 }
        rule.onNodeWithTag(CATALOG_OPTIONS_TAG).performClick()
        awaitNode(kindTabTag(CatalogOptions.Kind.ALL))
        rule.onNodeWithTag(kindTabTag(CatalogOptions.Kind.ALL)).performClick()
        awaitNode(catalogRowTag(weak))

        rule.onNodeWithTag(CATALOG_OPTIONS_TAG).performClick()
        awaitNode(groupingTag(CatalogOptions.Grouping.MODIFIED))
        rule.onNodeWithTag(groupingTag(CatalogOptions.Grouping.MODIFIED)).performScrollTo().performClick()
        try {
            awaitNode(sectionTag("today"))
        } catch (timeout: Throwable) {
            val tree = rule.onRoot(useUnmergedTree = true).printToString(maxDepth = 30)
            throw AssertionError("no today section in:\n$tree", timeout)
        }

        rule.onNodeWithTag(CATALOG_TOOLS_TAG).performClick()
        awaitNode(CATALOG_AUDIT_TAG)
        rule.onNodeWithTag(CATALOG_AUDIT_TAG).performClick()
        awaitNode(auditRowTag(strong))
        rule.onNodeWithTag(AUDIT_FILTER_TAG).performClick()
        awaitNode(auditFilterTag(AuditModel.Filter.WEAK))
        rule.onNodeWithTag(auditFilterTag(AuditModel.Filter.WEAK)).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(auditRowTag(strong)) == 0 && count(auditRowTag(weak)) > 0 }

        rule.onNodeWithTag(auditRowTag(weak)).performClick()
        awaitNode(DETAIL_TITLE_TAG)
        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()
        awaitNode(auditRowTag(weak))
        rule.onNodeWithTag(AUDIT_BACK_TAG).performClick()
        awaitNode(CATALOG_SEARCH_TAG)
    }

    private fun create(
        generation: ULong,
        title: String,
        type: String,
        secrets: PassmanagerEntryCreateSecrets,
    ): String {
        val card = if (type == "payment_card") {
            WireEnvelope.json.encodeToJsonElement(
                PaymentCardMetadata.serializer(),
                PaymentCardMetadata(brand = "visa", cardholderName = "ALICE", expMonth = 3, expYear = 2035),
            )
        } else {
            null
        }
        return runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = type,
                    paymentCard = card,
                    secrets = secrets,
                    title = title,
                ),
                generation,
            ).entryID
        }
    }

    private fun count(tag: String): Int = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().size

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(tag) > 0 }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        val deadline = System.nanoTime() + STATE_TIMEOUT_NANOS
        while (!accept(session.state.value)) {
            check(System.nanoTime() < deadline) { "session still ${session.state.value}" }
            Thread.sleep(POLL_MILLIS)
        }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val NODE_TIMEOUT_MILLIS = 10_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
