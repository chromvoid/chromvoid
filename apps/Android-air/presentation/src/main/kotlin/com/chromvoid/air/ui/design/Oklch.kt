package com.chromvoid.air.ui.design

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/**
 * OKLCH → Display P3 with chroma-reducing gamut mapping, the iOS client's
 * `OKLCH` (Björn Ottosson's OKLab matrices; linear P3 through the Display P3 →
 * XYZ D65 matrix). Colours authored once in OKLCH read the same on both
 * clients; a wide-gamut window shows them as authored and other screens clip
 * them to sRGB.
 */
public fun oklch(lightness: Double, chroma: Double, hue: Double): Color {
    var fitted = chroma
    var rgb = linearP3(lightness, fitted, hue)
    if (!inGamut(rgb)) {
        var low = 0.0
        var high = chroma
        repeat(24) {
            val mid = (low + high) / 2
            if (inGamut(linearP3(lightness, mid, hue))) low = mid else high = mid
        }
        fitted = low
        rgb = linearP3(lightness, fitted, hue)
    }
    return Color(encode(rgb[0]), encode(rgb[1]), encode(rgb[2]), 1f, ColorSpaces.DisplayP3)
}

private fun linearP3(l: Double, c: Double, h: Double): DoubleArray {
    val a = c * cos(h * PI / 180)
    val b = c * sin(h * PI / 180)
    val lp = l + 0.3963377774 * a + 0.2158037573 * b
    val mp = l - 0.1055613458 * a - 0.0638541728 * b
    val sp = l - 0.0894841775 * a - 1.2914855480 * b
    val lms = doubleArrayOf(lp * lp * lp, mp * mp * mp, sp * sp * sp)
    val x = 1.2268798733 * lms[0] - 0.5578149965 * lms[1] + 0.2813910456 * lms[2]
    val y = -0.0405801784 * lms[0] + 1.1122568696 * lms[1] - 0.0716766787 * lms[2]
    val z = -0.0763812845 * lms[0] - 0.4214819784 * lms[1] + 1.5861632204 * lms[2]
    return doubleArrayOf(
        2.4934969119 * x - 0.9313836179 * y - 0.4027107845 * z,
        -0.8294889696 * x + 1.7626640603 * y + 0.0236246858 * z,
        0.0358458302 * x - 0.0761724110 * y + 0.9568845240 * z,
    )
}

private fun inGamut(rgb: DoubleArray): Boolean = rgb.all { it >= -0.0005 && it <= 1.0005 }

private fun encode(linear: Double): Float {
    val v = linear.coerceIn(0.0, 1.0)
    return (if (v <= 0.0031308) 12.92 * v else 1.055 * v.pow(1 / 2.4) - 0.055).toFloat()
}
