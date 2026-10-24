package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.PaymentCardRules

/**
 * Reading what a card prints. The expiry is presentation work, as on iOS; the
 * number's network, grouping, lengths and check are Core's ([CardRules]).
 */
public object PaymentCards {
    /** The month as typed, 1 to 12; null for anything else. */
    public fun month(text: String): Long? = number(text, 1..2)?.takeIf { it in 1..12 }

    /**
     * `35` and `2035` are both 2035. A card valid in the last century has long
     * expired, so two digits always mean this one.
     */
    public fun year(text: String): Long? {
        val value = number(text, 2..2) ?: number(text, 4..4) ?: return null
        return if (value < 100) 2000 + value else value
    }

    /** A stored year as the editor opens it: two digits, as on the card. */
    public fun shortYear(year: Long): String = if (year in 2000..2099) "%02d".format(year % 100) else year.toString()

    /** `03 / 2035` for the record page. */
    public fun display(month: Long, year: Long): String =
        "%02d / %d".format(month, if (year < 100) 2000 + year else year)

    /** `03/35` as the card face prints it. */
    public fun faceExpiry(month: Long, year: Long): String = "%02d/%02d".format(month, year % 100)

    private fun number(text: String, digits: IntRange): Long? {
        val trimmed = text.trim()
        if (trimmed.length !in digits || !trimmed.all { it in '0'..'9' }) return null
        return trimmed.toLong()
    }
}

/** How a card of one network is written, as Core's rules give it. */
public data class CardFormat(
    /** Core's spelling of the network (`payment_card.brand`); null names none. */
    val network: String?,
    /** Group sizes the network prints, covering [maxDigits]. */
    val groups: List<Int>,
    val maxDigits: Int,
    /** The length a masked number is drawn at. */
    val printedDigits: Int,
    /** The longest security code the card can have. */
    val codeDigits: Int,
)

/** A number as typed so far, read by Core's rules. */
public data class CardNumberCheck(
    val format: CardFormat,
    /** The number is whole: the form may move on. */
    val complete: Boolean,
    /** The network issues numbers this long. */
    val validLength: Boolean,
    /** The Luhn check digit holds. */
    val checksumValid: Boolean,
    /** The vault stores a number this long (12 to 19 digits). */
    val storable: Boolean,
) {
    /** Storable, but no network issues it as typed: worth a second look before saving. */
    val doubtful: Boolean get() = storable && !(validLength && checksumValid)
}

/**
 * Core's payment card rules as the presentation reads them. The app passes
 * [CoreCardRules]; JVM tests, which have no native library, pass a fake.
 */
public interface CardRules {
    /** [number] may carry separators; only its digits are read. */
    public fun inspect(number: String): CardNumberCheck

    /** The format of a stored card from its `brand`. */
    public fun format(brand: String?): CardFormat

    /** The name Core gives a card saved without one: `Visa •••• 1111`. */
    public fun defaultTitle(brand: String?, last4: String): String
}

/** [CardRules] through air-ffi: the rules iOS uses and the vault applies on save. */
public object CoreCardRules : CardRules {
    override fun inspect(number: String): CardNumberCheck {
        val check = PaymentCardRules.inspect(number)
        return CardNumberCheck(
            format = format(check.format),
            complete = check.complete,
            validLength = check.validLength,
            checksumValid = check.checksumValid,
            storable = check.storable,
        )
    }

    override fun format(brand: String?): CardFormat = format(PaymentCardRules.format(brand.orEmpty()))

    override fun defaultTitle(brand: String?, last4: String): String =
        PaymentCardRules.defaultTitle(brand.orEmpty(), last4)

    private fun format(format: com.chromvoid.air.ffi.AirPaymentCardFormat): CardFormat = CardFormat(
        network = format.network,
        groups = format.groups.map { it.toInt() },
        maxDigits = format.maxDigits.toInt(),
        printedDigits = format.printedDigits.toInt(),
        codeDigits = format.codeDigits.toInt(),
    )
}

/** Card networks as Core names them; this client only names and draws them. */
public enum class PaymentCardBrand(public val wire: String, public val displayName: String) {
    VISA("visa", "Visa"),
    MASTERCARD("mastercard", "Mastercard"),
    MIR("mir", "Мир"),
    AMEX("amex", "American Express"),
    UNIONPAY("unionpay", "UnionPay"),
    JCB("jcb", "JCB"),
    DISCOVER("discover", "Discover"),
    DINERSCLUB("dinersclub", "Diners Club"),
    MAESTRO("maestro", "Maestro"),
    ;

    public companion object {
        /** Core's spelling of a network; null names none. */
        public fun of(network: String?): PaymentCardBrand? = entries.firstOrNull { it.wire == network }
    }
}

/** A card number as the network prints it, in Core's groups. */
public object PaymentCardText {
    /** The ASCII digits of [text], the only ones Core reads. */
    public fun digits(text: String): String = text.filter { it in '0'..'9' }

    public fun grouped(digits: String, groups: List<Int>): String {
        val parts = mutableListOf<String>()
        var start = 0
        for (size in groups) {
            if (start >= digits.length) break
            val end = minOf(start + size, digits.length)
            parts += digits.substring(start, end)
            start = end
        }
        if (start < digits.length) parts += digits.substring(start)
        return parts.joinToString(" ")
    }

    /** Dots at the network's usual length, then the last four: `•••• •••• •••• 4242`. */
    public fun masked(last4: String?, format: CardFormat): String {
        val tail = last4?.takeLast(4) ?: "••••"
        return grouped("•".repeat(maxOf(0, format.printedDigits - tail.length)) + tail, format.groups)
    }
}

/**
 * Typing on the card face, the iOS client's rules: what a keystroke leaves in
 * a field and whether the field is done, so focus can move on. The number
 * follows Core; the expiry is read as the card prints it, `MM / YY`.
 */
public object PaymentCardTyping {
    public data class Result(val value: String, val done: Boolean)

    /** Digits only, no more than the network issues; done once Core reads it as whole. */
    public fun number(typed: String, previous: String, rules: CardRules): Result {
        val digits = PaymentCardText.digits(typed)
        val check = rules.inspect(digits)
        val value = digits.take(check.format.maxDigits)
        return Result(value, value.length > previous.length && check.complete)
    }

    /** `3` is March and reads `03`; two digits of a real month finish the field. */
    public fun month(typed: String, previous: String): Result {
        val digits = PaymentCardText.digits(typed).take(2)
        if (digits.length <= previous.length) return Result(digits, false)
        if (digits.length == 1 && digits[0] >= '2') return Result("0$digits", true)
        return Result(digits, digits.length == 2 && PaymentCards.month(digits) != null)
    }

    /** Two digits as printed or the full year. `20` waits: it may begin `2035`. */
    public fun year(typed: String, previous: String): Result {
        val digits = PaymentCardText.digits(typed).take(4)
        val grew = digits.length > previous.length
        return Result(digits, grew && (digits.length == 4 || (digits.length == 2 && digits != "20")))
    }

    /** No longer than the network's code; done at that length. */
    public fun code(typed: String, previous: String, limit: Int): Result {
        val digits = PaymentCardText.digits(typed).take(limit)
        return Result(digits, digits.length > previous.length && digits.length == limit)
    }
}
