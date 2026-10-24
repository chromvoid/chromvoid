package com.chromvoid.air.ui.media

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.RectF
import android.graphics.pdf.LoadParams
import android.graphics.pdf.PdfRenderer
import android.os.Build
import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import com.chromvoid.air.ui.files.FileChanged
import com.chromvoid.air.ui.files.FileStore
import com.chromvoid.air.ui.files.FileTooLarge
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import java.io.FileOutputStream
import java.io.IOException
import kotlin.math.roundToInt
import kotlin.math.sqrt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** A rectangle on a PDF page, in the page's points from its top left corner. */
public data class PdfRect(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    public fun contains(x: Float, y: Float): Boolean = x in left..right && y in top..bottom
}

/** A link on a PDF page: an address to open elsewhere, or another page of the same PDF. */
public sealed interface PdfLink {
    public val bounds: List<PdfRect>

    public data class External(val uri: String, override val bounds: List<PdfRect>) : PdfLink

    public data class Page(val index: Int, override val bounds: List<PdfRect>) : PdfLink
}

/** The visible page offset, in pixels at [zoom] times the fitted page width. */
public data class PdfViewport(val zoom: Float = 1f, val panX: Float = 0f, val panY: Float = 0f)

/** Content read from the PDF, without OCR or invented descriptions of scanned pages. */
public data class PdfPageContent(val text: String = "", val links: List<PdfLink> = emptyList())

/** An opened PDF that renders its pages one at a time. */
public interface PdfDocument {
    public val pageCount: Int

    /** Whether this device reads the PDF's text and links; Android does from Android 15. */
    public val readsText: Boolean

    /** The page's size in points. */
    public fun pageSize(index: Int): Pair<Int, Int>

    /** Only the visible rectangle, in pixels of the page drawn [pagePixelWidth] pixels wide. */
    public fun renderRegion(
        index: Int,
        pagePixelWidth: Int,
        left: Int,
        top: Int,
        width: Int,
        height: Int,
    ): Bitmap

    /** The page's text in reading order; empty for a scan or an older Android version. */
    public fun text(index: Int): String = ""

    /** Each place [query] appears on page [index], as the rectangles its lines cover. */
    public fun find(index: Int, query: String): List<List<PdfRect>>

    /** The links of page [index]. */
    public fun links(index: Int): List<PdfLink>

    public fun close()
}

/** The PDF asks for a password this device cannot pass on. */
public class PdfProtected : Exception("The PDF is protected")

/** The password did not open the PDF. */
public class PdfWrongPassword : Exception("The PDF password is incorrect")

/** This device cannot hold the PDF in a descriptor the renderer can seek in. */
public class PdfUnsupportedDevice : Exception("The PDF cannot be previewed on this device")

public class PdfDamaged(cause: Throwable?) : Exception("The PDF could not be opened", cause)

/**
 * A PDF on screen, as the iOS preview: read whole, bounded, then drawn page by
 * page. The platform renderer needs a descriptor it can seek in, so the bytes
 * go into an anonymous memory file - never to storage - and the array they
 * were read into is cleared. A password-protected PDF asks for its password
 * where the platform can take one.
 */
public class PdfPreviewModel(
    private val store: FileStore,
    public val nodeId: Long,
    private val generation: ULong,
    public val name: String,
    private val scope: CoroutineScope,
    private val open: (ByteArray, String?) -> PdfDocument = PlatformPdf::open,
    /** Where the renderer opens and draws, off the main thread. */
    private val background: CoroutineDispatcher = Dispatchers.IO,
) {
    public enum class Status { IDLE, LOADING, PASSWORD_REQUIRED, READY, FAILED, REVOKED }

    public enum class Issue { TOO_LARGE, DAMAGED, PROTECTED, DEVICE, WRONG_PASSWORD, CHANGED, FAILED }

    public data class State(
        val status: Status = Status.IDLE,
        val pageCount: Int = 0,
        /** Each page's width and height in points, for its place before it is drawn. */
        val pageSizes: List<Pair<Int, Int>> = emptyList(),
        val issue: Issue? = null,
        /** Find and links are offered: the device reads the PDF's text. */
        val readsText: Boolean = false,
        /** Find in PDF, while it is open. */
        val search: Search? = null,
        /** The page to bring on screen - a match found, a link followed - numbered so each request is new. */
        val pageRequest: PageRequest? = null,
        /** A link the preview does not follow was tapped, as iOS says. */
        val linkRefused: Boolean = false,
        /** Only one page is magnified at a time; all other pages remain fitted to their width. */
        val viewports: Map<Int, PdfViewport> = emptyMap(),
    ) {
        public fun viewport(index: Int): PdfViewport = viewports[index] ?: PdfViewport()
    }

    /** One place the query was found. */
    public data class Match(val page: Int, val rects: List<PdfRect>)

    public data class Search(
        val query: String = "",
        val matches: List<Match> = emptyList(),
        /** The match shown, or -1 before a search found one. */
        val current: Int = -1,
        val searching: Boolean = false,
        /** Whether [query] was searched for, so "no results" means something. */
        val searched: Boolean = false,
    )

    public data class PageRequest(val index: Int, val serial: Int)

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var document: PdfDocument? = null
    private var encrypted: ByteArray? = null
    private var work: Job? = null
    private var finding: Job? = null
    private var requests = 0

    // The renderer draws one page at a time; every call goes through this lock.
    private val rendering = Mutex()
    private data class FittedPage(val index: Int, val width: Int)

    private val fittedPages = LinkedHashMap<FittedPage, Bitmap>(MAXIMUM_CACHED_PAGES, 0.75f, true)
    private var fittedBytes = 0L

    public fun load(password: String? = null) {
        val current = mutableState.value
        if (current.status !in setOf(Status.IDLE, Status.FAILED, Status.PASSWORD_REQUIRED)) return
        mutableState.value = current.copy(status = Status.LOADING, issue = null)
        work = scope.launch { read(password) }
    }

    /** Fitted pages survive ordinary scrolling, bounded by both page count and bitmap bytes. */
    public suspend fun renderPage(index: Int, width: Int): Bitmap? = rendering.withLock {
        val current = mutableState.value
        if (current.status != Status.READY || width <= 0) return@withLock null
        val document = document ?: return@withLock null
        val (pageWidth, pageHeight) = current.pageSizes.getOrNull(index) ?: return@withLock null
        val key = FittedPage(index, width)
        fittedPages[key]?.let { return@withLock it }
        val height = (width.toFloat() * pageHeight / pageWidth.coerceAtLeast(1)).roundToInt().coerceAtLeast(1)
        val bitmap = render(document, index, width, 0, 0, width, height)
        fittedPages[key] = bitmap
        fittedBytes += bitmap.allocationByteCount
        val eldest = fittedPages.entries.iterator()
        while (fittedPages.size > MAXIMUM_CACHED_PAGES || fittedBytes > MAXIMUM_CACHE_BYTES) {
            fittedBytes -= eldest.next().value.allocationByteCount
            eldest.remove()
        }
        bitmap
    }

    /**
     * Re-renders the visible part at the requested zoom, without retaining a high-resolution page.
     * The pixel budget also bounds unusually large screen or accessibility-magnifier viewports.
     */
    public suspend fun renderRegion(
        index: Int,
        pagePixelWidth: Int,
        left: Int,
        top: Int,
        width: Int,
        height: Int,
    ): Bitmap? = rendering.withLock {
        if (mutableState.value.status != Status.READY) return@withLock null
        val document = document ?: return@withLock null
        if (index !in 0 until document.pageCount || pagePixelWidth <= 0 || width <= 0 || height <= 0 ||
            left < 0 || top < 0
        ) return@withLock null
        render(document, index, pagePixelWidth, left, top, width, height)
    }

    private suspend fun render(
        document: PdfDocument,
        index: Int,
        pagePixelWidth: Int,
        left: Int,
        top: Int,
        width: Int,
        height: Int,
    ): Bitmap {
        val reduction = minOf(
            1.0,
            sqrt(MAXIMUM_RENDER_PIXELS.toDouble() / (width.toDouble() * height)),
            MAXIMUM_BITMAP_EDGE.toDouble() / width,
            MAXIMUM_BITMAP_EDGE.toDouble() / height,
        )
        return withContext(background) {
            document.renderRegion(
                index,
                (pagePixelWidth * reduction).toInt().coerceAtLeast(1),
                (left * reduction).toInt(),
                (top * reduction).toInt(),
                (width * reduction).toInt().coerceAtLeast(1),
                (height * reduction).toInt().coerceAtLeast(1),
            )
        }
    }

    /** Text and individually actionable links for the page's accessibility nodes. */
    public suspend fun content(index: Int): PdfPageContent = rendering.withLock {
        if (mutableState.value.status != Status.READY) return@withLock PdfPageContent()
        val document = document ?: return@withLock PdfPageContent()
        if (!document.readsText || index !in 0 until document.pageCount) return@withLock PdfPageContent()
        withContext(background) { PdfPageContent(document.text(index), document.links(index)) }
    }

    /** Gesture deltas and centroid are local fitted-page pixels, including the scrolled-off part. */
    public fun transformPage(
        index: Int,
        zoomChange: Float,
        panX: Float,
        panY: Float,
        centroidX: Float,
        centroidY: Float,
        width: Float,
        height: Float,
        visibleTop: Float = 0f,
        visibleHeight: Float = height,
    ) {
        val current = mutableState.value
        if (current.status != Status.READY || index !in 0 until current.pageCount || width <= 0f || height <= 0f ||
            zoomChange <= 0f || !listOf(
                zoomChange, panX, panY, centroidX, centroidY, width, height, visibleTop, visibleHeight,
            ).all { it.isFinite() }
        ) return
        val top = visibleTop.coerceIn(0f, height)
        val shownHeight = visibleHeight.coerceIn(0f, height - top)
        if (shownHeight <= 0f) return
        val before = current.viewport(index)
        val zoom = (before.zoom * zoomChange).coerceIn(1f, MAXIMUM_ZOOM)
        if (zoom == 1f) {
            mutableState.value = current.copy(viewports = emptyMap())
            return
        }
        val ratio = zoom / before.zoom
        val minimumY = if (top == 0f) 0f else -top
        val viewport = PdfViewport(
            zoom,
            ((before.panX + centroidX) * ratio - centroidX - panX).coerceIn(0f, width * (zoom - 1f)),
            ((before.panY + centroidY) * ratio - centroidY - panY)
                .coerceIn(minimumY, height * zoom - top - shownHeight),
        )
        mutableState.value = current.copy(viewports = mapOf(index to viewport))
    }

    /** A second double tap always returns to the page fitted to the screen width. */
    public fun toggleZoom(
        index: Int,
        x: Float,
        y: Float,
        width: Float,
        height: Float,
        visibleTop: Float = 0f,
        visibleHeight: Float = height,
    ) {
        val current = mutableState.value
        if (current.viewport(index).zoom > 1f) {
            mutableState.value = current.copy(viewports = emptyMap())
            return
        }
        transformPage(
            index, DOUBLE_TAP_ZOOM,
            0f, 0f, x, y, width, height, visibleTop, visibleHeight,
        )
    }

    /** Buttons, search and document links share the same accessible page navigation. */
    public fun goToPage(index: Int) {
        val current = mutableState.value
        if (current.status != Status.READY || index !in 0 until current.pageCount) return
        mutableState.value = current.copy(pageRequest = request(index), viewports = emptyMap())
    }

    /** Find in PDF opens, as the magnifier in the bar opens it on iOS. */
    public fun startFind() {
        val current = mutableState.value
        if (current.status != Status.READY || !current.readsText || current.search != null) return
        mutableState.value = current.copy(search = Search())
    }

    /** Searches every page for [query]; the first match comes on screen. */
    public fun find(query: String) {
        val current = mutableState.value
        if (current.search == null) return
        finding?.cancel()
        val text = query.trim()
        if (text.isEmpty()) {
            mutableState.value = current.copy(search = Search(query))
            return
        }
        mutableState.value = current.copy(search = Search(query, searching = true))
        finding = scope.launch {
            val matches = mutableListOf<Match>()
            for (page in 0 until current.pageCount) {
                // A page at a time, so the pages on screen keep drawing meanwhile.
                val found = rendering.withLock {
                    val opened = document ?: return@launch
                    withContext(background) { opened.find(page, text) }
                }
                found.forEach { rects -> matches += Match(page, rects) }
            }
            val after = mutableState.value
            if (after.search?.query != query) return@launch
            mutableState.value = after.copy(
                search = Search(query, matches, current = if (matches.isEmpty()) -1 else 0, searched = true),
                pageRequest = matches.firstOrNull()?.let { request(it.page) } ?: after.pageRequest,
                viewports = if (matches.isEmpty()) after.viewports else emptyMap(),
            )
        }
    }

    public fun nextMatch(): Unit = step(1)

    public fun previousMatch(): Unit = step(-1)

    public fun endFind() {
        finding?.cancel()
        mutableState.value = mutableState.value.copy(search = null)
    }

    /**
     * A tap at [x], [y] points on page [page]: another page of the PDF comes on screen; a web or
     * mail address is answered for the system to open, as iOS opens only those; any other link is
     * refused with iOS's words.
     */
    public suspend fun linkAt(page: Int, x: Float, y: Float): String? {
        if (mutableState.value.status != Status.READY || !mutableState.value.readsText) return null
        val links = rendering.withLock {
            val opened = document ?: return null
            if (page !in 0 until opened.pageCount) return null
            withContext(background) { opened.links(page) }
        }
        val link = links.firstOrNull { link -> link.bounds.any { it.contains(x, y) } } ?: return null
        return activateLink(link)
    }

    /** The coordinate tap and the link's TalkBack button use the same scheme and destination rules. */
    public fun activateLink(link: PdfLink): String? {
        val current = mutableState.value
        if (current.status != Status.READY || !current.readsText) return null
        return when (link) {
            is PdfLink.Page -> {
                goToPage(link.index)
                null
            }
            is PdfLink.External -> link.uri.takeIf { it.substringBefore(':').lowercase() in OPENED_SCHEMES }
                ?: run {
                    mutableState.value = current.copy(linkRefused = true)
                    null
                }
        }
    }

    public fun dismissLinkRefusal() {
        mutableState.value = mutableState.value.copy(linkRefused = false)
    }

    private fun step(by: Int) {
        val current = mutableState.value
        val search = current.search ?: return
        if (search.matches.isEmpty()) return
        val next = Math.floorMod(search.current + by, search.matches.size)
        mutableState.value = current.copy(
            search = search.copy(current = next),
            pageRequest = request(search.matches[next].page),
            viewports = emptyMap(),
        )
    }

    private fun request(index: Int): PageRequest = PageRequest(index, ++requests)

    /** The preview left the screen or the session ended: nothing drawn or read stays. */
    public fun close() {
        work?.cancel()
        finding?.cancel()
        clearEncrypted()
        scope.launch {
            rendering.withLock {
                fittedPages.clear()
                fittedBytes = 0
                document?.close()
                document = null
            }
        }
        mutableState.value = State(Status.REVOKED)
    }

    private suspend fun read(password: String?) {
        var bytes = encrypted
        try {
            if (bytes == null) {
                bytes = store.readFile(nodeId, generation, MAXIMUM_SOURCE_BYTES).bytes
            }
            val opened = withContext(background) { open(bytes, password) }
            if (mutableState.value.status != Status.LOADING) {
                opened.close()
                return
            }
            clearEncrypted()
            bytes.fill(0)
            rendering.withLock { document = opened }
            mutableState.value = State(
                Status.READY,
                pageCount = opened.pageCount,
                pageSizes = (0 until opened.pageCount).map(opened::pageSize),
                readsText = opened.readsText,
            )
        } catch (cancellation: CancellationException) {
            if (bytes !== encrypted) bytes?.fill(0)
            throw cancellation
        } catch (error: Exception) {
            if (error.failureKind == FailureKind.REVOKED) {
                bytes?.fill(0)
                close()
                return
            }
            if (mutableState.value.status != Status.LOADING) return
            when (error) {
                // The bytes are kept, still encrypted by the PDF's own password, for the next try.
                is PdfWrongPassword, is PdfProtected ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                        encrypted = bytes
                        mutableState.value = State(
                            Status.PASSWORD_REQUIRED,
                            issue = if (error is PdfWrongPassword) Issue.WRONG_PASSWORD else null,
                        )
                        return
                    }
                else -> Unit
            }
            bytes?.fill(0)
            clearEncrypted()
            mutableState.value = State(
                Status.FAILED,
                issue = when (error) {
                    is FileTooLarge -> Issue.TOO_LARGE
                    is FileChanged -> Issue.CHANGED
                    is PdfProtected, is PdfWrongPassword -> Issue.PROTECTED
                    is PdfUnsupportedDevice -> Issue.DEVICE
                    is PdfDamaged -> Issue.DAMAGED
                    else -> Issue.FAILED
                },
            )
        }
    }

    private fun clearEncrypted() {
        encrypted?.fill(0)
        encrypted = null
    }

    public companion object {
        public const val MAXIMUM_SOURCE_BYTES: Long = 32L * 1024 * 1024
        public const val MAXIMUM_ZOOM: Float = 5f
        public const val MAXIMUM_RENDER_PIXELS: Long = 4L * 1024 * 1024
        private const val MAXIMUM_CACHED_PAGES = 8
        private const val MAXIMUM_CACHE_BYTES = 32L * 1024 * 1024
        private const val MAXIMUM_BITMAP_EDGE = 4_096
        private const val DOUBLE_TAP_ZOOM = 2.5f

        /** The links the preview opens, as iOS opens them; any other is refused. */
        private val OPENED_SCHEMES = setOf("https", "http", "mailto")

        public fun supports(name: String, mimeType: String?): Boolean =
            mimeType?.lowercase() == "application/pdf" || name.lowercase().endsWith(".pdf")
    }
}

/** The platform renderer over an anonymous memory file. */
public object PlatformPdf {
    private fun rect(bounds: RectF): PdfRect = PdfRect(bounds.left, bounds.top, bounds.right, bounds.bottom)

    public fun open(bytes: ByteArray, password: String?): PdfDocument {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) throw PdfUnsupportedDevice()
        val memory = Os.memfd_create("chromvoid-pdf", OsConstants.MFD_CLOEXEC)
        val descriptor = try {
            FileOutputStream(memory).use { it.write(bytes) }
            Os.lseek(memory, 0, OsConstants.SEEK_SET)
            ParcelFileDescriptor.dup(memory)
        } finally {
            runCatching { Os.close(memory) }
        }
        val renderer = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                val params = LoadParams.Builder().apply { if (password != null) setPassword(password) }.build()
                PdfRenderer(descriptor, params)
            } else {
                PdfRenderer(descriptor)
            }
        } catch (protected: SecurityException) {
            descriptor.close()
            throw if (password != null) PdfWrongPassword() else PdfProtected()
        } catch (error: IOException) {
            descriptor.close()
            throw PdfDamaged(error)
        } catch (error: RuntimeException) {
            descriptor.close()
            throw PdfDamaged(error)
        }
        if (renderer.pageCount == 0) {
            renderer.close()
            throw PdfDamaged(null)
        }
        return object : PdfDocument {
            override val pageCount: Int = renderer.pageCount

            override val readsText: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM

            override fun pageSize(index: Int): Pair<Int, Int> =
                renderer.openPage(index).use { it.width to it.height }

            override fun renderRegion(
                index: Int,
                pagePixelWidth: Int,
                left: Int,
                top: Int,
                width: Int,
                height: Int,
            ): Bitmap = renderer.openPage(index).use { page ->
                val scale = pagePixelWidth.toFloat() / page.width.coerceAtLeast(1)
                val transform = Matrix().apply {
                    setValues(floatArrayOf(scale, 0f, -left.toFloat(), 0f, scale, -top.toFloat(), 0f, 0f, 1f))
                }
                Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { bitmap ->
                    bitmap.eraseColor(Color.WHITE)
                    page.render(bitmap, null, transform, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                }
            }

            override fun text(index: Int): String {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return ""
                return renderer.openPage(index).use { page -> page.textContents.joinToString("\n") { it.text } }
            }

            override fun find(index: Int, query: String): List<List<PdfRect>> {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return emptyList()
                return renderer.openPage(index).use { page ->
                    page.searchText(query).map { match -> match.bounds.map(::rect) }
                }
            }

            override fun links(index: Int): List<PdfLink> {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return emptyList()
                return renderer.openPage(index).use { page ->
                    page.linkContents.map { PdfLink.External(it.uri.toString(), it.bounds.map(::rect)) } +
                        page.gotoLinks.map { PdfLink.Page(it.destination.pageNumber, it.bounds.map(::rect)) }
                }
            }

            override fun close() {
                renderer.close()
            }
        }
    }
}
