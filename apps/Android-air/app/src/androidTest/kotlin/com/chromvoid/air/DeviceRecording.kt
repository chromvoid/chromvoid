package com.chromvoid.air

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.sin

/**
 * A short recording made the way a phone's camera app makes one: the device's own hardware video encoder
 * (HEVC where it has one, else H.264) at 1080p and 30 frames a second, AAC sound, landscape frames stored
 * with a 90° hint as a phone held upright records them. A device without a hardware encoder gets
 * 720p H.264 from its software encoder. The frames are synthetic: moving stripes, no camera and no
 * person's data.
 */
internal object DeviceRecording {
    data class Made(val mime: String, val width: Int, val height: Int, val encoder: String, val hardware: Boolean)

    fun make(file: File, seconds: Int): Made {
        val video = chooseVideo()
        val videoSamples = ArrayList<Sample>()
        val videoFormat = encodeVideo(video, seconds, videoSamples)
        val audioSamples = ArrayList<Sample>()
        val audioFormat = encodeAudio(seconds, audioSamples)
        val muxer = MediaMuxer(file.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        try {
            muxer.setOrientationHint(PORTRAIT_DEGREES)
            val videoTrack = muxer.addTrack(videoFormat)
            val audioTrack = muxer.addTrack(audioFormat)
            muxer.start()
            val samples = videoSamples.map { videoTrack to it } + audioSamples.map { audioTrack to it }
            for ((track, sample) in samples.sortedBy { it.second.info.presentationTimeUs }) {
                muxer.writeSampleData(track, ByteBuffer.wrap(sample.bytes), sample.info)
            }
            muxer.stop()
        } finally {
            muxer.release()
        }
        return video.made
    }

    private class Sample(val bytes: ByteArray, val info: MediaCodec.BufferInfo)

    private class Choice(val made: Made, val format: MediaFormat)

    private fun chooseVideo(): Choice {
        val encoders = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.filter { it.isEncoder }
        for (mime in listOf(MediaFormat.MIMETYPE_VIDEO_HEVC, MediaFormat.MIMETYPE_VIDEO_AVC)) {
            val hardware = encoders.firstOrNull { info ->
                info.isHardwareAccelerated &&
                    info.supportedTypes.any { it.equals(mime, ignoreCase = true) } &&
                    info.getCapabilitiesForType(mime).videoCapabilities.isSizeSupported(FULL_WIDTH, FULL_HEIGHT)
            } ?: continue
            return Choice(
                Made(mime, FULL_WIDTH, FULL_HEIGHT, hardware.name, hardware = true),
                videoFormat(mime, FULL_WIDTH, FULL_HEIGHT),
            )
        }
        val mime = MediaFormat.MIMETYPE_VIDEO_AVC
        val format = videoFormat(mime, SMALL_WIDTH, SMALL_HEIGHT)
        val name = checkNotNull(MediaCodecList(MediaCodecList.REGULAR_CODECS).findEncoderForFormat(format)) {
            "no H.264 encoder on this device"
        }
        return Choice(Made(mime, SMALL_WIDTH, SMALL_HEIGHT, name, hardware = false), format)
    }

    private fun videoFormat(mime: String, width: Int, height: Int): MediaFormat =
        MediaFormat.createVideoFormat(mime, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
            setInteger(MediaFormat.KEY_BIT_RATE, if (width == FULL_WIDTH) FULL_BIT_RATE else SMALL_BIT_RATE)
            setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        }

    private fun encodeVideo(choice: Choice, seconds: Int, into: MutableList<Sample>): MediaFormat {
        val (_, width, height, name) = choice.made
        val codec = MediaCodec.createByCodecName(name)
        try {
            codec.configure(choice.format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            codec.start()
            val frames = seconds * FRAME_RATE
            val luma = ByteArray(width)
            var frame = 0
            var format: MediaFormat? = null
            var ended = false
            while (!ended) {
                if (frame <= frames) {
                    val index = codec.dequeueInputBuffer(WAIT_MICROS)
                    if (index >= 0) {
                        val time = frame * MICROS_PER_SECOND / FRAME_RATE
                        if (frame == frames) {
                            codec.queueInputBuffer(index, 0, 0, time, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        } else {
                            val image = checkNotNull(codec.getInputImage(index))
                            val y = image.planes[0]
                            for (x in 0 until width) luma[x] = stripe(x, frame)
                            for (row in 0 until height) {
                                y.buffer.position(row * y.rowStride)
                                y.buffer.put(luma)
                            }
                            // Grey: both chroma planes carry the same value, so interleaved planes stay consistent.
                            for (plane in image.planes.drop(1)) {
                                val chroma = ByteArray((width / 2 - 1) * plane.pixelStride + 1) { NEUTRAL }
                                for (row in 0 until height / 2) {
                                    plane.buffer.position(row * plane.rowStride)
                                    plane.buffer.put(chroma)
                                }
                            }
                            codec.queueInputBuffer(index, 0, width * height * 3 / 2, time, 0)
                        }
                        frame++
                    }
                }
                val drained = drain(codec, into)
                if (drained.format != null) format = drained.format
                ended = drained.ended
            }
            return checkNotNull(format) { "the video encoder never named its output" }
        } finally {
            codec.stop()
            codec.release()
        }
    }

    private fun encodeAudio(seconds: Int, into: MutableList<Sample>): MediaFormat {
        val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, 1).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, AUDIO_BIT_RATE)
        }
        val name = checkNotNull(MediaCodecList(MediaCodecList.REGULAR_CODECS).findEncoderForFormat(format)) {
            "no AAC encoder on this device"
        }
        val codec = MediaCodec.createByCodecName(name)
        try {
            codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            codec.start()
            val total = seconds * SAMPLE_RATE
            var written = 0
            var queuedEnd = false
            var output: MediaFormat? = null
            var ended = false
            while (!ended) {
                if (!queuedEnd) {
                    val index = codec.dequeueInputBuffer(WAIT_MICROS)
                    if (index >= 0) {
                        val time = written.toLong() * MICROS_PER_SECOND / SAMPLE_RATE
                        val buffer = checkNotNull(codec.getInputBuffer(index)).order(ByteOrder.LITTLE_ENDIAN)
                        val count = minOf(buffer.remaining() / 2, total - written)
                        repeat(count) {
                            val sample = sin(2 * PI * TONE_HZ * (written + it) / SAMPLE_RATE) * AMPLITUDE
                            buffer.putShort(sample.toInt().toShort())
                        }
                        written += count
                        queuedEnd = written >= total
                        val flags = if (queuedEnd) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0
                        codec.queueInputBuffer(index, 0, count * 2, time, flags)
                    }
                }
                val drained = drain(codec, into)
                if (drained.format != null) output = drained.format
                ended = drained.ended
            }
            return checkNotNull(output) { "the audio encoder never named its output" }
        } finally {
            codec.stop()
            codec.release()
        }
    }

    private class Drained(val format: MediaFormat?, val ended: Boolean)

    private fun drain(codec: MediaCodec, into: MutableList<Sample>): Drained {
        var format: MediaFormat? = null
        val info = MediaCodec.BufferInfo()
        while (true) {
            val index = codec.dequeueOutputBuffer(info, 0)
            when {
                index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> format = codec.outputFormat
                index < 0 -> return Drained(format, false)
                else -> {
                    val buffer = checkNotNull(codec.getOutputBuffer(index))
                    val config = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                    if (info.size > 0 && !config) {
                        val bytes = ByteArray(info.size)
                        buffer.position(info.offset)
                        buffer.get(bytes)
                        val copy = MediaCodec.BufferInfo().apply {
                            set(0, info.size, info.presentationTimeUs, info.flags)
                        }
                        into += Sample(bytes, copy)
                    }
                    codec.releaseOutputBuffer(index, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return Drained(format, true)
                }
            }
        }
    }

    /** Vertical stripes that move a little every frame, so no two frames are the same picture. */
    private fun stripe(x: Int, frame: Int): Byte =
        if ((x + frame * STRIPE_STEP) / STRIPE_WIDTH % 2 == 0) DARK else LIGHT

    private const val FULL_WIDTH = 1920
    private const val FULL_HEIGHT = 1080
    private const val SMALL_WIDTH = 1280
    private const val SMALL_HEIGHT = 720
    private const val FULL_BIT_RATE = 12_000_000
    private const val SMALL_BIT_RATE = 4_000_000
    private const val FRAME_RATE = 30
    private const val PORTRAIT_DEGREES = 90
    private const val SAMPLE_RATE = 44_100
    private const val AUDIO_BIT_RATE = 96_000
    private const val TONE_HZ = 440
    private const val AMPLITUDE = 8_000
    private const val WAIT_MICROS = 10_000L
    private const val MICROS_PER_SECOND = 1_000_000L
    private const val STRIPE_WIDTH = 96
    private const val STRIPE_STEP = 8
    private const val NEUTRAL: Byte = 128.toByte()
    private const val DARK: Byte = 40
    private const val LIGHT: Byte = 200.toByte()
}
