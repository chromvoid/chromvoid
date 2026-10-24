package com.chromvoid.air.bridge

import com.chromvoid.air.ffi.AirPaymentCardFormat
import com.chromvoid.air.ffi.AirPaymentCardNumber
import com.chromvoid.air.ffi.inspectPaymentCardNumber
import com.chromvoid.air.ffi.paymentCardDefaultTitle
import com.chromvoid.air.ffi.paymentCardFormat

/**
 * Core's payment card rules, through air-ffi: the ones iOS uses and the vault
 * applies on save. The network, how it groups a number, its lengths and code
 * length, and whether a number reads as whole. Pure functions of text already
 * typed; nothing here reads or saves the vault.
 */
public object PaymentCardRules {
    /** [number] may carry separators; only its digits are read. */
    public fun inspect(number: String): AirPaymentCardNumber = inspectPaymentCardNumber(number)

    /** The format of a stored card from its `brand`, before its number is read. */
    public fun format(brand: String): AirPaymentCardFormat = paymentCardFormat(brand)

    /** The name Core gives a card saved without one: `Visa •••• 1111`. */
    public fun defaultTitle(brand: String, last4: String): String = paymentCardDefaultTitle(brand, last4)
}
