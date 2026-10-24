package com.chromvoid.air.ui.credentials

import kotlinx.coroutines.CoroutineScope

/**
 * The Codes collection of the vault root: every login that carries one-time
 * codes, a page at a time from Core's `otp` filter, and each shown record's
 * codes live. A record's code holder is made when its row first appears and
 * kept until the collection closes.
 */
public class CodesCollection(
    private val store: CredentialStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
    public val icons: CredentialIconCache? = null,
    searchDelayMillis: Long = CatalogModel.SEARCH_DELAY_MILLIS,
) {
    public val catalog: CatalogModel =
        CatalogModel(store, generation, scope, clipboard, icons, searchDelayMillis).apply {
            setOptions(CatalogOptions(kind = CatalogOptions.Kind.CODES))
        }
    private val codes = mutableMapOf<String, CodesModel>()

    /** The live codes of one record of the collection. */
    public fun codesFor(id: String): CodesModel =
        codes.getOrPut(id) { CodesModel(id, store, generation, scope, clipboard, scanner = null) }

    public fun reload() {
        catalog.reload()
        codes.values.forEach(CodesModel::reload)
    }

    public fun close() {
        catalog.close()
        codes.values.forEach(CodesModel::close)
        codes.clear()
    }
}
