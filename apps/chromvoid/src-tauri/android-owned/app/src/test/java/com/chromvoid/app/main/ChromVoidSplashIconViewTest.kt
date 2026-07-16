package com.chromvoid.app.main

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
import android.view.View
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ChromVoidSplashIconViewTest {
    @Test
    fun finalFrameRendersCenteredSvgLikeIcon() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val view =
            ChromVoidSplashIconView(activity).apply {
                setFinalFrame()
                measure(
                    View.MeasureSpec.makeMeasureSpec(256, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(256, View.MeasureSpec.EXACTLY),
                )
                layout(0, 0, 256, 256)
            }
        val bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)

        view.drawIconForTests(Canvas(bitmap), 256, 256)

        val bounds = findAlphaBounds(bitmap)
        assertTrue("bounds=$bounds width=${bounds.width()}", bounds.width() > 145)
        assertTrue("bounds=$bounds height=${bounds.height()}", bounds.height() > 140)
        assertTrue("bounds=$bounds centerX=${bounds.centerX()}", bounds.centerX() in 104..154)
        assertTrue("bounds=$bounds centerY=${bounds.centerY()}", bounds.centerY() in 92..152)

        val corePixel = bitmap.getPixel(143, 118)
        assertTrue("core alpha=${Color.alpha(corePixel)}", Color.alpha(corePixel) > 220)
        assertTrue("core green=${Color.green(corePixel)} red=${Color.red(corePixel)}", Color.green(corePixel) > Color.red(corePixel))
        assertTrue("core blue=${Color.blue(corePixel)} red=${Color.red(corePixel)}", Color.blue(corePixel) > Color.red(corePixel))
    }

    @Test
    fun introProgressRevealsSpiralAcrossRenderedFrames() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val view = ChromVoidSplashIconView(activity)

        view.setIntroProgress(0f)
        val hiddenPixels = countVisiblePixels(render(view))

        view.setIntroProgress(0.28f)
        val earlyPixels = countVisiblePixels(render(view))

        view.setIntroProgress(0.62f)
        val midPixels = countVisiblePixels(render(view))

        view.setIntroProgress(1f)
        val finalPixels = countVisiblePixels(render(view))

        assertTrue("hidden=$hiddenPixels", hiddenPixels < 24)
        assertTrue("early=$earlyPixels hidden=$hiddenPixels", earlyPixels > hiddenPixels + 250)
        assertTrue("mid=$midPixels early=$earlyPixels", midPixels > earlyPixels + 1_500)
        assertTrue("final=$finalPixels mid=$midPixels", finalPixels > midPixels + 1_500)
    }

    private fun render(view: ChromVoidSplashIconView): Bitmap {
        val bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)
        view.drawIconForTests(Canvas(bitmap), 256, 256)
        return bitmap
    }

    private fun countVisiblePixels(bitmap: Bitmap): Int {
        var count = 0

        for (y in 0 until bitmap.height) {
            for (x in 0 until bitmap.width) {
                if (Color.alpha(bitmap.getPixel(x, y)) > 12) count += 1
            }
        }

        return count
    }

    private fun findAlphaBounds(bitmap: Bitmap): Rect {
        val bounds = Rect(bitmap.width, bitmap.height, 0, 0)

        for (y in 0 until bitmap.height) {
            for (x in 0 until bitmap.width) {
                if (Color.alpha(bitmap.getPixel(x, y)) <= 12) continue

                bounds.left = minOf(bounds.left, x)
                bounds.top = minOf(bounds.top, y)
                bounds.right = maxOf(bounds.right, x)
                bounds.bottom = maxOf(bounds.bottom, y)
            }
        }

        return bounds
    }
}
