package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.credentials.CredentialFormModel.Field
import com.chromvoid.air.ui.design.airEditableField

/**
 * The payment card as the form, the iOS `PaymentCardEditor`: number, holder,
 * expiry and security code are typed on the card face itself, in the clear.
 * The vault is already open here, so nothing is masked and no show control
 * shifts the form; release builds keep the window out of screenshots and the
 * recents preview. The number is grouped as its network prints it while it
 * is typed, and the face takes the network's colours as soon as Core names it.
 */
@Composable
internal fun PaymentCardEditor(
    model: CredentialFormModel,
    state: CredentialFormModel.State,
    requesters: Map<Field, FocusRequester>,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    val format = state.cardFormat
    val brand = PaymentCardBrand.of(format?.network)
    PaymentCardFrame(
        brand,
        modifier = modifier,
        // Leave space between the chip and number even with 48dp inputs and larger type.
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
        number = {
            CardCaption(stringResource(R.string.form_card_number))
            val number = state.value(Field.CARD_NUMBER)
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                // The size follows what the field will hold, never under the hand:
                // sixteen digits keep 21 sp, a nineteen-digit number steps down.
                val grouped = groupedLength(number.length, format?.groups ?: DEFAULT_GROUPS)
                val shown = maxOf(PLACEHOLDER_NUMBER.length, grouped)
                val style = CardNumberStyle.copy(fontSize = numberFontSize(maxWidth - 18.dp, shown))
                CardField(
                    field = Field.CARD_NUMBER,
                    value = number,
                    onValueChange = { model.change(Field.CARD_NUMBER, it) },
                    placeholder = PLACEHOLDER_NUMBER,
                    label = stringResource(R.string.form_card_number),
                    error = state.errors[Field.CARD_NUMBER]?.let { stringResource(errorText(it)) },
                    requester = requesters.getValue(Field.CARD_NUMBER),
                    enabled = enabled,
                    textStyle = style,
                    keyboardType = KeyboardType.NumberPassword,
                    contentType = ContentType.CreditCardNumber,
                    visualTransformation = CardNumberTransformation(format?.groups ?: DEFAULT_GROUPS),
                    onNext = { model.advance(Field.CARD_NUMBER) },
                    onFocus = model::numberFocusChanged,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        bottom = {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                CardCaption(stringResource(R.string.form_cardholder))
                CardField(
                    field = Field.CARDHOLDER,
                    value = state.value(Field.CARDHOLDER),
                    onValueChange = { model.change(Field.CARDHOLDER, it) },
                    placeholder = stringResource(R.string.card_name_on_card),
                    label = stringResource(R.string.form_cardholder),
                    error = state.errors[Field.CARDHOLDER]?.let { stringResource(errorText(it)) },
                    requester = requesters.getValue(Field.CARDHOLDER),
                    enabled = enabled,
                    textStyle = CardValueStyle,
                    keyboardType = KeyboardType.Text,
                    capitalization = KeyboardCapitalization.Characters,
                    contentType = ContentType.PersonFullName,
                    onNext = { model.advance(Field.CARDHOLDER) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                CardCaption(stringResource(R.string.card_face_cvv))
                CardField(
                    field = Field.CARD_CODE,
                    value = state.value(Field.CARD_CODE),
                    onValueChange = { model.change(Field.CARD_CODE, it) },
                    placeholder = "•••",
                    label = stringResource(R.string.form_card_code),
                    error = state.errors[Field.CARD_CODE]?.let { stringResource(errorText(it)) },
                    requester = requesters.getValue(Field.CARD_CODE),
                    enabled = enabled,
                    textStyle = CardMonoValueStyle,
                    textAlign = TextAlign.End,
                    keyboardType = KeyboardType.NumberPassword,
                    contentType = ContentType.CreditCardSecurityCode,
                    onNext = { model.advance(Field.CARD_CODE) },
                    modifier = Modifier.width(CardCodeWidth),
                )
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Column(
                        modifier = Modifier.width(CardTwoDigits),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        CardCaption(stringResource(R.string.form_month))
                        CardField(
                            field = Field.MONTH,
                            value = state.value(Field.MONTH),
                            onValueChange = { model.change(Field.MONTH, it) },
                            placeholder = "MM",
                            label = stringResource(R.string.form_month),
                            error = state.errors[Field.MONTH]?.let { stringResource(errorText(it)) },
                            requester = requesters.getValue(Field.MONTH),
                            enabled = enabled,
                            textStyle = CardMonoValueStyle,
                            textAlign = TextAlign.Center,
                            keyboardType = KeyboardType.Number,
                            contentType = ContentType.CreditCardExpirationMonth,
                            onNext = { model.advance(Field.MONTH) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    val year = state.value(Field.YEAR)
                    Column(
                        // Two digits as printed, or the full year.
                        modifier = Modifier.width(if (year.length > 2) CardFourDigits else CardTwoDigits),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        CardCaption(stringResource(R.string.form_year))
                        CardField(
                            field = Field.YEAR,
                            value = year,
                            onValueChange = { model.change(Field.YEAR, it) },
                            placeholder = "YY",
                            label = stringResource(R.string.form_year),
                            error = state.errors[Field.YEAR]?.let { stringResource(errorText(it)) },
                            requester = requesters.getValue(Field.YEAR),
                            enabled = enabled,
                            textStyle = CardMonoValueStyle,
                            textAlign = TextAlign.Center,
                            keyboardType = KeyboardType.Number,
                            contentType = ContentType.CreditCardExpirationYear,
                            onNext = { model.advance(Field.YEAR) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        },
    )
}

private const val PLACEHOLDER_NUMBER = "•••• •••• •••• ••••"
private val DEFAULT_GROUPS = listOf(4, 4, 4, 4, 3)
private val InputShape = RoundedCornerShape(8.dp)

/** How many characters [digits] digits take once grouped. */
private fun groupedLength(digits: Int, groups: List<Int>): Int {
    var end = 0
    var spaces = 0
    for (size in groups) {
        end += size
        if (end < digits) spaces++ else break
    }
    return digits + spaces
}

/** Monospaced digits advance about 0.6 em, plus the 1.5 sp spacing; never above 21 sp. */
@Composable
private fun numberFontSize(width: Dp, characters: Int): androidx.compose.ui.unit.TextUnit {
    val density = LocalDensity.current
    val perCharacter = with(density) { width.toPx() / characters - 1.5.sp.toPx() }
    val size = with(density) { (perCharacter / 0.6f).toSp() }
    return if (size.value >= 21f) 21.sp else if (size.value <= 13f) 13.sp else size
}

/**
 * One field on the card face: drawn in light over the network's colour, a
 * brighter box while it holds focus, as the iOS `airCardInput`.
 */
@Composable
private fun CardField(
    field: Field,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    label: String,
    error: String?,
    requester: FocusRequester,
    enabled: Boolean,
    textStyle: TextStyle,
    keyboardType: KeyboardType,
    contentType: ContentType,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
    textAlign: TextAlign = TextAlign.Start,
    capitalization: KeyboardCapitalization = KeyboardCapitalization.None,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    onFocus: (Boolean) -> Unit = {},
) {
    var focused by remember { mutableStateOf(false) }
    val style = textStyle.copy(textAlign = textAlign)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = true,
        textStyle = style,
        cursorBrush = SolidColor(Color.White),
        visualTransformation = visualTransformation,
        keyboardOptions = KeyboardOptions(
            keyboardType = keyboardType,
            capitalization = capitalization,
            autoCorrectEnabled = false,
            imeAction = ImeAction.Next,
        ),
        keyboardActions = KeyboardActions(onNext = { onNext() }),
        modifier = modifier
            .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
            .focusRequester(requester)
            .onFocusChanged {
                if (focused != it.isFocused) {
                    focused = it.isFocused
                    onFocus(it.isFocused)
                }
            }
            .semantics { this.contentType = contentType }
            .airEditableField(label, error)
            .testTag(formFieldTag(field)),
        decorationBox = { inner ->
            // The field owns a full touch cell; its printed input remains the
            // small inset on the card instead of expanding into adjacent fields.
            Box(contentAlignment = Alignment.Center) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White.copy(alpha = if (focused) 0.28f else 0.16f), InputShape)
                        .border(
                            if (focused) 1.5.dp else 1.dp,
                            Color.White.copy(alpha = if (focused) 0.85f else 0.35f),
                            InputShape,
                        )
                        .padding(horizontal = 8.dp, vertical = 5.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (value.isEmpty()) {
                        BasicText(
                            placeholder,
                            style = style.copy(color = Color.White.copy(alpha = 0.45f)),
                            maxLines = 1,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    inner()
                }
            }
        },
    )
}

/**
 * The number in its network's groups, the separators on screen only: the
 * draft keeps digits, and the caret counts digits, so backspace just after a
 * space takes the digit before it and a paste is read as its digits.
 */
internal data class CardNumberTransformation(private val groups: List<Int>) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digits = text.text
        // Where a group ends and another digit follows: a space goes there.
        val breaks = buildList {
            var end = 0
            for (size in groups) {
                end += size
                if (end < digits.length) add(end) else break
            }
        }
        val shown = StringBuilder(digits.length + breaks.size)
        var next = 0
        digits.forEachIndexed { index, digit ->
            if (next < breaks.size && index == breaks[next]) {
                shown.append(' ')
                next++
            }
            shown.append(digit)
        }
        val mapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int = offset + breaks.count { it < offset }

            override fun transformedToOriginal(offset: Int): Int {
                var original = offset
                breaks.forEachIndexed { index, end -> if (end + index < offset) original-- }
                return original.coerceIn(0, digits.length)
            }
        }
        return TransformedText(AnnotatedString(shown.toString()), mapping)
    }
}
