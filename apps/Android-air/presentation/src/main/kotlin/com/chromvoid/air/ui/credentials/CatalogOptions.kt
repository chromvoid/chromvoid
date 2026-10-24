package com.chromvoid.air.ui.credentials

/**
 * How a catalog level orders, narrows and groups its records. Every value is a
 * Core request parameter: sorting, filtering and grouping happen in Core over
 * the whole scope, never over the page already on screen.
 */
public data class CatalogOptions(
    val sort: Sort = Sort.NAME,
    val descending: Boolean = false,
    val kind: Kind = Kind.ALL,
    val quickFilters: Set<QuickFilter> = emptySet(),
    val grouping: Grouping = Grouping.NONE,
) {
    public enum class Sort(public val wire: String) {
        NAME("name"),
        USERNAME("username"),
        WEBSITE("website"),
        CREATED("created"),
        MODIFIED("modified"),
    }

    /**
     * The collections the UX calls All, Passwords, Cards and Codes. Codes is
     * the logins that carry one-time codes: Core's `otp` filter, not a type.
     */
    public enum class Kind(public val wire: String?, internal val filter: QuickFilter? = null) {
        ALL(null),
        LOGINS("login"),
        CARDS("payment_card"),
        CODES("login", QuickFilter.WITH_CODES),
    }

    /** Core's filters for this collection and the chosen quick filters together. */
    val requestFilters: List<String>
        get() = (quickFilters + listOfNotNull(kind.filter)).map { it.wire }

    public enum class QuickFilter(public val wire: String) {
        RECENT("recent"),
        WITH_CODES("otp"),
        WITH_SSH("ssh"),
    }

    public enum class Grouping(public val wire: String?) {
        NONE(null),
        WEBSITE("website"),
        MODIFIED("modified"),
        SECURITY("security"),
    }

    /** Filters narrow the list; sort and grouping only arrange it. */
    val hasFilters: Boolean get() = kind != Kind.ALL || quickFilters.isNotEmpty()

    public fun withoutFilters(): CatalogOptions = copy(kind = Kind.ALL, quickFilters = emptySet())

    public companion object {
        /** The section keys Core uses for each grouping; anything else is a broken reply. */
        public fun knownSection(grouping: Grouping, key: String?): Boolean = when (grouping) {
            Grouping.NONE -> key == null
            Grouping.WEBSITE -> key != null
            Grouping.MODIFIED -> key in MODIFIED_SECTIONS
            Grouping.SECURITY -> key == "otp" || key == "basic"
        }

        public val MODIFIED_SECTIONS: List<String> = listOf("today", "yesterday", "week", "month", "year", "older")
    }
}
