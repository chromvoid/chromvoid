package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.CredentialSummary
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.root.CoversTabBar
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.StatusBlock
import com.chromvoid.air.ui.design.TabBarClearance

public const val CODES_COLLECTION_BACK_TAG: String = "codes-collection-back"
public const val CODES_COLLECTION_EMPTY_TAG: String = "codes-collection-empty"

public fun codesCollectionRowTag(id: String): String = "codes-collection-row-$id"

public fun codesCollectionCodesTag(id: String): String = "codes-collection-codes-$id"

/**
 * The Codes collection, as the iOS Codes screen: one card per login with its
 * name and login on top, opening the record, and its codes live below.
 */
@Composable
public fun CodesCollectionScreen(
    collection: CodesCollection,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    onLock: () -> Unit,
    modifier: Modifier = Modifier,
) {
    CoversTabBar()
    val pane = stringResource(R.string.vault_codes)
    val state by collection.catalog.state.collectAsStateWithLifecycle()
    AirScreen(
        title = pane,
        modifier = modifier.semantics { paneTitle = pane },
        onBack = onBack,
        backTag = CODES_COLLECTION_BACK_TAG,
        backDescription = stringResource(R.string.detail_back),
        actions = { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock) },
    ) {
        when {
            state.status == CatalogModel.Status.FAILED -> item {
                StatusBlock(
                    stringResource(R.string.vault_failed),
                    action = stringResource(R.string.vault_try_again),
                    onAction = { collection.catalog.reload() },
                )
            }
            state.entries.isEmpty() && state.status == CatalogModel.Status.LOADING -> item {
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Air.colors.accent)
                }
            }
            state.entries.isEmpty() -> item {
                StatusBlock(
                    stringResource(R.string.codes_none),
                    modifier = Modifier.testTag(CODES_COLLECTION_EMPTY_TAG),
                )
            }
        }
        state.entries.forEach { entry ->
            item(key = entry.id) { CodesCard(entry, collection.codesFor(entry.id), collection.catalog.icons, onOpen) }
        }
        if (state.canLoadMore) {
            item(key = "more") {
                androidx.compose.runtime.LaunchedEffect(state.entries.size) { collection.catalog.loadMore() }
            }
        }
        item { TabBarClearance() }
    }
}

@Composable
private fun CodesCard(
    entry: CredentialSummary,
    codes: CodesModel,
    icons: CredentialIconCache?,
    onOpen: (String) -> Unit,
) {
    AirSection {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onOpen(entry.id) }
                .testTag(codesCollectionRowTag(entry.id))
                .heightIn(min = 68.dp)
                .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            EntryIcon(entry.title, entry.entryType, entry.iconRef, icons, size = 40.dp)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    entry.title,
                    style = AirType.headline,
                    color = Air.colors.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (entry.username.isNotBlank()) {
                    Text(entry.username, style = AirType.subheadline, color = Air.colors.textSecondary, maxLines = 1)
                }
            }
            Icon(
                Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = Air.colors.textTertiary,
                modifier = Modifier.size(22.dp),
            )
        }
        RowDivider()
        CodesRows(codes, Modifier.testTag(codesCollectionCodesTag(entry.id)))
    }
}
