package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.wire.WalletBalanceGetResponse
import com.chromvoid.air.bridge.wire.WalletCapabilityState
import com.chromvoid.air.bridge.wire.WalletProviderStatus
import com.chromvoid.air.bridge.wire.WalletStatusResponse

/**
 * How a network's amounts are shown and typed, as the iOS wallet shows them:
 * whole units with the network's symbol, typed as decimals and sent to Core
 * as base units. Core validates and authorizes every transfer.
 */
public class WalletNetwork private constructor(
    public val network: String,
    public val symbol: String,
    public val amountUnit: String,
    public val fractionDigits: Int,
    public val multipleOutputs: Boolean,
    public val supportsComment: Boolean,
) {
    public val displayName: String get() = displayName(network)

    public fun formattedTotal(balance: WalletBalanceGetResponse): String = formatted(balance.balance.total)

    /** Whether transfers on this network can be prepared in this runtime now. */
    public fun isAvailable(status: WalletStatusResponse): Boolean =
        status.enabled &&
            status.networks.any { entry ->
                entry.network == network &&
                    entry.enabled &&
                    entry.broadcastEnabled &&
                    entry.providerStatus == WalletProviderStatus.Ready &&
                    entry.capabilities.orEmpty().any {
                        it.id == "${network}_native_transfer" && it.state == WalletCapabilityState.Ready
                    }
            }

    /** A typed decimal as base units: digits and one separator only, never rounded. */
    public fun baseUnits(value: String): String? {
        val parts = value.trim().replace(',', '.').split('.')
        if (parts.size !in 1..2) return null
        val whole = parts[0]
        val fraction = parts.getOrElse(1) { "" }
        if (whole.isEmpty() && fraction.isEmpty()) return null
        if (!digits(whole) || !digits(fraction) || fraction.length > fractionDigits) return null
        val units = (whole + fraction + "0".repeat(fractionDigits - fraction.length)).trimStart('0')
        return units.ifEmpty { "0" }
    }

    /** Base units as a decimal without trailing zeros. */
    public fun decimal(units: String): String? {
        if (units.isEmpty() || !digits(units)) return null
        val padded = "0".repeat(maxOf(0, fractionDigits + 1 - units.length)) + units
        val split = padded.length - fractionDigits
        val whole = padded.substring(0, split).trimStart('0').ifEmpty { "0" }
        val fraction = padded.substring(split).trimEnd('0')
        return if (fraction.isEmpty()) whole else "$whole.$fraction"
    }

    public fun formatted(units: String): String = decimal(units)?.let { "$it $symbol" } ?: "$units $amountUnit"

    public companion object {
        /** Display order of the networks inside one universal wallet. */
        public val ORDER: List<String> = listOf("ton", "bitcoin", "ethereum", "solana")

        public fun of(network: String): WalletNetwork? = when (network) {
            "bitcoin" -> WalletNetwork(network, "BTC", "satoshi", 8, multipleOutputs = true, supportsComment = false)
            "ton" -> WalletNetwork(network, "TON", "nanoton", 9, multipleOutputs = false, supportsComment = true)
            "ethereum" -> WalletNetwork(network, "ETH", "wei", 18, multipleOutputs = false, supportsComment = false)
            "solana" -> WalletNetwork(network, "SOL", "lamport", 9, multipleOutputs = false, supportsComment = false)
            else -> null
        }

        /** Proper nouns, so not translated. */
        public fun displayName(network: String): String = when (network) {
            "bitcoin" -> "Bitcoin"
            "ton" -> "TON"
            "ethereum" -> "Ethereum"
            "solana" -> "Solana"
            else -> network
        }

        public fun rank(network: String): Int = ORDER.indexOf(network).let { if (it < 0) ORDER.size else it }

        private fun digits(value: String): Boolean = value.all { it in '0'..'9' }
    }
}
