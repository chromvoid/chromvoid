package com.chromvoid.air.ui.documents

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.MarkdownAlignment
import com.chromvoid.air.bridge.wire.MarkdownContentKind
import com.chromvoid.air.bridge.wire.MarkdownDocument
import com.chromvoid.air.bridge.wire.MarkdownTargetKind
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.LinkButton
import com.chromvoid.air.ui.media.ImagePreviewModel

public const val MARKDOWN_PREVIEW_TAG: String = "markdown-preview"

public fun markdownTaskTag(node: Int): String = "markdown-task-$node"

public fun markdownImageTag(node: Int): String = "markdown-image-$node"

/**
 * Core's parsed Markdown drawn as iOS draws it: the root blocks one under
 * another, links in the accent, tasks as boxes that tick through Core's task
 * editor, images of the vault drawn where the note puts them. Syntax, link
 * targets and source edits are Core's; this only draws. Unsupported content
 * stays visible as its text, never dropped.
 */
@Composable
internal fun MarkdownPreview(
    model: DocumentModel,
    document: MarkdownDocument,
    jump: DocumentModel.AnchorJump?,
    onExternal: (String) -> Unit,
) {
    val list = rememberLazyListState()
    val owners = remember(document) { rootOwners(document) }
    LaunchedEffect(jump) {
        val target = jump?.node ?: return@LaunchedEffect
        val root = owners[target] ?: return@LaunchedEffect
        list.animateScrollToItem(document.roots.indexOf(root.toLong()).coerceAtLeast(0))
    }
    val context = Context(model, document, onExternal, labels())
    LazyColumn(
        state = list,
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize().testTag(MARKDOWN_PREVIEW_TAG),
    ) {
        itemsIndexed(document.roots, key = { _, id -> id }) { _, id ->
            Box(modifier = Modifier.widthIn(max = 760.dp)) { Block(context, id.toInt()) }
        }
        item { Box(modifier = Modifier.height(24.dp)) }
    }
}

private class Labels(val image: String, val unavailable: String)

@Composable
private fun labels(): Labels = Labels(
    stringResource(R.string.doc_image),
    stringResource(R.string.doc_image_unavailable),
)

private class Context(
    val model: DocumentModel,
    val document: MarkdownDocument,
    val onExternal: (String) -> Unit,
    val labels: Labels,
) {
    fun kind(id: Int): MarkdownContentKind = document.nodes[id].content.kind

    fun children(id: Int): List<Int> = document.nodes[id].children.map(Long::toInt)

    fun activate(id: Int) {
        model.activateLink(id)?.let(onExternal)
    }
}

@Composable
private fun Block(context: Context, id: Int) {
    val node = context.document.nodes[id]
    val colors = Air.colors
    when (node.content.kind) {
        MarkdownContentKind.Paragraph -> Inline(context, context.children(id))
        MarkdownContentKind.Heading -> Inline(context, context.children(id), headingStyle(node.content.level))
        MarkdownContentKind.Quote -> Row(modifier = Modifier.height(IntrinsicSize.Min)) {
            Box(modifier = Modifier.width(2.dp).fillMaxHeight().background(colors.textTertiary))
            Box(modifier = Modifier.padding(start = 12.dp)) { Children(context, context.children(id)) }
        }
        MarkdownContentKind.CodeBlock -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            node.content.language?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = AirType.footnote, color = colors.textSecondary)
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.surfaceSecondary)
                    .horizontalScroll(rememberScrollState())
                    .padding(12.dp),
            ) {
                Text(
                    inline(context, context.children(id)),
                    style = AirType.body.copy(fontFamily = FontFamily.Monospace, color = colors.text),
                    softWrap = false,
                )
            }
        }
        MarkdownContentKind.KindList -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            context.children(id).forEachIndexed { index, item ->
                val task = task(context, item)
                val checked = task?.let { context.document.nodes[it].content.checked == true } ?: false
                Row(
                    modifier = if (task != null) {
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .toggleable(checked, role = Role.Checkbox) { context.model.toggleTask(task) }
                            .testTag(markdownTaskTag(task))
                    } else {
                        Modifier
                    },
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (task != null) {
                        Box(
                            modifier = Modifier.size(32.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                if (checked) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked,
                                contentDescription = null,
                                tint = colors.accent,
                                modifier = Modifier.size(22.dp),
                            )
                        }
                    } else {
                        val marker = node.content.first?.let { "${it + index}." } ?: "•"
                        Text(
                            marker,
                            style = AirType.body,
                            color = colors.textSecondary,
                            modifier = Modifier.widthIn(min = 24.dp).padding(top = 1.dp),
                        )
                    }
                    Box(modifier = Modifier.weight(1f).padding(top = if (task != null) 4.dp else 0.dp)) {
                        Block(context, item)
                    }
                }
            }
        }
        MarkdownContentKind.Item -> Children(context, context.children(id))
        MarkdownContentKind.Table -> Box(modifier = Modifier.horizontalScroll(rememberScrollState())) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                context.children(id).forEach { row ->
                    val head = context.kind(row) == MarkdownContentKind.TableHead
                    Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                        context.children(row).forEachIndexed { column, cell ->
                            val alignment = node.content.alignments?.getOrNull(column)
                            Text(
                                inline(context, context.children(cell)),
                                style = AirType.body.copy(
                                    fontWeight = if (head) FontWeight.SemiBold else FontWeight.Normal,
                                    color = colors.text,
                                    textAlign = when (alignment) {
                                        MarkdownAlignment.Center -> androidx.compose.ui.text.style.TextAlign.Center
                                        MarkdownAlignment.Right -> androidx.compose.ui.text.style.TextAlign.End
                                        else -> androidx.compose.ui.text.style.TextAlign.Start
                                    },
                                ),
                                modifier = Modifier.widthIn(min = 48.dp),
                            )
                        }
                    }
                }
            }
        }
        MarkdownContentKind.Rule -> HorizontalDivider(color = colors.separator)
        MarkdownContentKind.Task -> Unit
        else -> Inline(context, listOf(id))
    }
}

/** Children of a quote or an item: runs of inline content between their blocks. */
@Composable
private fun Children(context: Context, ids: List<Int>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        var run = mutableListOf<Int>()
        val groups = mutableListOf<Pair<Boolean, List<Int>>>()
        ids.filter { context.kind(it) != MarkdownContentKind.Task }.forEach { id ->
            if (context.kind(id) in BLOCKS) {
                if (run.isNotEmpty()) groups += true to run
                run = mutableListOf()
                groups += false to listOf(id)
            } else {
                run += id
            }
        }
        if (run.isNotEmpty()) groups += true to run
        groups.forEach { (inline, group) -> if (inline) Inline(context, group) else Block(context, group.single()) }
    }
}

/** A run of inline content: text, with the vault's images in their own places between it. */
@Composable
private fun Inline(context: Context, ids: List<Int>, style: TextStyle = AirType.body) {
    val links = TextLinkStyles(SpanStyle(color = Air.colors.accent))
    val segments = segments(context, ids, links, Air.colors.surfaceSecondary)
    val textStyle = style.copy(color = Air.colors.text)
    val single = segments.singleOrNull()?.text
    if (single != null) {
        Text(single, style = textStyle, modifier = Modifier.fillMaxWidth())
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        segments.forEach { segment ->
            val text = segment.text
            val image = segment.image
            if (text != null) {
                Text(text, style = textStyle, modifier = Modifier.fillMaxWidth())
            } else if (image != null) {
                MarkdownImage(context, image, segment.activation)
            }
        }
    }
}

/** Text, or an image of the vault with the link a tap on it follows. */
private class Segment(val text: AnnotatedString? = null, val image: Int? = null, val activation: Int? = null)

private fun segments(
    context: Context,
    ids: List<Int>,
    links: TextLinkStyles,
    code: androidx.compose.ui.graphics.Color,
): List<Segment> {
    val result = mutableListOf<Segment>()
    fun add(part: Segment) {
        val last = result.lastOrNull()?.text
        val text = part.text
        if (text != null && last != null) result[result.lastIndex] = Segment(last + text) else result += part
    }
    for (id in ids) {
        val content = context.document.nodes[id].content
        val blocked = content.target?.kind == MarkdownTargetKind.Blocked
        when (content.kind) {
            MarkdownContentKind.Image ->
                if (content.target?.kind.let { it == MarkdownTargetKind.Catalog || it == MarkdownTargetKind.Note }) {
                    add(Segment(image = id, activation = id))
                } else {
                    add(Segment(buildAnnotatedString { append(context, listOf(id), links, code) }))
                }
            MarkdownContentKind.Emphasis,
            MarkdownContentKind.Strong,
            MarkdownContentKind.Strikethrough,
            MarkdownContentKind.Link,
            -> segments(context, context.children(id), links, code).forEach { part ->
                val text = part.text
                when {
                    text != null -> add(Segment(decorate(context, id, text, links)))
                    content.kind == MarkdownContentKind.Link ->
                        add(Segment(image = part.image, activation = if (blocked) null else id))
                    else -> add(part)
                }
            }
            else -> add(Segment(buildAnnotatedString { append(context, listOf(id), links, code) }))
        }
    }
    return result
}

private fun decorate(context: Context, id: Int, text: AnnotatedString, links: TextLinkStyles): AnnotatedString {
    val content = context.document.nodes[id].content
    return buildAnnotatedString {
        when (content.kind) {
            MarkdownContentKind.Emphasis -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(text) }
            MarkdownContentKind.Strong -> withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(text) }
            MarkdownContentKind.Strikethrough ->
                withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) { append(text) }
            MarkdownContentKind.Link ->
                if (content.target?.kind == MarkdownTargetKind.Blocked) {
                    append(text)
                } else {
                    withLink(LinkAnnotation.Clickable("link:$id", links) { context.activate(id) }) { append(text) }
                }
            else -> append(text)
        }
    }
}

/**
 * An image of the vault inside the note: resolved and read while its place is
 * on screen, released when it leaves. A tap opens it, or the link around it.
 */
@Composable
private fun MarkdownImage(context: Context, node: Int, activation: Int?) {
    val digest = context.document.sourceDigest
    var image by remember(node, digest) { mutableStateOf<MarkdownImageModel?>(null) }
    DisposableEffect(context.model, node, digest) {
        image = context.model.inlineImage(node, digest)
        onDispose { context.model.releaseInlineImage(node, digest) }
    }
    val alt = buildAnnotatedString {
        append(context, context.children(node), TextLinkStyles(), androidx.compose.ui.graphics.Color.Unspecified)
    }.text
    val label = alt.ifBlank { context.labels.image }
    Box(modifier = Modifier.fillMaxWidth().testTag(markdownImageTag(node))) {
        val model = image
        if (model == null) {
            ImageLoading()
        } else {
            val state by model.state.collectAsStateWithLifecycle()
            val preview = state.preview
            when {
                preview != null -> ImagePreview(preview, label) { activation?.let(context::activate) }
                state.unavailable -> ImageUnavailable(label, context.labels.unavailable, onRetry = model::load)
                else -> ImageLoading()
            }
        }
    }
}

@Composable
private fun ImagePreview(preview: ImagePreviewModel, label: String, onOpen: () -> Unit) {
    val state by preview.state.collectAsStateWithLifecycle()
    val bitmap = state.image
    when {
        bitmap != null -> Image(
            bitmap.asImageBitmap(),
            contentDescription = label,
            contentScale = ContentScale.Fit,
            alignment = Alignment.TopStart,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 360.dp)
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClickLabel = label, onClick = onOpen),
        )
        state.status == ImagePreviewModel.Status.FAILED ->
            ImageUnavailable(label, stringResource(R.string.doc_image_unavailable), onRetry = { preview.load() })
        else -> ImageLoading()
    }
}

@Composable
private fun ImageUnavailable(label: String, issue: String, onRetry: () -> Unit) {
    val colors = Air.colors
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(
                Icons.Outlined.Image,
                contentDescription = null,
                tint = colors.textSecondary,
                modifier = Modifier.size(20.dp),
            )
            Text(label, style = AirType.body, color = colors.text)
        }
        Text(issue, style = AirType.footnote, color = colors.textSecondary)
        LinkButton(stringResource(R.string.media_try_again), onClick = onRetry)
    }
}

@Composable
private fun ImageLoading() {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
    ) {
        CircularProgressIndicator(color = Air.colors.accent, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        Text(
            stringResource(R.string.media_loading_image),
            style = AirType.subheadline,
            color = Air.colors.textSecondary,
        )
    }
}

@Composable
private fun inline(context: Context, ids: List<Int>): AnnotatedString {
    val accent = Air.colors.accent
    val code = Air.colors.surfaceSecondary
    val links = TextLinkStyles(SpanStyle(color = accent))
    return buildAnnotatedString { append(context, ids, links, code) }
}

private fun AnnotatedString.Builder.append(
    context: Context,
    ids: List<Int>,
    links: TextLinkStyles,
    code: androidx.compose.ui.graphics.Color,
) {
    for (id in ids) {
        val content = context.document.nodes[id].content
        val children = context.children(id)
        when (content.kind) {
            MarkdownContentKind.SoftBreak -> append(" ")
            MarkdownContentKind.HardBreak -> append("\n")
            MarkdownContentKind.Task -> Unit
            MarkdownContentKind.Image -> {
                append(context.labels.image + ": ")
                if (content.target?.kind == MarkdownTargetKind.Blocked) {
                    append(context, children, links, code)
                    append(" — " + context.labels.unavailable)
                } else {
                    withLink(LinkAnnotation.Clickable("image:$id", links) { context.activate(id) }) {
                        append(context, children, links, code)
                    }
                }
            }
            MarkdownContentKind.Emphasis -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                append(context, children, links, code)
            }
            MarkdownContentKind.Strong -> withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
                append(context, children, links, code)
            }
            MarkdownContentKind.Strikethrough -> withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) {
                append(context, children, links, code)
            }
            MarkdownContentKind.Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = code)) {
                append(content.text.orEmpty())
            }
            MarkdownContentKind.Link ->
                if (content.target?.kind == MarkdownTargetKind.Blocked) {
                    append(context, children, links, code)
                } else {
                    withLink(LinkAnnotation.Clickable("link:$id", links) { context.activate(id) }) {
                        append(context, children, links, code)
                    }
                }
            else -> content.text?.let(::append) ?: append(context, children, links, code)
        }
    }
}

/** The task box of a list item: its first child, or the first child of its first paragraph. */
private fun task(context: Context, item: Int): Int? {
    val first = context.children(item).firstOrNull() ?: return null
    return when (context.kind(first)) {
        MarkdownContentKind.Task -> first
        MarkdownContentKind.Paragraph ->
            context.children(first).firstOrNull { context.kind(it) == MarkdownContentKind.Task }
        else -> null
    }
}

/** For each node, the root block it belongs to, so a heading deep in a list can be scrolled to. */
private fun rootOwners(document: MarkdownDocument): Map<Int, Int> {
    val owners = mutableMapOf<Int, Int>()
    fun visit(id: Int, root: Int) {
        owners[id] = root
        document.nodes[id].children.forEach { visit(it.toInt(), root) }
    }
    document.roots.forEach { visit(it.toInt(), it.toInt()) }
    return owners
}

private fun headingStyle(level: Long?): TextStyle = when (level) {
    1L -> AirType.title
    2L -> AirType.title2
    3L -> AirType.title3
    else -> AirType.headline
}.copy(fontWeight = FontWeight.SemiBold)

private val BLOCKS = setOf(
    MarkdownContentKind.Paragraph,
    MarkdownContentKind.Heading,
    MarkdownContentKind.Quote,
    MarkdownContentKind.CodeBlock,
    MarkdownContentKind.KindList,
    MarkdownContentKind.Item,
    MarkdownContentKind.Table,
    MarkdownContentKind.TableHead,
    MarkdownContentKind.TableRow,
    MarkdownContentKind.TableCell,
    MarkdownContentKind.Rule,
)
