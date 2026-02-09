package expo.modules.expoair

import android.animation.ValueAnimator
import android.app.Activity
import android.graphics.Color
import android.graphics.Outline
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.ViewTreeObserver
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Transparent FrameLayout overlay added to Activity's DecorView.
 * Handles collapsed (trapezoid) and expanded (full panel) states,
 * animations, keyboard handling, and touch pass-through.
 *
 * Mirrors ios/FloatingBubbleManager.swift FloatingBubbleViewController.
 */
class FloatingBubbleView(
    private val activity: Activity
) : FrameLayout(activity) {

    var isExpanded: Boolean = false
        private set

    var onPress: (() -> Unit)? = null
    var onExpand: (() -> Unit)? = null
    var onCollapse: (() -> Unit)? = null

    private val bubbleContainer: FrameLayout
    private val shapeView: TrapezoidView
    private val placeholderDot: View
    private val nativeCloseButton: TextView
    private var reactSurfaceView: View? = null

    // Collapsed dimensions (dp)
    private val collapsedTopWidthDp = 100f
    private val collapsedHeightDp = 32f

    // Expanded
    private val expandedCornerRadiusDp = 32f
    private val expandedMarginDp = 6f

    // Animation tracking
    private var activeAnimator: ValueAnimator? = null

    // Keyboard tracking
    private var keyboardVisible = false
    private var keyboardHeight = 0
    private val globalLayoutListener: ViewTreeObserver.OnGlobalLayoutListener

    init {
        // Full screen transparent overlay
        layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )

        // Bubble container
        bubbleContainer = FrameLayout(context)
        val collapsedW = dp(collapsedTopWidthDp).toInt()
        val collapsedH = dp(collapsedHeightDp).toInt()
        val topY = statusBarHeight() - dp(18f).toInt()
        val containerParams = FrameLayout.LayoutParams(collapsedW, collapsedH).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            topMargin = topY
        }
        bubbleContainer.layoutParams = containerParams
        bubbleContainer.elevation = dp(8f)

        // Trapezoid shape
        shapeView = TrapezoidView(context)
        shapeView.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        bubbleContainer.addSubview(shapeView)

        // Gray placeholder dot (8dp, centered)
        val dotSize = dp(8f).toInt()
        placeholderDot = View(context)
        placeholderDot.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(0xFF8F8F8F.toInt())
        }
        val dotParams = FrameLayout.LayoutParams(dotSize, dotSize).apply {
            gravity = Gravity.CENTER
        }
        placeholderDot.layoutParams = dotParams
        bubbleContainer.addSubview(placeholderDot)

        // Native close button (hidden by default)
        nativeCloseButton = TextView(context)
        nativeCloseButton.text = "✕"
        nativeCloseButton.setTextColor(Color.argb(230, 255, 255, 255))
        nativeCloseButton.textSize = 14f
        nativeCloseButton.gravity = Gravity.CENTER
        val btnSize = dp(30f).toInt()
        val btnParams = FrameLayout.LayoutParams(btnSize, btnSize).apply {
            leftMargin = dp(16f).toInt()
            topMargin = dp(14f).toInt()
        }
        nativeCloseButton.layoutParams = btnParams
        nativeCloseButton.background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(15f)
            setColor(Color.argb(31, 255, 255, 255)) // white 12%
        }
        nativeCloseButton.visibility = View.GONE
        nativeCloseButton.setOnClickListener { collapse() }
        bubbleContainer.addSubview(nativeCloseButton)

        addView(bubbleContainer)

        // Keyboard listener — use WindowInsetsCompat for reliable IME detection
        globalLayoutListener = ViewTreeObserver.OnGlobalLayoutListener {
            val decorView = activity.window.decorView
            val insets = ViewCompat.getRootWindowInsets(decorView) ?: return@OnGlobalLayoutListener
            val imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
            val imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            val navBottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            // IME insets include nav bar, subtract to get keyboard-only height
            val kbHeight = if (imeVisible) (imeBottom - navBottom).coerceAtLeast(0) else 0

            if (imeVisible != keyboardVisible || kbHeight != keyboardHeight) {
                keyboardVisible = imeVisible
                keyboardHeight = kbHeight
                if (isExpanded) updateExpandedSize()
            }
        }
        activity.window.decorView.viewTreeObserver.addOnGlobalLayoutListener(globalLayoutListener)
    }

    fun setSurfaceView(surfaceView: View) {
        reactSurfaceView = surfaceView
        surfaceView.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        surfaceView.setBackgroundColor(Color.TRANSPARENT)
        // Keep VISIBLE so Fabric creates the native view tree.
        // Touch conflicts in collapsed mode are handled by onInterceptTouchEvent.
        bubbleContainer.addView(surfaceView)
        // Ensure close button is on top
        bubbleContainer.bringChildToFront(nativeCloseButton)
    }

    fun updateSurfaceProps(props: android.os.Bundle) {
        // WidgetRuntime handles prop updates via ReactSurface
    }

    fun expand() {
        if (isExpanded) return
        isExpanded = true
        animateToExpanded()
        onExpand?.invoke()
    }

    fun collapse() {
        if (!isExpanded) return
        isExpanded = false
        animateToCollapsed()
        onCollapse?.invoke()
    }

    private fun animateToExpanded() {
        val screenWidth = resources.displayMetrics.widthPixels
        val screenHeight = resources.displayMetrics.heightPixels
        val margin = dp(expandedMarginDp).toInt()
        val expandedW = screenWidth - margin * 2
        val topY = statusBarHeight() + margin
        val navBarH = navigationBarHeight()
        val expandedH = screenHeight - topY - navBarH - margin - keyboardHeight
        val cornerR = dp(expandedCornerRadiusDp)

        // Prepare visual state
        shapeView.alpha = 0f
        placeholderDot.visibility = View.GONE
        bubbleContainer.setBackgroundColor(Color.BLACK)
        bubbleContainer.outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) {
                outline.setRoundRect(0, 0, view.width, view.height, cornerR)
            }
        }
        bubbleContainer.clipToOutline = true

        // Show close button
        nativeCloseButton.visibility = View.VISIBLE
        nativeCloseButton.alpha = 0f

        // Animate from collapsed to expanded
        val collapsedW = dp(collapsedTopWidthDp).toInt()
        val collapsedH = dp(collapsedHeightDp).toInt()
        val collapsedTopY = statusBarHeight() - dp(18f).toInt()

        val animator = ValueAnimator.ofFloat(0f, 1f)
        animator.duration = 400
        animator.interpolator = OvershootInterpolator(0.8f)
        animator.addUpdateListener { anim ->
            val fraction = anim.animatedValue as Float
            val currentW = lerp(collapsedW.toFloat(), expandedW.toFloat(), fraction).toInt()
            val currentH = lerp(collapsedH.toFloat(), expandedH.toFloat(), fraction).toInt()
            val currentTopY = lerp(collapsedTopY.toFloat(), topY.toFloat(), fraction).toInt()

            val params = bubbleContainer.layoutParams as FrameLayout.LayoutParams
            params.width = currentW
            params.height = currentH
            params.topMargin = currentTopY
            params.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            bubbleContainer.layoutParams = params

            nativeCloseButton.alpha = fraction
        }
        animator.addListener(object : android.animation.AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: android.animation.Animator) {
                activeAnimator = null
            }
        })
        activeAnimator = animator
        animator.start()
    }

    private fun animateToCollapsed() {
        val collapsedW = dp(collapsedTopWidthDp).toInt()
        val collapsedH = dp(collapsedHeightDp).toInt()
        val collapsedTopY = statusBarHeight() - dp(18f).toInt()

        val currentParams = bubbleContainer.layoutParams as FrameLayout.LayoutParams
        val startW = currentParams.width
        val startH = currentParams.height
        val startTopY = currentParams.topMargin

        val animator = ValueAnimator.ofFloat(0f, 1f)
        animator.duration = 350
        animator.addUpdateListener { anim ->
            val fraction = anim.animatedValue as Float
            val currentW = lerp(startW.toFloat(), collapsedW.toFloat(), fraction).toInt()
            val currentH = lerp(startH.toFloat(), collapsedH.toFloat(), fraction).toInt()
            val currentTopY = lerp(startTopY.toFloat(), collapsedTopY.toFloat(), fraction).toInt()

            val params = bubbleContainer.layoutParams as FrameLayout.LayoutParams
            params.width = currentW
            params.height = currentH
            params.topMargin = currentTopY
            params.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            bubbleContainer.layoutParams = params

            shapeView.alpha = fraction
            nativeCloseButton.alpha = 1f - fraction
        }
        animator.addListener(object : android.animation.AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: android.animation.Animator) {
                bubbleContainer.setBackgroundColor(Color.TRANSPARENT)
                bubbleContainer.clipToOutline = false
                nativeCloseButton.visibility = View.GONE
                placeholderDot.visibility = View.VISIBLE
            }
        })
        animator.start()
    }

    private fun updateExpandedSize() {
        if (!isExpanded) return
        // Cancel any running expand animation so it doesn't overwrite our size
        activeAnimator?.cancel()
        activeAnimator = null
        // Ensure expanded visual state is finalized (in case animation was cancelled early)
        nativeCloseButton.visibility = View.VISIBLE
        nativeCloseButton.alpha = 1f

        val screenWidth = resources.displayMetrics.widthPixels
        val screenHeight = resources.displayMetrics.heightPixels
        val margin = dp(expandedMarginDp).toInt()
        val expandedW = screenWidth - margin * 2
        val topY = statusBarHeight() + margin
        val navBarH = navigationBarHeight()
        val expandedH = screenHeight - topY - navBarH - margin - keyboardHeight

        val params = bubbleContainer.layoutParams as FrameLayout.LayoutParams
        params.width = expandedW
        params.height = expandedH
        params.topMargin = topY
        bubbleContainer.layoutParams = params
    }

    // Touch routing:
    // Collapsed: intercept touches on the bubble so ReactSurfaceView doesn't consume them,
    //            handle tap-to-expand in onTouchEvent.
    // Expanded: let children (ReactSurfaceView, close button) handle touches normally.
    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        if (!isExpanded && isTouchInsideBubble(ev)) return true
        return false
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!isTouchInsideBubble(event)) return false
        if (!isExpanded) {
            if (event.action == MotionEvent.ACTION_UP) {
                onPress?.invoke()
                expand()
            }
            return true
        }
        return super.onTouchEvent(event)
    }

    private fun isTouchInsideBubble(ev: MotionEvent): Boolean {
        val loc = IntArray(2)
        bubbleContainer.getLocationOnScreen(loc)
        val x = ev.rawX
        val y = ev.rawY
        return x >= loc[0] && x <= loc[0] + bubbleContainer.width &&
                y >= loc[1] && y <= loc[1] + bubbleContainer.height
    }

    fun cleanup() {
        activity.window.decorView.viewTreeObserver.removeOnGlobalLayoutListener(globalLayoutListener)
    }

    // Helpers
    private fun dp(value: Float): Float {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics
        )
    }

    private fun statusBarHeight(): Int {
        val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else dp(24f).toInt()
    }

    private fun navigationBarHeight(): Int {
        val resourceId = resources.getIdentifier("navigation_bar_height", "dimen", "android")
        return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 0
    }

    private fun lerp(start: Float, end: Float, fraction: Float): Float {
        return start + (end - start) * fraction
    }

    private fun FrameLayout.addSubview(view: View) {
        addView(view)
    }
}
