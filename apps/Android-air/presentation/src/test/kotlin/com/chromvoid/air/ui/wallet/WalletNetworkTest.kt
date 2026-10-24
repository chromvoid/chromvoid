package com.chromvoid.air.ui.wallet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

public class WalletNetworkTest {
    private val ton = WalletNetwork.of("ton")!!
    private val bitcoin = WalletNetwork.of("bitcoin")!!

    @Test
    public fun `typed decimals become base units exactly, never rounded`() {
        assertEquals("1500000000", ton.baseUnits("1.5"))
        assertEquals("1500000000", ton.baseUnits(" 1,5 "))
        assertEquals("1", ton.baseUnits("0.000000001"))
        assertEquals("0", ton.baseUnits("0"))
        assertEquals("100000000", bitcoin.baseUnits("1"))
        assertNull(ton.baseUnits("0.0000000001"))
        assertNull(ton.baseUnits("1e9"))
        assertNull(ton.baseUnits("1.2.3"))
        assertNull(ton.baseUnits(""))
        assertNull(ton.baseUnits("-1"))
    }

    @Test
    public fun `base units read as decimals with the symbol`() {
        assertEquals("1.5", ton.decimal("1500000000"))
        assertEquals("0.000000001", ton.decimal("1"))
        assertEquals("0", ton.decimal("0"))
        assertEquals("1.5 TON", ton.formatted("1500000000"))
        assertEquals("oops nanoton", ton.formatted("oops"))
    }

    @Test
    public fun `networks keep the iOS order and names`() {
        assertEquals(
            listOf("ton", "bitcoin", "ethereum", "solana"),
            listOf("solana", "ethereum", "bitcoin", "ton").sortedBy(WalletNetwork::rank),
        )
        assertEquals("Bitcoin", WalletNetwork.displayName("bitcoin"))
        assertEquals("dogecoin", WalletNetwork.displayName("dogecoin"))
        assertNull(WalletNetwork.of("dogecoin"))
        assertTrue(bitcoin.multipleOutputs)
        assertFalse(bitcoin.supportsComment)
        assertTrue(ton.supportsComment)
    }
}
