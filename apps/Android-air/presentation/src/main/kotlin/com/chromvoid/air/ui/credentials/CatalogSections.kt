package com.chromvoid.air.ui.credentials

import com.chromvoid.air.presentation.R

/** The title of one of Core's catalog sections, when the key is one this client names. */
internal fun sectionTitle(grouping: CatalogOptions.Grouping, key: String?): Int? = when (grouping) {
    CatalogOptions.Grouping.NONE -> null
    CatalogOptions.Grouping.WEBSITE -> if (key.isNullOrEmpty()) R.string.section_no_website else null
    CatalogOptions.Grouping.MODIFIED -> when (key) {
        "today" -> R.string.section_today
        "yesterday" -> R.string.section_yesterday
        "week" -> R.string.section_week
        "month" -> R.string.section_month
        "year" -> R.string.section_year
        else -> R.string.section_older
    }
    CatalogOptions.Grouping.SECURITY ->
        if (key == "otp") R.string.options_filter_codes else R.string.section_without_codes
}
