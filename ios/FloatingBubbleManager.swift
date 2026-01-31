import UIKit

// MARK: - FloatingBubbleWindow

class FloatingBubbleWindow: UIWindow {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let rootVC = rootViewController else { return nil }
        let hit = rootVC.view.hitTest(point, with: event)
        if hit === rootVC.view {
            return nil
        }
        return hit
    }
}

// MARK: - FloatingBubbleViewController

class FloatingBubbleViewController: UIViewController {
    private var bubbleContainer: UIView!
    private var label: UILabel!

    var bubbleSize: CGFloat = 60
    var bubbleColor: String = "#007AFF"
    var isExpanded: Bool = false

    var onPress: (() -> Void)?
    var onExpand: (() -> Void)?
    var onCollapse: (() -> Void)?
    var onDragEnd: ((_ x: CGFloat, _ y: CGFloat) -> Void)?

    private let expandedWidth: CGFloat = 250
    private let expandedHeight: CGFloat = 300
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

        label = UILabel()
        label.text = "F"
        label.textColor = .white
        label.font = .systemFont(ofSize: 22, weight: .bold)
        label.textAlignment = .center
        label.frame = bubbleContainer.bounds
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        bubbleContainer.addSubview(label)

        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        bubbleContainer.addGestureRecognizer(pan)

        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        tap.require(toFail: pan)
        bubbleContainer.addGestureRecognizer(tap)
    }

    func expand() {
        guard !isExpanded else { return }
        isExpanded = true
        animateToExpanded()
        onExpand?()
    }

    func collapse() {
        guard isExpanded else { return }
        isExpanded = false
        animateToCollapsed()
        onCollapse?()
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

        label.text = "Expo Flow"
        label.font = .systemFont(ofSize: 18, weight: .semibold)

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

        label.text = "F"
        label.font = .systemFont(ofSize: 22, weight: .bold)

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
        onPress?()
        if isExpanded {
            collapse()
        } else {
            expand()
        }
    }
}

// MARK: - FloatingBubbleManager

class FloatingBubbleManager {
    static let shared = FloatingBubbleManager()

    private var bubbleWindow: FloatingBubbleWindow?
    private var bubbleVC: FloatingBubbleViewController?

    var onPress: (() -> Void)?
    var onExpand: (() -> Void)?
    var onCollapse: (() -> Void)?
    var onDragEnd: ((_ x: CGFloat, _ y: CGFloat) -> Void)?

    private init() {}

    func show(size: CGFloat, color: String) {
        DispatchQueue.main.async {
            // Inline hide to avoid re-dispatching to main
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
