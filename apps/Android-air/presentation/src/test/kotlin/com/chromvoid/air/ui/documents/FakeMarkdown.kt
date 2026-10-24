package com.chromvoid.air.ui.documents

import com.chromvoid.air.bridge.wire.MarkdownContent
import com.chromvoid.air.bridge.wire.MarkdownContentKind
import com.chromvoid.air.bridge.wire.MarkdownDocument
import com.chromvoid.air.bridge.wire.MarkdownNode
import com.chromvoid.air.bridge.wire.MarkdownTarget
import com.chromvoid.air.bridge.wire.MarkdownTargetKind

/**
 * A line-based stand-in for Core's Markdown parser: `# ` headings with an
 * anchor, `- [ ] ` tasks, one `[label](target)` link or `![alt](/path)`
 * image per line and plain paragraphs. Targets starting `http` are external, `#` anchors, `note:`
 * notes, anything else a catalog path with an optional `#anchor`.
 */
internal class FakeMarkdown {
    /** Every source parsed, in order. */
    val parsed = mutableListOf<String>()

    fun parse(source: String): MarkdownDocument {
        parsed += source
        val nodes = mutableListOf<MarkdownNode>()
        val roots = mutableListOf<Long>()
        fun add(kind: MarkdownContentKind, start: Int, content: MarkdownContent = MarkdownContent(kind)): Int {
            nodes += MarkdownNode(emptyList(), content, start.toLong(), start.toLong())
            return nodes.lastIndex
        }
        fun adopt(parent: Int, vararg children: Int) {
            nodes[parent] = nodes[parent].copy(children = nodes[parent].children + children.map(Int::toLong))
        }
        fun text(value: String, start: Int): Int =
            add(MarkdownContentKind.Text, start, MarkdownContent(MarkdownContentKind.Text, text = value))

        var offset = 0
        for (line in source.split('\n')) {
            val start = offset
            offset += line.length + 1
            when {
                line.isBlank() -> Unit
                line.startsWith("# ") -> {
                    val title = line.removePrefix("# ")
                    val heading = add(
                        MarkdownContentKind.Heading,
                        start,
                        MarkdownContent(MarkdownContentKind.Heading, level = 1, anchor = slug(title)),
                    )
                    roots += heading.toLong()
                    adopt(heading, text(title, start + 2))
                }
                line.startsWith("- [ ] ") || line.startsWith("- [x] ") -> {
                    val list = add(MarkdownContentKind.KindList, start)
                    roots += list.toLong()
                    val item = add(MarkdownContentKind.Item, start)
                    adopt(list, item)
                    val task = add(
                        MarkdownContentKind.Task,
                        start + 2,
                        MarkdownContent(MarkdownContentKind.Task, checked = line[3] == 'x'),
                    )
                    val paragraph = add(MarkdownContentKind.Paragraph, start + 6)
                    adopt(paragraph, text(line.substring(6), start + 6))
                    adopt(item, task, paragraph)
                }
                else -> {
                    val paragraph = add(MarkdownContentKind.Paragraph, start)
                    roots += paragraph.toLong()
                    val link = LINK.find(line)
                    if (link == null) {
                        adopt(paragraph, text(line, start))
                    } else {
                        val (bang, label, target) = link.destructured
                        val kind = if (bang.isEmpty()) MarkdownContentKind.Link else MarkdownContentKind.Image
                        val node = add(
                            kind,
                            start + link.range.first,
                            MarkdownContent(kind, target = target(target)),
                        )
                        adopt(node, text(label, start + link.range.first + 1))
                        val before = line.substring(0, link.range.first)
                        val after = line.substring(link.range.last + 1)
                        if (before.isNotEmpty()) adopt(paragraph, text(before, start))
                        adopt(paragraph, node)
                        if (after.isNotEmpty()) adopt(paragraph, text(after, start + link.range.last + 1))
                    }
                }
            }
        }
        return MarkdownDocument(nodes, roots, digest(source))
    }

    /** Ticks or clears the task whose marker starts at [marker], as Core's task editor does. */
    fun toggle(source: String, digest: String, marker: Long, checked: Boolean): String {
        check(digest == digest(source)) { "stale digest" }
        val at = marker.toInt()
        check(source.substring(at, at + 3) == if (checked) "[x]" else "[ ]")
        return source.substring(0, at) + (if (checked) "[ ]" else "[x]") + source.substring(at + 3)
    }

    fun digest(source: String): String = source.hashCode().toString()

    private fun target(value: String): MarkdownTarget = when {
        value.startsWith("http") -> MarkdownTarget(MarkdownTargetKind.External, url = value)
        value.startsWith("#") -> MarkdownTarget(MarkdownTargetKind.Anchor, anchor = value.drop(1))
        value.startsWith("note:") -> MarkdownTarget(MarkdownTargetKind.Note, path = value.removePrefix("note:"))
        value.startsWith("javascript:") -> MarkdownTarget(MarkdownTargetKind.Blocked, raw = value)
        else -> MarkdownTarget(
            MarkdownTargetKind.Catalog,
            path = value.substringBefore('#'),
            anchor = value.substringAfter('#', "").ifEmpty { null },
        )
    }

    private fun slug(title: String): String = title.lowercase().replace(' ', '-')

    private companion object {
        val LINK = Regex("""(!?)\[([^\]]*)]\(([^)]*)\)""")
    }
}
