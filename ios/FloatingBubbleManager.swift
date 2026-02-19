import UIKit
import React

// MARK: - UIColor Hex Extension

extension UIColor {
    convenience init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        guard hexSanitized.count == 6,
              let rgb = UInt64(hexSanitized, radix: 16) else {
            return nil
        }

        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255.0,
            green: CGFloat((rgb >> 8) & 0xFF) / 255.0,
            blue: CGFloat(rgb & 0xFF) / 255.0,
            alpha: 1.0
        )
    }
}

// MARK: - DynamicIslandExtensionView
// Custom view that draws a smooth shape extending from the Dynamic Island
// with curved "shoulders" like a mushroom cap

class TrapezoidView: UIView {
    var topWidth: CGFloat = 100      // Fits within Dynamic Island
    var bottomWidth: CGFloat = 65    // Narrower stem
    var cornerRadius: CGFloat = 10
    var fillColor: UIColor = .black

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        backgroundColor = .clear
    }

    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }

        let width = rect.width
        let height = rect.height
        let centerX = width / 2

        // Top edge matches Dynamic Island
        let topHalfWidth = topWidth / 2
        // Bottom (stem) is narrower
        let bottomHalfWidth = bottomWidth / 2
        // How far down the shoulders curve before straightening
        let shoulderHeight: CGFloat = 16

        let path = UIBezierPath()

        // Start at top-left edge (flat, touching Dynamic Island)
        path.move(to: CGPoint(x: centerX - topHalfWidth, y: 0))

        // Top edge (flat)
        path.addLine(to: CGPoint(x: centerX + topHalfWidth, y: 0))

        // Right shoulder - sharper curve from top edge down to the stem
        path.addCurve(
            to: CGPoint(x: centerX + bottomHalfWidth, y: shoulderHeight),
            controlPoint1: CGPoint(x: centerX + topHalfWidth, y: shoulderHeight * 0.8),
            controlPoint2: CGPoint(x: centerX + bottomHalfWidth, y: shoulderHeight * 0.2)
        )

        // Right edge - straight down to bottom-right corner
        path.addLine(to: CGPoint(x: centerX + bottomHalfWidth, y: height - cornerRadius))

        // Bottom-right corner
        path.addQuadCurve(
            to: CGPoint(x: centerX + bottomHalfWidth - cornerRadius, y: height),
            controlPoint: CGPoint(x: centerX + bottomHalfWidth, y: height)
        )

        // Bottom edge
        path.addLine(to: CGPoint(x: centerX - bottomHalfWidth + cornerRadius, y: height))

        // Bottom-left corner
        path.addQuadCurve(
            to: CGPoint(x: centerX - bottomHalfWidth, y: height - cornerRadius),
            controlPoint: CGPoint(x: centerX - bottomHalfWidth, y: height)
        )

        // Left edge - straight up to shoulder
        path.addLine(to: CGPoint(x: centerX - bottomHalfWidth, y: shoulderHeight))

        // Left shoulder - sharper curve back up to top edge
        path.addCurve(
            to: CGPoint(x: centerX - topHalfWidth, y: 0),
            controlPoint1: CGPoint(x: centerX - bottomHalfWidth, y: shoulderHeight * 0.2),
            controlPoint2: CGPoint(x: centerX - topHalfWidth, y: shoulderHeight * 0.8)
        )

        path.close()

        // Fill the path
        context.setFillColor(fillColor.cgColor)
        context.addPath(path.cgPath)
        context.fillPath()
    }
}

// MARK: - FloatingBubbleWindow

class FloatingBubbleWindow: UIWindow {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let rootVC = rootViewController else { return nil }
        let hit = rootVC.view.hitTest(point, with: event)
        if hit === rootVC.view {
            return nil
        }
        // If we have a hit inside the bubble, make this window key
        // so that keyboard input works properly
        if hit != nil {
            self.makeKey()
        }
        return hit
    }
}

// MARK: - FloatingBubbleViewController
// Designed to look like a Dynamic Island extension - inverted trapezoid hanging from the island

class FloatingBubbleViewController: UIViewController, UIGestureRecognizerDelegate {
    private var bubbleContainer: UIView!
    private var shapeView: TrapezoidView!
    private var reactSurfaceView: UIView?
    private var nativeCloseButton: UIButton!
    private var placeholderDot: UIView!
    private var expandedPlaceholder: UIView!

    var bubbleSize: CGFloat = 60
    var bubbleColor: String = "#000000"
    var isExpanded: Bool = false
    var serverUrl: String?

    var onPress: (() -> Void)?
    var onExpand: (() -> Void)?
    var onCollapse: (() -> Void)?
    var onDragEnd: ((_ x: CGFloat, _ y: CGFloat) -> Void)?

    // Collapsed: Dynamic Island extension shape
    // Top fits within island, bottom is narrower stem
    private let collapsedTopWidth: CGFloat = 100
    private let collapsedBottomWidth: CGFloat = 65
    private let collapsedHeight: CGFloat = 32

    // Expanded dimensions - full width with 6px margins on each side
    private var expandedWidth: CGFloat {
        UIScreen.main.bounds.width - 12
    }
    private var expandedHeight: CGFloat {
        // Full screen height minus safe area top, expanded top offset, and bottom padding
        let screenHeight = UIScreen.main.bounds.height
        let safeAreaBottom = view.safeAreaInsets.bottom
        return screenHeight - expandedTopY - safeAreaBottom - 6
    }
    private let expandedCornerRadius: CGFloat = 32

    // Resolved safe area top inset, with fallbacks
    private var safeAreaTop: CGFloat {
        var insetTop: CGFloat = 59  // Default for Dynamic Island devices
        if view.safeAreaInsets.top > 0 {
            insetTop = view.safeAreaInsets.top
        } else if let windowScene = view.window?.windowScene,
                  let windowInsetTop = windowScene.windows.first?.safeAreaInsets.top,
                  windowInsetTop > 0 {
            insetTop = windowInsetTop
        }
        return insetTop
    }

    // Position to overlap with the Dynamic Island's bottom edge
    private var bubbleTopY: CGFloat {
        // Position behind the Dynamic Island so top edge is hidden
        // Only the shoulders and stem peek out below
        safeAreaTop - 18
    }

    // Position for expanded modal - below the safe area with padding
    private var expandedTopY: CGFloat {
        // Position below safe area with 6pt gap (matches side margins)
        safeAreaTop + 6
    }

    func setSurfaceView(_ surfaceView: UIView) {
        reactSurfaceView = surfaceView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        let screenWidth = UIScreen.main.bounds.width

        // Container for the bubble
        bubbleContainer = UIView()
        bubbleContainer.frame = CGRect(
            x: (screenWidth - collapsedTopWidth) / 2,
            y: bubbleTopY,
            width: collapsedTopWidth,
            height: collapsedHeight
        )
        bubbleContainer.backgroundColor = .clear

        // Create the trapezoid shape view
        shapeView = TrapezoidView(frame: bubbleContainer.bounds)
        shapeView.topWidth = collapsedTopWidth
        shapeView.bottomWidth = collapsedBottomWidth
        shapeView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        shapeView.fillColor = UIColor(hex: bubbleColor) ?? .black
        bubbleContainer.addSubview(shapeView)

        // Native gray placeholder dot — visible until RN bundle loads and renders its colored dot on top
        let dotSize: CGFloat = 8
        placeholderDot = UIView(frame: CGRect(
            x: (collapsedTopWidth - dotSize) / 2,
            y: (collapsedHeight - dotSize) / 2,
            width: dotSize,
            height: dotSize
        ))
        placeholderDot.backgroundColor = UIColor(white: 0.56, alpha: 1)
        placeholderDot.layer.cornerRadius = dotSize / 2
        bubbleContainer.addSubview(placeholderDot)

        // Shadow
        bubbleContainer.layer.shadowColor = UIColor.black.cgColor
        bubbleContainer.layer.shadowOpacity = 0.5
        bubbleContainer.layer.shadowOffset = CGSize(width: 0, height: 4)
        bubbleContainer.layer.shadowRadius = 8

        view.addSubview(bubbleContainer)

        // Native expanded placeholder — shown until RN renders its content on top
        // Added BEFORE reactSurfaceView so RN content covers it naturally
        expandedPlaceholder = UIView()
        expandedPlaceholder.isHidden = true

        let titleLabel = UILabel()
        titleLabel.text = "Server not running"
        titleLabel.textColor = UIColor.white.withAlphaComponent(0.4)
        titleLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let subtitleLabel = UILabel()
        subtitleLabel.text = "Start the development server\nfrom your project directory:"
        subtitleLabel.textColor = UIColor.white.withAlphaComponent(0.4)
        subtitleLabel.font = .systemFont(ofSize: 13)
        subtitleLabel.textAlignment = .center
        subtitleLabel.numberOfLines = 0
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false

        let codeBackground = UIView()
        codeBackground.backgroundColor = UIColor.white.withAlphaComponent(0.06)
        codeBackground.layer.cornerRadius = 14
        codeBackground.layer.borderWidth = 1
        codeBackground.layer.borderColor = UIColor.white.withAlphaComponent(0.08).cgColor
        codeBackground.translatesAutoresizingMaskIntoConstraints = false

        let codeLabel = UILabel()
        codeLabel.text = "npx expo-air fly"
        codeLabel.textColor = UIColor.white.withAlphaComponent(0.6)
        codeLabel.font = UIFont(name: "Menlo", size: 13) ?? .monospacedSystemFont(ofSize: 13, weight: .regular)
        codeLabel.textAlignment = .center
        codeLabel.translatesAutoresizingMaskIntoConstraints = false
        codeBackground.addSubview(codeLabel)

        let stack = UIStackView(arrangedSubviews: [titleLabel, subtitleLabel, codeBackground])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false

        expandedPlaceholder.addSubview(stack)
        expandedPlaceholder.translatesAutoresizingMaskIntoConstraints = false
        bubbleContainer.addSubview(expandedPlaceholder)

        NSLayoutConstraint.activate([
            expandedPlaceholder.leadingAnchor.constraint(equalTo: bubbleContainer.leadingAnchor),
            expandedPlaceholder.trailingAnchor.constraint(equalTo: bubbleContainer.trailingAnchor),
            expandedPlaceholder.topAnchor.constraint(equalTo: bubbleContainer.topAnchor),
            expandedPlaceholder.bottomAnchor.constraint(equalTo: bubbleContainer.bottomAnchor),

            stack.centerXAnchor.constraint(equalTo: expandedPlaceholder.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: expandedPlaceholder.centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 240),

            subtitleLabel.widthAnchor.constraint(equalTo: stack.widthAnchor),

            codeLabel.topAnchor.constraint(equalTo: codeBackground.topAnchor, constant: 12),
            codeLabel.bottomAnchor.constraint(equalTo: codeBackground.bottomAnchor, constant: -12),
            codeLabel.leadingAnchor.constraint(equalTo: codeBackground.leadingAnchor, constant: 16),
            codeLabel.trailingAnchor.constraint(equalTo: codeBackground.trailingAnchor, constant: -16),
        ])

        // Add React Native surface view on top (covers expandedPlaceholder when rendered)
        if let surfaceView = reactSurfaceView {
            surfaceView.frame = bubbleContainer.bounds
            surfaceView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            surfaceView.backgroundColor = .clear
            bubbleContainer.addSubview(surfaceView)
        }

        // Tap gesture
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        tap.delegate = self
        bubbleContainer.addGestureRecognizer(tap)

        // Native close button (hidden by default, shown when expanded)
        // Positioned to match the React Native close button location
        nativeCloseButton = UIButton(type: .system)
        nativeCloseButton.frame = CGRect(x: 16, y: 14, width: 30, height: 30)
        nativeCloseButton.backgroundColor = UIColor.white.withAlphaComponent(0.12)
        nativeCloseButton.layer.cornerRadius = 15
        nativeCloseButton.setTitle("✕", for: .normal)
        nativeCloseButton.setTitleColor(UIColor.white.withAlphaComponent(0.9), for: .normal)
        nativeCloseButton.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
        nativeCloseButton.addTarget(self, action: #selector(closeButtonTapped), for: .touchUpInside)
        nativeCloseButton.isHidden = true
        bubbleContainer.addSubview(nativeCloseButton)

        // Register for keyboard notifications
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillShow(_:)),
            name: UIResponder.keyboardWillShowNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillHide(_:)),
            name: UIResponder.keyboardWillHideNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func keyboardWillShow(_ notification: Notification) {
        guard isExpanded,
              let userInfo = notification.userInfo,
              let keyboardFrame = userInfo[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
              let duration = userInfo[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double
        else { return }

        let newHeight = expandedHeight - keyboardFrame.height

        UIView.animate(withDuration: duration) {
            self.bubbleContainer.frame.size.height = newHeight
        }
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        guard isExpanded,
              let userInfo = notification.userInfo,
              let duration = userInfo[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double
        else { return }

        UIView.animate(withDuration: duration) {
            self.bubbleContainer.frame.size.height = self.expandedHeight
        }
    }

    @objc private func closeButtonTapped() {
        collapse()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        // Reposition bubble now that we have accurate safe area insets
        if !isExpanded {
            let screenWidth = UIScreen.main.bounds.width
            bubbleContainer.frame = CGRect(
                x: (screenWidth - collapsedTopWidth) / 2,
                y: bubbleTopY,
                width: collapsedTopWidth,
                height: collapsedHeight
            )
        }
    }

    func expand() {
        guard !isExpanded else { return }
        isExpanded = true
        updateSurfaceProps()
        animateToExpanded()
        onExpand?()
    }

    func collapse() {
        guard isExpanded else { return }
        isExpanded = false
        updateSurfaceProps()
        animateToCollapsed()
        onCollapse?()
    }

    func updateSurfaceProps() {
        guard let surfaceView = reactSurfaceView as? RCTSurfaceHostingProxyRootView else { return }
        var props: [String: Any] = [
            "size": bubbleSize,
            "color": bubbleColor,
            "expanded": isExpanded,
        ]
        if let serverUrl = serverUrl {
            props["serverUrl"] = serverUrl
        }
        surfaceView.appProperties = props
    }

    private func animateToExpanded() {
        let screenWidth = UIScreen.main.bounds.width

        // Set the final frame immediately
        // Use expandedTopY to position below the Dynamic Island
        let expandedFrame = CGRect(
            x: (screenWidth - expandedWidth) / 2,
            y: expandedTopY,
            width: expandedWidth,
            height: expandedHeight
        )
        bubbleContainer.frame = expandedFrame

        // Scale down to collapsed size, anchored at top-center
        let scaleX = collapsedTopWidth / expandedWidth
        let scaleY = collapsedHeight / expandedHeight
        // Anchor at top center: shift transform so top edge stays fixed
        let yShift = -(expandedHeight * (1 - scaleY)) / 2
        bubbleContainer.transform = CGAffineTransform(translationX: 0, y: yShift)
            .scaledBy(x: scaleX, y: scaleY)

        // Prepare visual state
        self.shapeView.alpha = 0
        self.bubbleContainer.backgroundColor = UIColor(hex: bubbleColor) ?? .black
        self.bubbleContainer.layer.cornerRadius = self.expandedCornerRadius

        // Hide collapsed placeholder, show expanded placeholder
        placeholderDot.isHidden = true
        expandedPlaceholder.isHidden = false

        // Show native close button and bring to front
        bubbleContainer.bringSubviewToFront(nativeCloseButton)
        nativeCloseButton.isHidden = false
        nativeCloseButton.alpha = 0

        UIView.animate(
            withDuration: 0.4,
            delay: 0,
            usingSpringWithDamping: 0.75,
            initialSpringVelocity: 0.5,
            options: .curveEaseOut
        ) {
            self.bubbleContainer.transform = .identity
            self.nativeCloseButton.alpha = 1
        }
    }

    private func animateToCollapsed() {
        let screenWidth = UIScreen.main.bounds.width

        let newFrame = CGRect(
            x: (screenWidth - collapsedTopWidth) / 2,
            y: bubbleTopY,
            width: collapsedTopWidth,
            height: collapsedHeight
        )

        UIView.animate(
            withDuration: 0.35,
            delay: 0,
            usingSpringWithDamping: 0.8,
            initialSpringVelocity: 0.5,
            options: .curveEaseInOut
        ) {
            self.bubbleContainer.frame = newFrame
            // Show trapezoid, hide rounded rect
            self.shapeView.alpha = 1
            self.bubbleContainer.backgroundColor = .clear
            self.bubbleContainer.layer.cornerRadius = 0
            self.nativeCloseButton.alpha = 0
            self.expandedPlaceholder.alpha = 0
        } completion: { _ in
            self.nativeCloseButton.isHidden = true
            self.expandedPlaceholder.isHidden = true
            self.expandedPlaceholder.alpha = 1
            self.placeholderDot.isHidden = false
        }
    }

    // MARK: - UIGestureRecognizerDelegate

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        // When expanded, don't intercept taps - let React Native handle them (including close button)
        if isExpanded {
            return false
        }
        return true
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // When expanded, let React Native handle all touches
        if isExpanded {
            return false
        }
        return true
    }

    // MARK: - Gestures

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        // Only expand when tapping on the collapsed bubble
        if !isExpanded {
            onPress?()
            expand()
        }
    }
}

// MARK: - FloatingBubbleManager

class FloatingBubbleManager {
    static let shared = FloatingBubbleManager()

    private var bubbleWindow: FloatingBubbleWindow?
    private var bubbleVC: FloatingBubbleViewController?
    private var widgetRuntime: WidgetRuntime?

    var onPress: (() -> Void)?
    var onExpand: (() -> Void)?
    var onCollapse: (() -> Void)?
    var onDragEnd: ((_ x: CGFloat, _ y: CGFloat) -> Void)?

    private init() {}

    func show(size: CGFloat, color: String, bundleURL: URL?, serverUrl: String? = nil) {
        DispatchQueue.main.async {
            // If already showing, just make sure it's visible and return
            if let existingWindow = self.bubbleWindow, self.bubbleVC != nil {
                existingWindow.isHidden = false
                return
            }

            // Tear down any partial state
            self.bubbleWindow?.isHidden = true
            self.bubbleWindow?.rootViewController = nil
            self.bubbleWindow = nil
            self.bubbleVC = nil

            guard let windowScene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive })
                ?? UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first
            else { return }

            let window = FloatingBubbleWindow(windowScene: windowScene)
            window.windowLevel = .alert + 1
            window.backgroundColor = .clear

            let vc = FloatingBubbleViewController()
            vc.bubbleSize = size
            vc.bubbleColor = color
            vc.serverUrl = serverUrl

            // Create the widget runtime and surface view if we have a bundle URL
            NSLog("[FloatingBubbleManager] bundleURL = %@", bundleURL?.absoluteString ?? "nil")
            if let bundleURL = bundleURL {
                if self.widgetRuntime == nil {
                    if let runtime = WidgetRuntime(bundleURL: bundleURL) {
                        runtime.start()
                        self.widgetRuntime = runtime
                    }
                }

                var initialProps: [String: Any] = [
                    "size": size,
                    "color": color,
                    "expanded": false,
                ]
                if let serverUrl = serverUrl {
                    initialProps["serverUrl"] = serverUrl
                }

                if let surfaceView = self.widgetRuntime?.createSurfaceView(
                    withModuleName: "ExpoAirBubble",
                    initialProperties: initialProps
                ) {
                    vc.setSurfaceView(surfaceView)
                }
            }

            vc.onPress = { [weak self] in self?.onPress?() }
            vc.onExpand = { [weak self] in self?.onExpand?() }
            vc.onCollapse = { [weak self] in self?.onCollapse?() }
            vc.onDragEnd = { [weak self] x, y in self?.onDragEnd?(x, y) }

            window.rootViewController = vc
            window.isHidden = false
            window.makeKeyAndVisible()

            // Restore key window to the main app window
            if let mainWindow = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap({ $0.windows })
                .first(where: { $0 !== window }) {
                mainWindow.makeKey()
            }

            self.bubbleWindow = window
            self.bubbleVC = vc
        }
    }

    func hide() {
        DispatchQueue.main.async {
            self.bubbleWindow?.isHidden = true
            self.bubbleWindow?.rootViewController = nil
            self.bubbleWindow = nil
            self.bubbleVC = nil
            // Note: widgetRuntime is kept alive intentionally so it survives app reloads
        }
    }

    func expand() {
        DispatchQueue.main.async {
            self.bubbleVC?.expand()
        }
    }

    func collapse() {
        DispatchQueue.main.async {
            self.bubbleVC?.collapse()
        }
    }

    func updateServerUrl(_ url: String) {
        DispatchQueue.main.async {
            self.bubbleVC?.serverUrl = url
            self.bubbleVC?.updateSurfaceProps()
            UserDefaults.standard.set(url, forKey: "expo-air-server-url")
        }
    }
}
