package com.chromvoid.air.ui.credentials

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.Monogram
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import java.util.Base64
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** One entry icon from the vault's icon store, ready to draw. */
public data class CredentialIcon(val image: ImageBitmap, val background: Color?)

/**
 * The entry icons of one unlocked generation, read in batches. A list asks for
 * the digests of the page it just showed; a row draws what has arrived and its
 * monogram until then. A digest Core does not have, or an image that does not
 * decode, is remembered as missing so it is never asked for again; a failed
 * batch is forgotten, so the next page asks for it anew.
 */
public class CredentialIconCache(
    private val store: CredentialStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    /** Replaceable so a model test needs no Android image decoder. */
    private val decode: (ByteArray) -> ImageBitmap? = ::decodeIconImage,
) {
    private val mutableIcons = MutableStateFlow<Map<String, CredentialIcon>>(emptyMap())
    public val icons: StateFlow<Map<String, CredentialIcon>> = mutableIcons.asStateFlow()
    private val pending = mutableSetOf<String>()
    private val missing = mutableSetOf<String>()
    private var revoked = false

    public fun request(refs: List<String>) {
        if (revoked) return
        val wanted = refs.toSortedSet()
            .filterNot { it.isEmpty() || it in mutableIcons.value || it in pending || it in missing }
        if (wanted.isEmpty()) return
        pending += wanted
        wanted.chunked(BATCH_SIZE).forEach { batch ->
            scope.launch {
                try {
                    val response = store.credentialIcons(batch, generation)
                    pending -= batch.toSet()
                    if (revoked) return@launch
                    val decoded = response.icons.mapNotNull { record ->
                        val bytes = runCatching { Base64.getDecoder().decode(record.contentBase64) }.getOrNull()
                        val image = bytes?.let(decode)
                        if (image == null) {
                            missing += record.iconRef
                            null
                        } else {
                            record.iconRef to CredentialIcon(image, parseColor(record.backgroundColor))
                        }
                    }
                    missing += response.missingIconRefs
                    if (decoded.isNotEmpty()) mutableIcons.value = mutableIcons.value + decoded
                } catch (cancellation: CancellationException) {
                    pending -= batch.toSet()
                    throw cancellation
                } catch (error: Exception) {
                    // A failed batch is forgotten rather than remembered as missing:
                    // the next page that needs these icons asks for them again.
                    pending -= batch.toSet()
                    if (error.failureKind == FailureKind.REVOKED) close()
                }
            }
        }
    }

    /** The session ended: the images go with it. */
    public fun close() {
        revoked = true
        pending.clear()
        missing.clear()
        mutableIcons.value = emptyMap()
    }

    public companion object {
        /** Core takes at most this many digests per `passmanager:icon:getMany`. */
        public const val BATCH_SIZE: Int = 64

        /** `#RRGGBB` or `#RRGGBBAA` as the icon store writes it; anything else is no background. */
        internal fun parseColor(hex: String?): Color? {
            val text = hex?.trim()?.removePrefix("#") ?: return null
            if (text.length != 6 && text.length != 8) return null
            val value = text.toLongOrNull(radix = 16) ?: return null
            val hasAlpha = text.length == 8
            val shift = if (hasAlpha) 8 else 0
            return Color(
                red = ((value shr (16 + shift)) and 0xFF).toInt() / 255f,
                green = ((value shr (8 + shift)) and 0xFF).toInt() / 255f,
                blue = ((value shr shift) and 0xFF).toInt() / 255f,
                alpha = if (hasAlpha) (value and 0xFF).toInt() / 255f else 1f,
            )
        }
    }
}

private fun decodeIconImage(bytes: ByteArray): ImageBitmap? =
    runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }.getOrNull()

/** The stored icon [iconRef] drawn for an entry, once the vault has read it. */
public fun entryIconTag(iconRef: String): String = "entry-icon-$iconRef"

/**
 * The entry's icon when the vault has one, and its monogram until then. The
 * icon keeps the background the store drew it for, so a transparent logo does
 * not sit on the canvas.
 */
@Composable
public fun EntryIcon(
    title: String,
    entryType: String,
    iconRef: String?,
    icons: CredentialIconCache?,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
) {
    val loaded = icons?.icons?.collectAsStateWithLifecycle()?.value?.get(iconRef)
    if (loaded == null) {
        Monogram(title, entryType, modifier, size)
        return
    }
    Box(
        modifier = modifier
            .testTag(entryIconTag(iconRef.orEmpty()))
            .size(size)
            .clip(RoundedCornerShape(size * 0.28f))
            .background(loaded.background ?: Air.colors.card),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            bitmap = loaded.image,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(size * 0.72f),
        )
    }
}
