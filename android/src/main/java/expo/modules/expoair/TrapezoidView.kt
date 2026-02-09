package expo.modules.expoair

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.util.TypedValue
import android.view.View

/**
 * Custom view that draws a smooth trapezoid/hat shape extending from the top of the screen.
 * Mirrors ios/FloatingBubbleManager.swift TrapezoidView with curved "shoulders".
 *
 * Dimensions (in dp): topWidth=100, bottomWidth=65, height=32, shoulderHeight=16
 */
class TrapezoidView(context: Context) : View(context) {

    var topWidthDp: Float = 100f
    var bottomWidthDp: Float = 65f
    var shoulderHeightDp: Float = 16f
    var fillColor: Int = 0xFF000000.toInt()
    var cornerRadiusDp: Float = 10f

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    private val path = Path()

    private fun dp(value: Float): Float {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics
        )
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val w = width.toFloat()
        val h = height.toFloat()
        val centerX = w / 2f

        val topHalfWidth = dp(topWidthDp) / 2f
        val bottomHalfWidth = dp(bottomWidthDp) / 2f
        val shoulderH = dp(shoulderHeightDp)
        val cr = dp(cornerRadiusDp)

        paint.color = fillColor
        path.reset()

        // Start at top-left edge (flat, touching top)
        path.moveTo(centerX - topHalfWidth, 0f)

        // Top edge (flat)
        path.lineTo(centerX + topHalfWidth, 0f)

        // Right shoulder — curve from top edge down to the stem
        path.cubicTo(
            centerX + topHalfWidth, shoulderH * 0.8f,
            centerX + bottomHalfWidth, shoulderH * 0.2f,
            centerX + bottomHalfWidth, shoulderH
        )

        // Right edge — straight down to bottom-right corner
        path.lineTo(centerX + bottomHalfWidth, h - cr)

        // Bottom-right corner
        path.quadTo(
            centerX + bottomHalfWidth, h,
            centerX + bottomHalfWidth - cr, h
        )

        // Bottom edge
        path.lineTo(centerX - bottomHalfWidth + cr, h)

        // Bottom-left corner
        path.quadTo(
            centerX - bottomHalfWidth, h,
            centerX - bottomHalfWidth, h - cr
        )

        // Left edge — straight up to shoulder
        path.lineTo(centerX - bottomHalfWidth, shoulderH)

        // Left shoulder — curve back up to top edge
        path.cubicTo(
            centerX - bottomHalfWidth, shoulderH * 0.2f,
            centerX - topHalfWidth, shoulderH * 0.8f,
            centerX - topHalfWidth, 0f
        )

        path.close()
        canvas.drawPath(path, paint)
    }
}
