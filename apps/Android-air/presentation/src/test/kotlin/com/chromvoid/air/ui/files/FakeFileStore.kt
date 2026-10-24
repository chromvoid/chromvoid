package com.chromvoid.air.ui.files

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.CatalogDocumentLinkKind
import com.chromvoid.air.bridge.wire.CatalogDocumentLinkResponse
import com.chromvoid.air.bridge.wire.CatalogDocumentLinkResponseKind
import com.chromvoid.air.bridge.wire.CatalogFileLinkItem
import com.chromvoid.air.bridge.wire.CatalogFolderFilterCounts
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.bridge.wire.CatalogFolderPageResponse
import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.bridge.wire.SourceMetadataResponse
import com.chromvoid.air.bridge.wire.UploadResponse

/**
 * An in-memory catalog that answers as Core does: folders first, names
 * compared without case, hidden items only on request, a recursive Markdown
 * search for Notes, pages that refuse a stale version, and the refusal codes
 * Core uses for a taken name or a missing item.
 */
internal class FakeFileStore : FileStore {
    data class Node(
        val id: Long,
        var name: String,
        var parent: String,
        val isDir: Boolean,
        val size: Long = 0,
        val mimeType: String? = null,
        val content: ByteArray = ByteArray(size.toInt()) { (it % 251).toByte() },
    )

    val nodes = mutableListOf<Node>()
    val pageRequests = mutableListOf<CatalogFolderPageRequest>()
    val calls = mutableListOf<String>()

    /** Bumped by every write, as Core bumps a folder's version. */
    var version = 1L

    /** Thrown by the next call of any kind, once. */
    var failNext: Throwable? = null

    /** Refusal codes a move or delete of that node answers with. */
    val refusals = mutableMapOf<Long, String>()

    /** Thrown by a move or delete of that node: an outcome Core never confirmed. */
    val breaks = mutableMapOf<Long, Throwable>()

    /** Runs as each write arrives, before it is answered. */
    var onWrite: ((String) -> Unit)? = null

    private var nextId = 1L

    fun folder(name: String, parent: String = "/"): Node = add(Node(nextId++, name, parent, isDir = true))

    fun file(name: String, parent: String = "/", size: Long = 12, mimeType: String? = null): Node =
        add(Node(nextId++, name, parent, isDir = false, size = size, mimeType = mimeType))

    fun file(name: String, content: ByteArray, parent: String = "/", mimeType: String? = null): Node =
        add(Node(nextId++, name, parent, false, content.size.toLong(), mimeType, content))

    /** Imports that failed with a Core refusal, by the file name they asked for. */
    val importRefusals = mutableMapOf<String, String>()

    override var documentByteLimit: Long = 64

    fun path(node: Node): String = if (node.parent == "/") "/${node.name}" else "${node.parent}/${node.name}"

    fun item(node: Node): CatalogListItem = CatalogListItem(
        createdAt = 0,
        isDir = node.isDir,
        mediaInspectedRevision = 0,
        mimeType = node.mimeType,
        name = node.name,
        nodeID = node.id,
        parentPath = node.parent,
        path = path(node),
        size = if (node.isDir) null else node.size,
        sourceRevision = 1,
        updatedAt = 0,
    )

    fun named(name: String): Node = nodes.first { it.name == name }

    override suspend fun filePage(request: CatalogFolderPageRequest, generation: ULong): CatalogFolderPageResponse {
        pageRequests += request
        consumeFailure()
        val path = request.path ?: "/"
        val filter = request.filter
        val expected = request.expectedVersion
        val offset = request.offset ?: 0
        val limit = request.limit ?: FILE_PAGE_SIZE
        if (expected != null && expected != version) {
            return CatalogFolderPageResponse(
                currentPath = path,
                filterCounts = CatalogFolderFilterCounts(0, 0, 0),
                items = emptyList(),
                limit = limit,
                offset = offset,
                reloadRequired = true,
                totalCount = 0,
                version = version,
            )
        }
        var candidates = if (filter?.recursive == true) {
            nodes.filter { path == "/" || it.parent == path || it.parent.startsWith("$path/") }
        } else {
            nodes.filter { it.parent == path }
        }
        if (filter?.fileTypes.orEmpty().contains("markdown")) {
            candidates = candidates.filter { !it.isDir && it.name.endsWith(".md") }
        }
        if (filter?.includeHidden != true) candidates = candidates.filterNot { it.name.startsWith(".") }
        val query = filter?.query.orEmpty()
        if (query.isNotBlank()) candidates = candidates.filter { it.name.contains(query, ignoreCase = true) }
        val by = request.sort?.by ?: "name"
        val order = compareByDescending<Node> { it.isDir }.then(
            when (by) {
                "size" -> compareBy { it.size }
                else -> compareBy { it.name.lowercase() }
            },
        )
        var sorted = candidates.sortedWith(order)
        if (request.sort?.direction == "desc") {
            sorted = sorted.filter { it.isDir }.reversed() + sorted.filterNot { it.isDir }.reversed()
        }
        val page = sorted.drop(offset.toInt()).take(limit.toInt())
        val next = (offset + page.size).takeIf { it < sorted.size }
        return CatalogFolderPageResponse(
            currentPath = path,
            filterCounts = CatalogFolderFilterCounts(0, 0, 0),
            items = page.map(::item),
            limit = limit,
            nextOffset = next,
            offset = offset,
            reloadRequired = false,
            totalCount = sorted.size.toLong(),
            version = version,
        )
    }

    override suspend fun createFolder(name: String, parent: String, generation: ULong) {
        calls += "create:$parent:$name"
        consumeFailure()
        if (nodes.any { it.parent == parent && it.name == name }) throw CoreRefusal("NAME_EXIST", "catalog:createDir")
        folder(name, parent)
        version++
    }

    override suspend fun renameFile(id: Long, name: String, generation: ULong) {
        calls += "rename:$id:$name"
        consumeFailure()
        val node = nodes.firstOrNull { it.id == id } ?: throw CoreRefusal("NODE_NOT_FOUND", "catalog:rename")
        if (nodes.any { it.parent == node.parent && it.name == name && it.id != id }) {
            throw CoreRefusal("NAME_EXIST", "catalog:rename")
        }
        val before = path(node)
        node.name = name
        reparent(before, path(node))
        version++
    }

    override suspend fun moveFile(id: Long, parent: String, generation: ULong) {
        calls += "move:$id:$parent"
        onWrite?.invoke("move:$id:$parent")
        consumeFailure()
        breaks[id]?.let { throw it }
        refusals[id]?.let { throw CoreRefusal(it, "catalog:move") }
        val node = nodes.firstOrNull { it.id == id } ?: throw CoreRefusal("NODE_NOT_FOUND", "catalog:move")
        val before = path(node)
        node.parent = parent
        reparent(before, path(node))
        version++
    }

    override suspend fun deleteFile(id: Long, generation: ULong) {
        calls += "delete:$id"
        onWrite?.invoke("delete:$id")
        consumeFailure()
        breaks[id]?.let { throw it }
        refusals[id]?.let { throw CoreRefusal(it, "catalog:delete") }
        val node = nodes.firstOrNull { it.id == id } ?: throw CoreRefusal("NODE_NOT_FOUND", "catalog:delete")
        val path = path(node)
        nodes.removeAll { it.id == id || it.parent == path || it.parent.startsWith("$path/") }
        version++
    }

    override suspend fun fileInfo(id: Long, generation: ULong): SourceMetadataResponse {
        calls += "info:$id"
        consumeFailure()
        val node = nodes.firstOrNull { it.id == id } ?: throw CoreRefusal("NODE_NOT_FOUND", "catalog:source:metadata")
        return SourceMetadataResponse(
            mediaInspectedRevision = 0,
            mimeType = node.mimeType,
            name = node.name,
            nodeID = node.id,
            nodeType = if (node.isDir) 1 else 0,
            size = node.size,
            sourceRevision = 1,
        )
    }

    override suspend fun importFile(
        source: FileSource,
        parent: String,
        generation: ULong,
        progress: (Long, Long) -> Unit,
    ): UploadResponse {
        try {
            val info = source.open()
            calls += "import:$parent:${info.name}"
            consumeFailure()
            importRefusals[info.name]?.let { throw CoreRefusal(it, "catalog:file:finish") }
            if (nodes.any { it.parent == parent && it.name == info.name }) {
                throw CoreRefusal("NAME_EXIST", "catalog:file:finish")
            }
            val bytes = java.io.ByteArrayOutputStream()
            while (true) {
                val chunk = source.read(4)
                if (chunk.isEmpty()) break
                bytes.write(chunk)
                progress(bytes.size().toLong(), info.size)
            }
            val node = file(info.name, bytes.toByteArray(), parent, info.mimeType)
            version++
            return UploadResponse(completed = true, created = true, nodeID = node.id, uploadedBytes = node.size)
        } finally {
            source.close()
        }
    }

    /** Runs as an attachment's bytes arrive, before it is answered. */
    var onAttachment: ((String) -> Unit)? = null

    override suspend fun importAttachment(
        source: FileSource,
        folder: String,
        generation: ULong,
        progress: (Long, Long) -> Unit,
    ): String {
        try {
            // A real import suspends on the writer; a stop lands here.
            kotlinx.coroutines.yield()
            val info = source.open()
            calls += "attachment:$folder:${info.name}"
            consumeFailure()
            if (info.mimeType?.startsWith("image/") != true) {
                throw CoreRefusal("INVALID_INPUT", "catalog:attachment:prepare")
            }
            val bytes = java.io.ByteArrayOutputStream()
            while (true) {
                val chunk = source.read(4)
                if (chunk.isEmpty()) break
                bytes.write(chunk)
                progress(bytes.size().toLong(), info.size)
            }
            onAttachment?.invoke(info.name)
            val name = "${info.name.substringBeforeLast('.')}-${nextId}.${info.name.substringAfterLast('.', "png")}"
            file(name, bytes.toByteArray(), folder, info.mimeType)
            version++
            return "![${info.name.substringBeforeLast('.')}]($folder/$name)"
        } finally {
            source.close()
        }
    }

    override suspend fun createNote(name: String, text: String, parent: String, generation: ULong): UploadResponse {
        calls += "note:$parent:$name"
        consumeFailure()
        if (nodes.any { it.parent == parent && it.name == name }) throw CoreRefusal("NAME_EXIST", "catalog:file:finish")
        val node = file(name, text.encodeToByteArray(), parent, "text/markdown")
        version++
        return UploadResponse(completed = true, created = true, nodeID = node.id, uploadedBytes = node.size)
    }

    /** Derivatives Core has stored, by node id. */
    val derivatives = mutableMapOf<Long, ByteArray>()
    val derivativeRequests = mutableListOf<String>()

    override suspend fun readFile(
        id: Long,
        generation: ULong,
        maximumBytes: Long,
        head: (ByteArray) -> Unit,
    ): FileContent {
        calls += "read:$id"
        consumeFailure()
        val node = nodes.firstOrNull { it.id == id } ?: throw CoreRefusal("NODE_NOT_FOUND", "catalog:file:read")
        if (node.size > maximumBytes) throw FileTooLarge()
        if (node.content.size > HEAD_BYTES) head(node.content.copyOf(HEAD_BYTES))
        return FileContent(fileInfo(id, generation), node.content.copyOf())
    }

    /** Link paths the fake resolves, to the node they name; others are missing. */
    val links = mutableMapOf<String, Long>()

    /** Revisions of text documents, bumped by every save; a save naming another is stale. */
    val revisions = mutableMapOf<Long, Long>()

    override suspend fun readDocument(id: Long, generation: ULong): OpenedDocument {
        calls += "document:$id"
        consumeFailure()
        val node = nodes.firstOrNull { it.id == id } ?: throw CoreRefusal("NODE_NOT_FOUND", "catalog:file:read")
        if (node.size > documentByteLimit) throw FileTooLarge()
        val text = node.content.decodeToString()
        if (text.contains('\u0000')) throw NotText()
        return OpenedDocument(id, revisions.getOrPut(id) { 1 }, node.name, text, node.mimeType)
    }

    override suspend fun saveDocument(id: Long, sourceRevision: Long, text: String, generation: ULong): Long {
        calls += "save:$id:$sourceRevision"
        consumeFailure()
        val current = revisions.getOrPut(id) { 1 }
        if (current != sourceRevision) throw CoreRefusal("ERR_STALE_SOURCE", "catalog:document:save")
        val index = nodes.indexOfFirst { it.id == id }
        val bytes = text.encodeToByteArray()
        nodes[index] = nodes[index].copy(content = bytes, size = bytes.size.toLong())
        revisions[id] = current + 1
        return current + 1
    }

    /** Another client saved the document meanwhile. */
    fun saveElsewhere(id: Long, text: String) {
        val index = nodes.indexOfFirst { it.id == id }
        val bytes = text.encodeToByteArray()
        nodes[index] = nodes[index].copy(content = bytes, size = bytes.size.toLong())
        revisions[id] = revisions.getOrPut(id) { 1 } + 1
    }

    override suspend fun resolveLink(
        sourceId: Long,
        path: String,
        kind: CatalogDocumentLinkKind,
        generation: ULong,
    ): CatalogDocumentLinkResponse {
        calls += "link:$path"
        consumeFailure()
        val id = links[path] ?: return CatalogDocumentLinkResponse(kind = CatalogDocumentLinkResponseKind.Missing)
        val node = nodes.first { it.id == id }
        return CatalogDocumentLinkResponse(
            item = CatalogFileLinkItem(0, node.mimeType, node.name, node.id, node.parent, path(node), node.size, 1, 0),
            kind = CatalogDocumentLinkResponseKind.Found,
        )
    }

    /** Readers opened, and how many are still open. */
    var readersOpened = 0
    var readersOpen = 0

    override fun openReader(id: Long, generation: ULong): FileReader {
        calls += "reader:$id"
        consumeFailure()
        val node = nodes.firstOrNull { it.id == id } ?: throw CoreRefusal("NODE_NOT_FOUND", "catalog:file:read")
        readersOpened++
        readersOpen++
        var open = true
        return object : FileReader {
            override val maximumChunkBytes: Long = READER_CHUNK_BYTES

            override suspend fun read(offset: Long, length: Long): FileContent {
                check(open) { "the reader was cancelled" }
                consumeFailure()
                val end = minOf(node.content.size.toLong(), offset + minOf(length, READER_CHUNK_BYTES)).toInt()
                return FileContent(fileInfo(id, generation), node.content.copyOfRange(offset.toInt(), end))
            }

            override fun cancel() {
                if (open) readersOpen--
                open = false
            }
        }
    }

    override suspend fun readHead(id: Long, generation: ULong): ByteArray {
        calls += "head:$id"
        consumeFailure()
        val node = nodes.first { it.id == id }
        return node.content.copyOf(minOf(HEAD_BYTES, node.content.size))
    }

    override suspend fun derivative(
        id: Long,
        sourceRevision: Long,
        tier: DerivativeTier,
        ensure: Boolean,
        generation: ULong,
    ): ByteArray {
        derivativeRequests += "${tier.wire}:$id:$ensure"
        consumeFailure()
        derivatives[id]?.let { return it.copyOf() }
        if (!ensure) throw CoreRefusal("NODE_NOT_FOUND", "catalog:derivative")
        val node = nodes.first { it.id == id }
        return node.content.copyOf().also { derivatives[id] = it }
    }

    override suspend fun exportFile(
        id: Long,
        destination: FileDestination,
        generation: ULong,
        progress: (Long, Long) -> Unit,
    ): SourceMetadataResponse {
        calls += "export:$id"
        try {
            consumeFailure()
            val metadata = fileInfo(id, generation)
            val node = nodes.first { it.id == id }
            node.content.toList().chunked(4).forEachIndexed { index, chunk ->
                destination.write(chunk.toByteArray())
                progress(minOf((index + 1) * 4L, node.size), node.size)
            }
            destination.finish()
            return metadata
        } catch (error: Throwable) {
            destination.abandon()
            throw error
        }
    }

    private companion object {
        const val HEAD_BYTES = 8
        const val READER_CHUNK_BYTES = 5L
    }

    private fun add(node: Node): Node {
        nodes += node
        return node
    }

    private fun reparent(before: String, after: String) {
        nodes.filter { it.parent == before || it.parent.startsWith("$before/") }
            .forEach { it.parent = after + it.parent.removePrefix(before) }
    }

    private fun consumeFailure() {
        failNext?.let {
            failNext = null
            throw it
        }
    }
}
