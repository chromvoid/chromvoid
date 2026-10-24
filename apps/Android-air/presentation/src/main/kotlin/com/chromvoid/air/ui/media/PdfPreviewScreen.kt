package com.chromvoid.air.ui.media

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import kotlinx.coroutines.delay
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionPill
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.LinkButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PrimaryButton
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.root.CoversTabBar

public const val PDF_TAG: String = "pdf"
public const val PDF_CLOSE_TAG: String = "pdf-close"
public const val PDF_PAGE_TAG: String = "pdf-page-indicator"
public const val PDF_PASSWORD_TAG: String = "pdf-password"
public const val PDF_OPEN_TAG: String = "pdf-open"
public const val PDF_ISSUE_TAG: String = "pdf-issue"
public const val PDF_FIND_TAG: String = "pdf-find"
public const val PDF_FIND_FIELD_TAG: String = "pdf-find-field"
public const val PDF_FIND_COUNT_TAG: String = "pdf-find-count"
public const val PDF_FIND_NEXT_TAG: String = "pdf-find-next"
public const val PDF_FIND_PREVIOUS_TAG: String = "pdf-find-previous"
public const val PDF_FIND_DONE_TAG: String = "pdf-find-done"
public const val PDF_LINK_REFUSED_TAG: String = "pdf-link-refused"
public const val PDF_PREVIOUS_PAGE_TAG: String = "pdf-previous-page"
public const val PDF_NEXT_PAGE_TAG: String = "pdf-next-page"

public fun pdfPageTag(index: Int): String = "pdf-page-$index"

/** Present once the page is drawn. */
public fun pdfDrawnTag(index: Int): String = "pdf-drawn-$index"

/**
 * A PDF, as the iOS preview shows it: Done, the name and the lock in the bar,
 * the pages one under another, drawn as they come into view, with where the
 * reader is; the password when the PDF has one; why it cannot be shown
 * otherwise.
 */
@Composable
public fun PdfPreviewScreen(model: PdfPreviewModel, onClose: () -> Unit, onLock: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    CoversTabBar()
    BackHandler(onBack = onClose)
    LaunchedEffect(model) { model.load() }
    val colors = Air.colors
    Column(modifier = Modifier.fillMaxSize().background(colors.canvas).testTag(PDF_TAG)) {
        Row(
            modifier = Modifier.fillMaxWidth().statusBarsPadding().height(60.dp).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DoneButton(
                stringResource(com.chromvoid.air.presentation.R.string.files_done),
                onClick = onClose,
                modifier = Modifier.testTag(PDF_CLOSE_TAG),
            )
            Text(
                model.name,
                style = AirType.headline,
                color = colors.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
            )
            ActionPill {
                if (state.status == PdfPreviewModel.Status.READY && state.readsText) {
                    PillIcon(
                        Icons.Outlined.Search,
                        stringResource(R.string.pdf_find),
                        onClick = model::startFind,
                        modifier = Modifier.testTag(PDF_FIND_TAG),
                    )
                }
                PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
            }
        }
        state.search?.let { search -> FindBar(model, search) }
        Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            when (state.status) {
                PdfPreviewModel.Status.READY -> Pages(model, state)
                PdfPreviewModel.Status.PASSWORD_REQUIRED -> Password(model, state.issue)
                PdfPreviewModel.Status.FAILED -> Failure(model, state.issue)
                else -> Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    CircularProgressIndicator(color = colors.accent)
                    Text(
                        stringResource(R.string.pdf_loading),
                        style = AirType.subheadline,
                        color = colors.textSecondary,
                    )
                }
            }
        }
    }
}

/** Find in PDF: what to look for, where the shown match is among them, and the way through them. */
@Composable
private fun FindBar(model: PdfPreviewModel, search: PdfPreviewModel.Search) {
    val colors = Air.colors
    var query by remember { mutableStateOf(search.query) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clip(CircleShape)
                .background(colors.surfaceSecondary)
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(modifier = Modifier.weight(1f)) {
                if (query.isEmpty()) {
                    Text(stringResource(R.string.pdf_find), style = AirType.body, color = colors.textTertiary)
                }
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = AirType.body.copy(color = colors.text),
                    cursorBrush = SolidColor(colors.accent),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { model.find(query) }),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus).testTag(PDF_FIND_FIELD_TAG),
                )
            }
            when {
                search.searching -> CircularProgressIndicator(
                    color = colors.accent,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(16.dp),
                )
                search.searched -> Text(
                    if (search.matches.isEmpty()) {
                        stringResource(R.string.pdf_find_none)
                    } else {
                        stringResource(R.string.pdf_find_count, search.current + 1, search.matches.size)
                    },
                    style = AirType.footnote,
                    color = colors.textSecondary,
                    modifier = Modifier.padding(start = 8.dp).testTag(PDF_FIND_COUNT_TAG),
                )
            }
        }
        val stepping = search.matches.size > 1
        PillIcon(
            Icons.Rounded.KeyboardArrowUp,
            stringResource(R.string.pdf_find_previous),
            onClick = model::previousMatch,
            enabled = stepping,
            modifier = Modifier.testTag(PDF_FIND_PREVIOUS_TAG),
        )
        PillIcon(
            Icons.Rounded.KeyboardArrowDown,
            stringResource(R.string.pdf_find_next),
            onClick = model::nextMatch,
            enabled = stepping,
            modifier = Modifier.testTag(PDF_FIND_NEXT_TAG),
        )
        LinkButton(
            stringResource(R.string.files_done),
            onClick = model::endFind,
            modifier = Modifier.testTag(PDF_FIND_DONE_TAG),
        )
    }
}

@Composable
private fun Pages(model: PdfPreviewModel, state: PdfPreviewModel.State) {
    val list = rememberLazyListState()
    val shown by remember(list, state.pageCount) {
        derivedStateOf {
            val layout = list.layoutInfo
            val page = layout.visibleItemsInfo.filter { it.index < state.pageCount }.maxByOrNull { item ->
                (minOf(item.offset + item.size, layout.viewportEndOffset) -
                    maxOf(item.offset, layout.viewportStartOffset)).coerceAtLeast(0)
            }
            (page?.index ?: 0) + 1
        }
    }
    // A match found or a link followed brings its page on screen.
    LaunchedEffect(state.pageRequest) { state.pageRequest?.let { list.animateScrollToItem(it.index) } }
    if (state.linkRefused) {
        LaunchedEffect(Unit) {
            delay(REFUSAL_SHOWN_MILLIS)
            model.dismissLinkRefusal()
        }
    }
    val matches = state.search?.matches.orEmpty()
    val shownMatch = state.search?.current?.let(matches::getOrNull)
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val width = with(LocalDensity.current) { (maxWidth - 32.dp).roundToPx() }
        LazyColumn(
            state = list,
            userScrollEnabled = state.viewports.isEmpty(),
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            itemsIndexed(state.pageSizes) { index, (pageWidth, pageHeight) ->
                PdfPageSurface(model, state, index, pageWidth, pageHeight, width, list, matches, shownMatch)
            }
            item { Box(modifier = Modifier.navigationBarsPadding().heightIn(min = 72.dp)) }
        }
        if (state.linkRefused) {
            Text(
                stringResource(R.string.pdf_link_refused),
                style = AirType.footnote,
                color = Air.colors.text,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(start = 24.dp, end = 24.dp, bottom = 64.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Air.colors.surfaceSecondary)
                    .padding(horizontal = 16.dp, vertical = 10.dp)
                    .testTag(PDF_LINK_REFUSED_TAG),
            )
        }
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 16.dp)
                .clip(CircleShape)
                .background(Air.colors.surfaceSecondary),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PillIcon(
                Icons.AutoMirrored.Rounded.KeyboardArrowLeft,
                stringResource(R.string.pdf_previous_page),
                onClick = { model.goToPage(shown - 2) },
                enabled = shown > 1,
                modifier = Modifier.testTag(PDF_PREVIOUS_PAGE_TAG),
            )
            Text(
                stringResource(R.string.pdf_page, shown, state.pageCount),
                style = AirType.footnote,
                color = Air.colors.text,
                modifier = Modifier.padding(horizontal = 8.dp).testTag(PDF_PAGE_TAG),
            )
            PillIcon(
                Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                stringResource(R.string.pdf_next_page),
                onClick = { model.goToPage(shown) },
                enabled = shown < state.pageCount,
                modifier = Modifier.testTag(PDF_NEXT_PAGE_TAG),
            )
        }
    }
}

private const val REFUSAL_SHOWN_MILLIS = 3_000L

@Composable
private fun Password(model: PdfPreviewModel, issue: PdfPreviewModel.Issue?) {
    var password by remember { mutableStateOf("") }
    val colors = Air.colors
    Column(modifier = Modifier.fillMaxSize().padding(top = 8.dp)) {
        AirSection {
            Text(
                stringResource(R.string.pdf_password_prompt),
                style = AirType.body,
                color = colors.text,
                modifier = Modifier.padding(20.dp),
            )
            RowDivider()
            Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp)) {
                if (password.isEmpty()) Text(
                    stringResource(R.string.pdf_password),
                    style = AirType.body,
                    color = colors.textTertiary,
                )
                BasicTextField(
                    value = password,
                    onValueChange = { password = it },
                    singleLine = true,
                    textStyle = AirType.body.copy(color = colors.text),
                    cursorBrush = SolidColor(colors.accent),
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { model.load(password) }),
                    modifier = Modifier.fillMaxWidth().testTag(PDF_PASSWORD_TAG),
                )
            }
            if (issue == PdfPreviewModel.Issue.WRONG_PASSWORD) {
                RowDivider()
                Text(
                    stringResource(R.string.pdf_wrong_password),
                    style = AirType.footnote,
                    color = colors.danger,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                )
            }
        }
        PrimaryButton(
            stringResource(R.string.pdf_open),
            onClick = { model.load(password) },
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp).testTag(PDF_OPEN_TAG),
        )
    }
}

@Composable
private fun Failure(model: PdfPreviewModel, issue: PdfPreviewModel.Issue?) {
    Column(
        modifier = Modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            Icons.Outlined.Description,
            contentDescription = null,
            tint = Air.colors.textSecondary,
            modifier = Modifier.size(44.dp),
        )
        Text(
            stringResource(
                when (issue) {
                    PdfPreviewModel.Issue.TOO_LARGE -> R.string.pdf_too_large
                    PdfPreviewModel.Issue.PROTECTED -> R.string.pdf_protected
                    PdfPreviewModel.Issue.DEVICE -> R.string.pdf_device
                    PdfPreviewModel.Issue.CHANGED -> R.string.media_image_changed
                    PdfPreviewModel.Issue.FAILED -> R.string.files_issue_other
                    else -> R.string.pdf_damaged
                },
            ),
            style = AirType.body,
            color = Air.colors.text,
            textAlign = TextAlign.Center,
            modifier = Modifier.testTag(PDF_ISSUE_TAG),
        )
        if (issue != PdfPreviewModel.Issue.PROTECTED && issue != PdfPreviewModel.Issue.DEVICE) {
            LinkButton(stringResource(R.string.media_try_again), onClick = { model.load() })
        }
    }
}
