package com.chromvoid.air.ui.credentials

import androidx.compose.ui.text.AnnotatedString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

public class PaymentCardTextTest {
    @Test
    public fun `a number is grouped as its network prints it and masked to its last four`() {
        val visa = FakeCardRules.format("visa")
        val amex = FakeCardRules.format("amex")
        assertEquals("4111 1111 1111 1111", PaymentCardText.grouped("4111111111111111", visa.groups))
        assertEquals("3782 822463 10005", PaymentCardText.grouped("378282246310005", amex.groups))
        assertEquals("4111 1111 1", PaymentCardText.grouped("411111111", visa.groups))
        assertEquals("•••• •••• •••• 4242", PaymentCardText.masked("4242", visa))
        assertEquals("•••• •••••• •0005", PaymentCardText.masked("0005", amex))
        val unknown = FakeCardRules.format(null)
        assertEquals("•••• •••• •••• ••••", PaymentCardText.masked(null, unknown))
        assertEquals("only ASCII digits are read", "12", PaymentCardText.digits("1٣2 "))
    }

    @Test
    public fun `typing keeps digits the card can print and says when a field is done`() {
        assertEquals(PaymentCardTyping.Result("05", true), PaymentCardTyping.month("5", ""))
        assertEquals(PaymentCardTyping.Result("1", false), PaymentCardTyping.month("1", ""))
        assertEquals(PaymentCardTyping.Result("12", true), PaymentCardTyping.month("12", "1"))
        assertEquals(PaymentCardTyping.Result("13", false), PaymentCardTyping.month("13", "1"))
        val deleted = PaymentCardTyping.month("5", "05")
        assertEquals("a deletion is left as it is", PaymentCardTyping.Result("5", false), deleted)
        assertEquals(PaymentCardTyping.Result("20", false), PaymentCardTyping.year("20", "2"))
        assertEquals(PaymentCardTyping.Result("35", true), PaymentCardTyping.year("35", "3"))
        assertEquals(PaymentCardTyping.Result("2035", true), PaymentCardTyping.year("20357", "203"))
        assertEquals(PaymentCardTyping.Result("123", true), PaymentCardTyping.code("1234", "12", limit = 3))
        val number = PaymentCardTyping.number("5555 5555 5555 44441", "555555555555444", FakeCardRules)
        assertEquals("Mastercard stops at sixteen", "5555555555554444", number.value)
        assertTrue(number.done)
    }

    @Test
    public fun `the grouping moves the caret by digits and backspace after a space takes a digit`() {
        val transformation = CardNumberTransformation(listOf(4, 4, 4, 4, 3))
        val shown = transformation.filter(AnnotatedString("411111111"))
        assertEquals("4111 1111 1", shown.text.text)
        val mapping = shown.offsetMapping
        assertEquals(4, mapping.originalToTransformed(4))
        assertEquals(6, mapping.originalToTransformed(5))
        assertEquals(shown.text.length, mapping.originalToTransformed(9))
        assertEquals("just after the space is still after the fourth digit", 4, mapping.transformedToOriginal(5))
        assertEquals(4, mapping.transformedToOriginal(4))
        assertEquals(9, mapping.transformedToOriginal(shown.text.length))
        val whole = transformation.filter(AnnotatedString("4111111111111111"))
        assertEquals("no trailing space after a whole group", "4111 1111 1111 1111", whole.text.text)
        for (offset in 0..16) {
            val shownOffset = whole.offsetMapping.originalToTransformed(offset)
            assertEquals(offset, whole.offsetMapping.transformedToOriginal(shownOffset))
        }
    }

    @Test
    public fun `a doubtful number is storable but outside the network's length or check`() {
        assertTrue(FakeCardRules.inspect("4111111111111112").doubtful)
        assertFalse(FakeCardRules.inspect("4111111111111111").doubtful)
        assertFalse("too short to store is an error, not a doubt", FakeCardRules.inspect("4111").doubtful)
    }
}
