package com.chromvoid.air.ui.credentials

/**
 * A stand-in for Core's card rules on the JVM, where the native library is
 * absent: the few networks the tests type (Visa, Mastercard, American
 * Express), with Core's lengths, groups and Luhn check. Core's own tests and
 * the device tests cover the real rules.
 */
internal object FakeCardRules : CardRules {
    private data class Network(
        val wire: String,
        val lengths: IntRange,
        val usual: Int?,
        val groups: List<Int>,
        val code: Int,
    )

    private val visa = Network("visa", 13..19, 16, listOf(4, 4, 4, 4, 3), 3)
    private val mastercard = Network("mastercard", 16..16, 16, listOf(4, 4, 4, 4), 3)
    private val amex = Network("amex", 15..15, 15, listOf(4, 6, 5), 4)

    private fun detect(digits: String): Network? = when {
        digits.length < 2 -> null
        digits.startsWith("34") || digits.startsWith("37") -> amex
        digits.take(2).toInt() in 51..55 -> mastercard
        digits.startsWith("4") -> visa
        else -> null
    }

    private fun format(network: Network?): CardFormat = CardFormat(
        network = network?.wire,
        groups = network?.groups ?: listOf(4, 4, 4, 4, 3),
        maxDigits = network?.lengths?.last ?: 19,
        printedDigits = network?.usual ?: 16,
        codeDigits = network?.code ?: 4,
    )

    override fun inspect(number: String): CardNumberCheck {
        val digits = number.filter { it in '0'..'9' }
        val network = detect(digits)
        val format = format(network)
        val checksum = digits.length >= 12 && luhn(digits)
        return CardNumberCheck(
            format = format,
            complete = digits.length >= format.maxDigits || (network?.usual == digits.length && checksum),
            validLength = digits.length in (network?.lengths ?: 12..19),
            checksumValid = checksum,
            storable = digits.length in 12..19,
        )
    }

    override fun format(brand: String?): CardFormat =
        format(listOf(visa, mastercard, amex).firstOrNull { it.wire == brand?.trim()?.lowercase() })

    override fun defaultTitle(brand: String?, last4: String): String {
        val name = mapOf("visa" to "Visa", "mastercard" to "Mastercard", "amex" to "American Express")[brand]
        return if (name == null) "•••• $last4" else "$name •••• $last4"
    }

    private fun luhn(digits: String): Boolean = digits.reversed().mapIndexed { index, c ->
        val digit = c - '0'
        if (index % 2 == 1) (digit * 2).let { if (it > 9) it - 9 else it } else digit
    }.sum() % 10 == 0
}
