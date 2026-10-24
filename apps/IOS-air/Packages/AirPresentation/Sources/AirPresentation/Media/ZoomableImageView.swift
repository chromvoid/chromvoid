import SwiftUI
import UIKit

/// UIKit owns pinch, pan, deceleration and zoom geometry. No file or gallery state lives here.
struct ZoomableImageView: UIViewRepresentable {
  let image: CGImage
  let identity: UUID
  let name: String

  func makeUIView(context: Context) -> ImageZoomScrollView { ImageZoomScrollView() }

  func updateUIView(_ view: ImageZoomScrollView, context: Context) {
    view.display(image, name: name, identity: identity)
  }

  static func dismantleUIView(_ view: ImageZoomScrollView, coordinator: Void) { view.clear() }
}

final class ImageZoomScrollView: UIScrollView, UIScrollViewDelegate {
  private let picture = UIImageView()
  private var viewport = CGSize.zero
  private var identity: UUID?

  init() {
    super.init(frame: .zero)
    delegate = self
    contentInsetAdjustmentBehavior = .never
    showsHorizontalScrollIndicator = false
    showsVerticalScrollIndicator = false
    picture.isAccessibilityElement = true
    picture.accessibilityIdentifier = "imagePreviewContent"
    picture.isUserInteractionEnabled = true
    addSubview(picture)
    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(toggleZoom(_:)))
    doubleTap.numberOfTapsRequired = 2
    addGestureRecognizer(doubleTap)
  }

  required init?(coder: NSCoder) { nil }

  func display(_ image: CGImage, name: String, identity: UUID) {
    picture.accessibilityLabel = name
    guard picture.image?.cgImage !== image || self.identity != identity else { return }
    let next = UIImage(cgImage: image)
    let reset = self.identity != identity || picture.image?.size != next.size
    self.identity = identity
    if reset { setZoomScale(1, animated: false) }
    picture.image = next
    guard reset else { return }
    picture.frame = CGRect(x: 0, y: 0, width: image.width, height: image.height)
    viewport = .zero
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard let image = picture.image, bounds.width > 0, bounds.height > 0 else { return }
    if viewport != bounds.size {
      viewport = bounds.size
      let fit = min(bounds.width / image.size.width, bounds.height / image.size.height)
      minimumZoomScale = fit
      maximumZoomScale = fit * 4
      setZoomScale(fit, animated: false)
    }
    centerPicture()
  }

  func viewForZooming(in scrollView: UIScrollView) -> UIView? { picture }
  func scrollViewDidZoom(_ scrollView: UIScrollView) { centerPicture() }

  private func centerPicture() {
    picture.center = CGPoint(
      x: max(contentSize.width, bounds.width) / 2,
      y: max(contentSize.height, bounds.height) / 2)
  }

  @objc private func toggleZoom(_ gesture: UITapGestureRecognizer) {
    if zoomScale > minimumZoomScale * 1.01 {
      setZoomScale(minimumZoomScale, animated: true)
    } else {
      let point = gesture.location(in: picture)
      let scale = min(minimumZoomScale * 2, maximumZoomScale)
      let size = CGSize(width: bounds.width / scale, height: bounds.height / scale)
      zoom(
        to: CGRect(
          x: point.x - size.width / 2, y: point.y - size.height / 2,
          width: size.width, height: size.height), animated: true)
    }
  }

  func clear() {
    setContentOffset(contentOffset, animated: false)
    layer.removeAllAnimations()
    picture.layer.removeAllAnimations()
    picture.image = nil
    identity = nil
    picture.accessibilityLabel = nil
    delegate = nil
  }
}
