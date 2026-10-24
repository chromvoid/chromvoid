package com.chromvoid.air.ui.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.common.BitMatrix
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/**
 * [value] as a QR code, black on white whatever the theme, as iOS draws it:
 * a scanner reads dark modules on a light field. The value is read aloud
 * beside it, so the code itself stays out of accessibility.
 */
@Composable
public fun AirQrCode(value: String, modifier: Modifier = Modifier, size: Dp = 200.dp) {
    val matrix = remember(value) { encode(value) }
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White)
            .padding(12.dp)
            .clearAndSetSemantics {},
    ) {
        Canvas(modifier = Modifier.size(size)) {
            val cell = this.size.width / matrix.width
            for (y in 0 until matrix.height) {
                for (x in 0 until matrix.width) {
                    if (matrix[x, y]) {
                        drawRect(
                            Color.Black,
                            topLeft = Offset(x * cell, y * cell),
                            size = Size(cell + 0.5f, cell + 0.5f),
                        )
                    }
                }
            }
        }
    }
}

private fun encode(value: String): BitMatrix =
    QRCodeWriter().encode(
        value,
        BarcodeFormat.QR_CODE,
        0,
        0,
        mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to 0),
    )
