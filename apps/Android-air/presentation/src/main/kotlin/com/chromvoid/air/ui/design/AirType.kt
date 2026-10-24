package com.chromvoid.air.ui.design

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * The text scale of the iOS client, in its point sizes: a large title for a
 * root, headline for a row's name, subheadline for its detail, footnote for a
 * field caption. Android's own font renders them.
 */
public object AirType {
    public val largeTitle: TextStyle = TextStyle(fontSize = 34.sp, lineHeight = 41.sp, fontWeight = FontWeight.Bold)
    public val title: TextStyle = TextStyle(fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold)
    public val title2: TextStyle = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold)
    public val title3: TextStyle = TextStyle(fontSize = 20.sp, lineHeight = 25.sp, fontWeight = FontWeight.SemiBold)
    public val headline: TextStyle = TextStyle(fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold)
    /** A quiet label above a grouped card, distinct from a standalone list title. */
    public val sectionHeader: TextStyle = TextStyle(
        fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.Medium,
    )
    public val body: TextStyle = TextStyle(fontSize = 17.sp, lineHeight = 22.sp)
    public val callout: TextStyle = TextStyle(fontSize = 16.sp, lineHeight = 21.sp)
    public val subheadline: TextStyle = TextStyle(fontSize = 15.sp, lineHeight = 20.sp)
    public val footnote: TextStyle = TextStyle(fontSize = 13.sp, lineHeight = 18.sp)
    public val caption: TextStyle = TextStyle(fontSize = 12.sp, lineHeight = 16.sp)
    public val caption2: TextStyle = TextStyle(fontSize = 11.sp, lineHeight = 13.sp)
    public val code: TextStyle = TextStyle(fontSize = 34.sp, lineHeight = 40.sp, fontWeight = FontWeight.SemiBold)

    /** Material components (fields, dialogs, menus) read these; they match the scale above. */
    internal val material: Typography = Typography(
        displaySmall = largeTitle,
        headlineMedium = title,
        headlineSmall = title2,
        titleLarge = title3,
        titleMedium = headline,
        titleSmall = subheadline.copy(fontWeight = FontWeight.SemiBold),
        bodyLarge = body,
        bodyMedium = subheadline,
        bodySmall = footnote,
        labelLarge = callout.copy(fontWeight = FontWeight.Medium),
        labelMedium = footnote.copy(fontWeight = FontWeight.Medium),
        labelSmall = caption2.copy(fontWeight = FontWeight.Medium),
    )
}
