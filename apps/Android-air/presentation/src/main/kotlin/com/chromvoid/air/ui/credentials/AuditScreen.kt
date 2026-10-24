package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.UnfoldMore
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.CredentialSecurityAuditRow
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.root.CoversTabBar
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.SectionFooter
import com.chromvoid.air.ui.design.StatusBlock
import com.chromvoid.air.ui.design.TabBarClearance

public const val AUDIT_BACK_TAG: String = "audit-back"
public const val AUDIT_STALE_TAG: String = "audit-stale"
public const val AUDIT_FILTER_TAG: String = "audit-filter"

public fun auditFilterTag(filter: AuditModel.Filter): String = "audit-filter-${filter.name.lowercase()}"

public fun auditRowTag(id: String): String = "audit-row-$id"

/**
 * Core's assessment of the vault's passwords, as the iOS audit sheet shows
 * it: what it is for, the counts across the vault, a Show filter, and the
 * credentials the filter keeps. A password Core could not check is said to
 * be unchecked, never safe.
 */
@Composable
public fun AuditScreen(model: AuditModel, onOpen: (String) -> Unit, onBack: () -> Unit, modifier: Modifier = Modifier) {
    CoversTabBar()
    val pane = stringResource(R.string.au_title)
    val state by model.state.collectAsStateWithLifecycle()
    AirScreen(
        title = pane,
        largeTitle = false,
        modifier = modifier.semantics { paneTitle = pane },
        leading = { DoneButton(stringResource(R.string.au_done), onBack, Modifier.testTag(AUDIT_BACK_TAG)) },
        actions = { PillIcon(Icons.Rounded.Refresh, stringResource(R.string.au_run_again), onClick = model::reload) },
    ) {
        item(key = "intro") {
            Column(modifier = Modifier.padding(top = 8.dp)) {
                SectionFooter(stringResource(R.string.au_intro))
                SectionFooter(stringResource(R.string.au_estimate))
            }
        }
        state.counts?.let { counts ->
            item(key = "counts") {
                AirSection(header = stringResource(R.string.au_across)) {
                    AirRow(stringResource(R.string.au_credentials), value = counts.total.toString())
                    RowDivider()
                    AirRow(stringResource(R.string.au_weak), value = counts.weak.toString())
                    RowDivider()
                    AirRow(stringResource(R.string.au_reused), value = counts.reused.toString())
                    RowDivider()
                    AirRow(stringResource(R.string.au_with_codes), value = counts.withCodes.toString())
                    if (counts.notChecked > 0) {
                        RowDivider()
                        AirRow(stringResource(R.string.au_not_checked), value = counts.notChecked.toString())
                    }
                }
            }
        }
        item(key = "filter") { FilterRow(state.filter, model::setFilter) }
        when (state.status) {
            AuditModel.Status.LOADING -> item(key = "loading") {
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Air.colors.accent)
                }
            }
            AuditModel.Status.STALE -> item(key = "stale") {
                StatusBlock(
                    stringResource(R.string.au_changed),
                    action = stringResource(R.string.au_run_again),
                    onAction = model::reload,
                    modifier = Modifier.testTag(AUDIT_STALE_TAG),
                )
            }
            AuditModel.Status.FAILED -> item(key = "failed") {
                StatusBlock(
                    stringResource(R.string.au_failed),
                    action = stringResource(R.string.au_run_again),
                    onAction = model::reload,
                )
            }
            AuditModel.Status.REVOKED -> Unit
            AuditModel.Status.READY -> item(key = "rows") {
                AirSection(header = stringResource(filterLabel(state.filter))) {
                    if (state.rows.isEmpty()) {
                        Text(
                            stringResource(R.string.au_no_match),
                            style = AirType.body,
                            color = Air.colors.textSecondary,
                            modifier = Modifier.padding(20.dp),
                        )
                    }
                    state.rows.forEachIndexed { index, row ->
                        if (index > 0) RowDivider()
                        AuditRow(row, onClick = { onOpen(row.credential.id) })
                    }
                    if (state.canLoadMore) {
                        RowDivider()
                        ActionRow(
                            stringResource(R.string.au_load_more),
                            onClick = model::loadMore,
                            enabled = !state.loadingMore,
                        )
                    }
                }
            }
        }
        item(key = "clearance") { TabBarClearance() }
    }
}

/** "Show  All credentials ⇕": the one filter, as the iOS picker row. */
@Composable
private fun FilterRow(selected: AuditModel.Filter, onSelect: (AuditModel.Filter) -> Unit) {
    var open by remember { mutableStateOf(false) }
    AirSection {
        Box {
            AirRow(
                stringResource(R.string.au_show),
                value = stringResource(filterLabel(selected)),
                onClick = { open = true },
                modifier = Modifier.testTag(AUDIT_FILTER_TAG),
                trailing = {
                    Icon(Icons.Rounded.UnfoldMore, contentDescription = null, tint = Air.colors.textSecondary)
                },
            )
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                AuditModel.Filter.entries.forEach { filter ->
                    DropdownMenuItem(
                        text = { Text(stringResource(filterLabel(filter)), style = AirType.body) },
                        leadingIcon = {
                            Icon(
                                Icons.Rounded.Check,
                                contentDescription = null,
                                tint = if (filter == selected) Air.colors.accent else Air.colors.card,
                            )
                        },
                        onClick = {
                            open = false
                            onSelect(filter)
                        },
                        modifier = Modifier.testTag(auditFilterTag(filter)),
                    )
                }
            }
        }
    }
}

@Composable
private fun AuditRow(row: CredentialSecurityAuditRow, onClick: () -> Unit) {
    val audit = row.audit
    val findings = if (audit == null) {
        listOf(stringResource(R.string.au_not_checked))
    } else {
        listOfNotNull(
            stringResource(R.string.au_row_weak).takeIf { audit.weakPassword },
            stringResource(R.string.au_row_reused).takeIf { audit.reusedPassword },
            stringResource(R.string.au_with_codes).takeIf { audit.hasTwoFactor },
        )
    }
    val detail = listOfNotNull(row.credential.username.takeIf { it.isNotBlank() }).joinToString()
    Column(modifier = Modifier.testTag(auditRowTag(row.credential.id))) {
        AirRow(
            row.credential.title,
            subtitle = (listOf(detail).filter { it.isNotEmpty() } + findings).joinToString("\n"),
            chevron = true,
            onClick = onClick,
        )
    }
}

private fun filterLabel(filter: AuditModel.Filter): Int = when (filter) {
    AuditModel.Filter.ALL -> R.string.au_all
    AuditModel.Filter.WEAK -> R.string.au_weak
    AuditModel.Filter.REUSED -> R.string.au_reused
    AuditModel.Filter.WITHOUT_CODES -> R.string.au_without_codes
    AuditModel.Filter.NOT_CHECKED -> R.string.au_not_checked
}
