import UIKit
import React

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

class FloatingBubbleViewController: UIViewController, UIGestureRecognizerDelegate {
    private var bubbleContainer: UIView!
    private var reactSurfaceView: UIView?

    var bubbleSize: CGFloat = 60
    var bubbleColor: String = "#007AFF"
    var isExpanded: Bool = false
    var serverUrl: String?

    var onPress: (() -> Void)?
    var onExpand: (() -> Void)?
    var onCollapse: (() -> Void)?
    var onDragEnd: ((_ x: CGFloat, _ y: CGFloat) -> Void)?

    private let expandedWidth: CGFloat = 300
    private let expandedHeight: CGFloat = 400
    private let expandedCornerRadius: CGFloat = 16

    private func uiColor(from hex: String) -> UIColor {
        var hexStr = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if hexStr.hasPrefix("#") { hexStr.removeFirst() }
        guard hexStr.count == 6, let rgb = UInt64(hexStr, radix: 16) else {
            return UIColor(red: 0, green: 0.478, blue: 1, alpha: 1)
        }
        return UIColor(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }

    func setSurfaceView(_ surfaceView: UIView) {
        reactSurfaceView = surfaceView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        bubbleContainer = UIView()
        bubbleContainer.frame = CGRect(
            x: UIScreen.main.bounds.width - bubbleSize - 16,
            y: 100,
            width: bubbleSize,
            height: bubbleSize
        )
        bubbleContainer.backgroundColor = uiColor(from: bubbleColor)
        bubbleContainer.layer.cornerRadius = bubbleSize / 2
        bubbleContainer.clipsToBounds = true

        // Shadow wrapper approach: add shadow to a separate layer
        bubbleContainer.layer.masksToBounds = false
        bubbleContainer.layer.shadowColor = UIColor.black.cgColor
        bubbleContainer.layer.shadowOpacity = 0.25
        bubbleContainer.layer.shadowOffset = CGSize(width: 0, height: 2)
        bubbleContainer.layer.shadowRadius = 6

        view.addSubview(bubbleContainer)

        if let surfaceView = reactSurfaceView {
            surfaceView.frame = bubbleContainer.bounds
            surfaceView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            bubbleContainer.addSubview(surfaceView)
        }

        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        pan.delegate = self
        bubbleContainer.addGestureRecognizer(pan)

        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        tap.delegate = self
        tap.require(toFail: pan)
        bubbleContainer.addGestureRecognizer(tap)
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

    private func updateSurfaceProps() {
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
        let screenBounds = UIScreen.main.bounds
        var newFrame = CGRect(
            x: bubbleContainer.frame.midX - expandedWidth / 2,
            y: bubbleContainer.frame.midY - expandedHeight / 2,
            width: expandedWidth,
            height: expandedHeight
        )
        newFrame.origin.x = max(8, min(newFrame.origin.x, screenBounds.width - expandedWidth - 8))
        newFrame.origin.y = max(50, min(newFrame.origin.y, screenBounds.height - expandedHeight - 8))

        UIView.animate(
            withDuration: 0.35,
            delay: 0,
            usingSpringWithDamping: 0.8,
            initialSpringVelocity: 0.5,
            options: .curveEaseInOut
        ) {
            self.bubbleContainer.frame = newFrame
            self.bubbleContainer.layer.cornerRadius = self.expandedCornerRadius
        }
    }

    private func animateToCollapsed() {
        let center = CGPoint(
            x: bubbleContainer.frame.midX,
            y: bubbleContainer.frame.midY
        )
        let newFrame = CGRect(
            x: center.x - bubbleSize / 2,
            y: center.y - bubbleSize / 2,
            width: bubbleSize,
            height: bubbleSize
        )

        UIView.animate(
            withDuration: 0.35,
            delay: 0,
            usingSpringWithDamping: 0.8,
            initialSpringVelocity: 0.5,
            options: .curveEaseInOut
        ) {
            self.bubbleContainer.frame = newFrame
            self.bubbleContainer.layer.cornerRadius = self.bubbleSize / 2
        }
    }

    // MARK: - UIGestureRecognizerDelegate

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        // When expanded, only allow pan gesture (for dragging the whole bubble)
        // but not tap gesture (let React Native handle taps)
        if isExpanded && gestureRecognizer is UITapGestureRecognizer {
            return false
        }
        return true
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // When expanded, check if the touch is on an interactive element
        // If so, let React Native handle it
        if isExpanded {
            // Allow pan gesture for dragging the bubble header area only
            if gestureRecognizer is UIPanGestureRecognizer {
                let location = touch.location(in: bubbleContainer)
                // Only allow pan in the top 44pt (header area)
                return location.y < 44
            }
        }
        return true
    }

    // MARK: - Gestures

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        let translation = gesture.translation(in: view)
        let screenBounds = UIScreen.main.bounds

        switch gesture.state {
        case .changed:
            var newCenter = CGPoint(
                x: bubbleContainer.center.x + translation.x,
                y: bubbleContainer.center.y + translation.y
            )
            let halfW = bubbleContainer.bounds.width / 2
            let halfH = bubbleContainer.bounds.height / 2
            newCenter.x = max(halfW, min(newCenter.x, screenBounds.width - halfW))
            newCenter.y = max(halfH + 50, min(newCenter.y, screenBounds.height - halfH))
            bubbleContainer.center = newCenter
            gesture.setTranslation(.zero, in: view)
        case .ended, .cancelled:
            onDragEnd?(bubbleContainer.frame.origin.x, bubbleContainer.frame.origin.y)
        default:
            break
        }
    }

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        // Only toggle expand/collapse when tapping on the collapsed bubble
        // When expanded, let the React Native content handle taps
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
                    withModuleName: "ExpoFlowBubble",
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
}
