package com.chromvoid.air.ui.credentials

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.design.RowAction
import com.chromvoid.air.ui.design.oklch

public const val PAYMENT_CARD_FACE_TAG: String = "paymentCardFace"
public const val PAYMENT_CARD_NUMBER_TAG: String = "paymentCardNumber"
public const val PAYMENT_CARD_BRAND_TAG: String = "paymentCardBrand"
public const val PAYMENT_CARD_CODE_TAG: String = "paymentCardCode"

/**
 * The look of a card network, the iOS client's `PaymentCardStyle`: authored in
 * OKLCH and drawn in Display P3. Each card is a lit top-left corner falling
 * into depth, with the network's second colour glowing from the far corner,
 * so the white type keeps its contrast over every part of the face.
 */
internal class PaymentCardStyle private constructor(
    /** Lit corner, core, depth. */
    val base: List<Color>,
    val glow: Color,
    val glowStrength: Float,
) {
    /** A shadow in the card's own depth colour: the card lifting, not a grey smudge. */
    val shadow: Color get() = base[2].copy(alpha = 0.45f)

    internal companion object {
        private fun style(
            lit: Triple<Double, Double, Double>,
            core: Triple<Double, Double, Double>,
            depth: Triple<Double, Double, Double>,
            glow: Triple<Double, Double, Double>,
            strength: Float = 0.5f,
        ) = PaymentCardStyle(
            listOf(lit, core, depth).map { oklch(it.first, it.second, it.third) },
            oklch(glow.first, glow.second, glow.third),
            strength,
        )

        private val styles: Map<PaymentCardBrand?, PaymentCardStyle> by lazy {
            mapOf(
                // Visa blue (#1434CB) brought forward into an electric blue over indigo.
                PaymentCardBrand.VISA to style(
                    Triple(0.60, 0.20, 258.0), Triple(0.45, 0.23, 264.0), Triple(0.27, 0.15, 270.0),
                    Triple(0.78, 0.13, 215.0),
                ),
                // Neutral graphite with a faint ember of the network's orange.
                PaymentCardBrand.MASTERCARD to style(
                    Triple(0.34, 0.006, 260.0), Triple(0.23, 0.005, 260.0), Triple(0.14, 0.004, 260.0),
                    Triple(0.64, 0.21, 38.0), 0.3f,
                ),
                PaymentCardBrand.MIR to style(
                    Triple(0.60, 0.15, 158.0), Triple(0.45, 0.12, 166.0), Triple(0.29, 0.08, 182.0),
                    Triple(0.78, 0.12, 215.0),
                ),
                PaymentCardBrand.AMEX to style(
                    Triple(0.64, 0.14, 238.0), Triple(0.47, 0.15, 250.0), Triple(0.30, 0.12, 263.0),
                    Triple(0.90, 0.05, 210.0),
                ),
                PaymentCardBrand.UNIONPAY to style(
                    Triple(0.58, 0.20, 22.0), Triple(0.42, 0.16, 16.0), Triple(0.27, 0.10, 10.0),
                    Triple(0.68, 0.12, 200.0), 0.3f,
                ),
                PaymentCardBrand.JCB to style(
                    Triple(0.60, 0.14, 160.0), Triple(0.44, 0.11, 195.0), Triple(0.29, 0.10, 255.0),
                    Triple(0.66, 0.19, 25.0), 0.25f,
                ),
                PaymentCardBrand.DISCOVER to style(
                    Triple(0.68, 0.17, 55.0), Triple(0.53, 0.18, 42.0), Triple(0.33, 0.12, 36.0),
                    Triple(0.88, 0.12, 85.0),
                ),
                PaymentCardBrand.DINERSCLUB to style(
                    Triple(0.56, 0.06, 245.0), Triple(0.40, 0.05, 250.0), Triple(0.25, 0.03, 255.0),
                    Triple(0.80, 0.08, 220.0),
                ),
                PaymentCardBrand.MAESTRO to style(
                    Triple(0.48, 0.13, 255.0), Triple(0.32, 0.09, 258.0), Triple(0.19, 0.04, 260.0),
                    Triple(0.66, 0.20, 25.0), 0.3f,
                ),
                // No network yet: the brand's graphite and ice blue.
                null to style(
                    Triple(0.44, 0.03, 240.0), Triple(0.31, 0.025, 245.0), Triple(0.19, 0.015, 250.0),
                    Triple(0.66, 0.175, 232.0),
                ),
            )
        }

        fun of(brand: PaymentCardBrand?): PaymentCardStyle = styles.getValue(brand)
    }
}

private val CardShape = RoundedCornerShape(18.dp)
private val CardWhite = Color.White

/** The card number as printed: monospaced, spaced out. */
internal val CardNumberStyle: TextStyle = TextStyle(
    fontFamily = FontFamily.Monospace,
    fontWeight = FontWeight.Medium,
    fontSize = 21.sp,
    letterSpacing = 1.5.sp,
    color = CardWhite,
)

/** Holder, code and expiry values on the face. */
internal val CardValueStyle: TextStyle = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium, color = CardWhite)

internal val CardMonoValueStyle: TextStyle = CardValueStyle.copy(fontFamily = FontFamily.Monospace)

/**
 * The card as the physical object, shared by the page and the form: the
 * network's colours, the chip and the network's mark on top, the number in
 * the middle and the bottom row below. ID-1 proportions, no wider than 380 dp.
 */
@Composable
internal fun PaymentCardFrame(
    brand: PaymentCardBrand?,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(20.dp),
    number: @Composable ColumnScope.() -> Unit,
    bottom: @Composable RowScope.() -> Unit,
) {
    val style = PaymentCardStyle.of(brand)
    Box(
        modifier = modifier
            .widthIn(max = 380.dp)
            .fillMaxWidth()
            .aspectRatio(1.586f)
            .shadow(16.dp, CardShape, clip = false, ambientColor = style.shadow, spotColor = style.shadow)
            .clip(CardShape)
            .border(
                0.75.dp,
                Brush.linearGradient(listOf(CardWhite.copy(alpha = 0.38f), CardWhite.copy(alpha = 0.06f))),
                CardShape,
            )
            .testTag(PAYMENT_CARD_FACE_TAG),
    ) {
        PaymentCardBackground(style, Modifier.matchParentSize())
        Column(modifier = Modifier.matchParentSize().padding(contentPadding)) {
            Row(verticalAlignment = Alignment.Top) {
                PaymentCardChip()
                Spacer(Modifier.weight(1f))
                PaymentCardWordmark(brand, Modifier.testTag(PAYMENT_CARD_BRAND_TAG))
            }
            Spacer(Modifier.weight(1f).height(8.dp))
            number()
            Spacer(Modifier.weight(1f).height(8.dp))
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                bottom()
            }
        }
    }
}

/** The face without its type, the iOS `PaymentCardBackground`. Colours follow a network change. */
@Composable
private fun PaymentCardBackground(style: PaymentCardStyle, modifier: Modifier) {
    val lit by animateColorAsState(style.base[0], label = "cardLit")
    val core by animateColorAsState(style.base[1], label = "cardCore")
    val depth by animateColorAsState(style.base[2], label = "cardDepth")
    val glow by animateColorAsState(style.glow, label = "cardGlow")
    val strength by animateFloatAsState(style.glowStrength, label = "cardGlowStrength")
    Canvas(modifier = modifier.clipToBounds()) {
        val width = size.width
        val height = size.height
        drawRect(Brush.linearGradient(listOf(lit, core, depth), start = Offset.Zero, end = Offset(width, height)))
        drawRect(
            Brush.radialGradient(
                listOf(glow.copy(alpha = strength), glow.copy(alpha = 0f)),
                center = Offset(width * 1.05f, height * 1.1f),
                radius = width * 0.8f,
            ),
        )
        // Quiet rings from the far corner, the pattern printed cards carry.
        repeat(3) { ring ->
            drawCircle(
                CardWhite.copy(alpha = 0.07f),
                radius = width * (0.55f + 0.3f * ring) / 2,
                center = Offset(width * 0.98f, height * 1.02f),
                style = Stroke(1.dp.toPx()),
            )
        }
        // A soft sheen over the top, as light falls on a real card.
        drawRect(
            Brush.linearGradient(
                0f to CardWhite.copy(alpha = 0.20f),
                0.35f to CardWhite.copy(alpha = 0.05f),
                0.6f to Color.Transparent,
                start = Offset.Zero,
                end = Offset(width / 2, height),
            ),
        )
    }
}

/** The gold contact chip. */
@Composable
private fun PaymentCardChip() {
    Canvas(modifier = Modifier.size(40.dp, 30.dp)) {
        val corner = androidx.compose.ui.geometry.CornerRadius(5.dp.toPx())
        drawRoundRect(
            Brush.linearGradient(
                listOf(Color(0.93f, 0.80f, 0.45f), Color(0.72f, 0.55f, 0.22f)),
                start = Offset.Zero,
                end = Offset(size.width, size.height),
            ),
            cornerRadius = corner,
        )
        val line = Color.Black.copy(alpha = 0.25f)
        val stroke = 1.dp.toPx()
        val unit = size.width / 40f
        for (y in listOf(10f, 20f)) drawLine(line, Offset(0f, y * unit), Offset(size.width, y * unit), stroke)
        for (x in listOf(14f, 26f)) drawLine(line, Offset(x * unit, 0f), Offset(x * unit, size.height), stroke)
    }
}

/** The network's mark, drawn with type and simple shapes so no logo assets are bundled. */
@Composable
private fun PaymentCardWordmark(brand: PaymentCardBrand?, modifier: Modifier = Modifier) {
    when (brand) {
        PaymentCardBrand.MASTERCARD, PaymentCardBrand.MAESTRO -> {
            val maestro = brand == PaymentCardBrand.MAESTRO
            val second = if (maestro) Color(0.00f, 0.60f, 0.87f) else Color(0.97f, 0.62f, 0.11f)
            val overlap = if (maestro) Color(0.45f, 0.36f, 0.75f) else Color(1.00f, 0.37f, 0.00f)
            val name = brand.displayName
            Canvas(modifier = modifier.size(42.dp, 26.dp).semantics { contentDescription = name }) {
                val radius = size.height / 2
                val offset = 8.dp.toPx()
                val left = Offset(size.width / 2 - offset, size.height / 2)
                val right = Offset(size.width / 2 + offset, size.height / 2)
                drawCircle(Color(0.92f, 0.00f, 0.11f), radius, left)
                drawCircle(second, radius, right)
                val lens = Path().apply { addOval(Rect(left, radius)) }
                clipPath(lens) { drawCircle(overlap, radius, right) }
            }
        }
        PaymentCardBrand.VISA -> BasicText(
            "VISA",
            modifier = modifier,
            style = TextStyle(
                color = CardWhite,
                fontSize = 22.sp,
                fontWeight = FontWeight.Black,
                fontStyle = FontStyle.Italic,
                letterSpacing = 0.5.sp,
            ),
        )
        null -> Icon(
            Icons.Rounded.CreditCard,
            contentDescription = null,
            tint = CardWhite,
            modifier = modifier.size(22.dp),
        )
        else -> BasicText(
            if (brand == PaymentCardBrand.JCB || brand == PaymentCardBrand.MIR) {
                brand.displayName.uppercase()
            } else {
                brand.displayName
            },
            modifier = modifier,
            style = TextStyle(
                color = CardWhite,
                fontSize = if (brand == PaymentCardBrand.AMEX) 12.sp else 17.sp,
                fontWeight = FontWeight.ExtraBold,
            ),
        )
    }
}

/** A small caption over a value on the face: `CARDHOLDER`, `EXPIRES`. */
@Composable
internal fun CardCaption(text: String) {
    BasicText(
        text.uppercase(),
        style = TextStyle(
            fontSize = 9.sp,
            fontWeight = FontWeight.SemiBold,
            color = CardWhite.copy(alpha = 0.65f),
        ),
    )
}

/**
 * The card on its record page, the iOS `PaymentCardFace`: the number stays
 * masked to its last four until it is revealed below, and the security code
 * shows on the face behind its own eye.
 */
@Composable
internal fun PaymentCardFace(
    face: CredentialDetailModel.CardFace,
    onToggleCode: () -> Unit,
    codeBusy: Boolean,
    modifier: Modifier = Modifier,
) {
    val codeCaption = stringResource(R.string.card_face_cvv)
    PaymentCardFrame(
        face.brand,
        modifier = modifier,
        number = {
            BasicText(
                face.number,
                style = CardNumberStyle,
                maxLines = 1,
                autoSize = TextAutoSize.StepBased(minFontSize = 12.sp, maxFontSize = 21.sp),
                modifier = Modifier.fillMaxWidth().testTag(PAYMENT_CARD_NUMBER_TAG),
            )
        },
        bottom = {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                CardCaption(stringResource(R.string.card_face_cardholder))
                BasicText(
                    face.holder.ifEmpty { "—" }.uppercase(),
                    style = CardValueStyle,
                    maxLines = 1,
                    autoSize = TextAutoSize.StepBased(minFontSize = 10.sp, maxFontSize = 14.sp),
                )
            }
            // The eye stands beside the code, not under its caption, so CVV and
            // EXPIRES read on one line.
            Row(verticalAlignment = Alignment.Bottom) {
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    CardCaption(codeCaption)
                    BasicText(
                        face.code ?: "•••",
                        style = CardMonoValueStyle,
                        modifier = Modifier.widthIn(min = 30.dp).testTag(PAYMENT_CARD_CODE_TAG),
                    )
                }
                RowAction(
                    if (face.code == null) Icons.Rounded.Visibility else Icons.Rounded.VisibilityOff,
                    stringResource(if (face.code == null) R.string.detail_show else R.string.detail_hide, codeCaption),
                    onClick = onToggleCode,
                    enabled = !codeBusy,
                    tint = CardWhite,
                    modifier = Modifier.testTag(secretRevealTag(CredentialDetailModel.CARD_CODE)),
                )
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                CardCaption(stringResource(R.string.card_face_expires))
                BasicText(face.expiry, style = CardMonoValueStyle)
            }
        },
    )
}

/**
 * Each small field reserves its own touch cell. A full year and the security
 * code also keep the text width used by iOS, including their 8 dp side padding.
 */
internal val CardTwoDigits = 48.dp
internal val CardFourDigits = 56.dp
internal val CardCodeWidth = 60.dp
