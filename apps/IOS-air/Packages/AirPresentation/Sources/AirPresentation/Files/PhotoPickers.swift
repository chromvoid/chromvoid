import ImageIO
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// The system photo picker. It runs out of process, so the app never needs library access;
/// `.current` asks for the item as it is stored, keeping HEIC, Live Photo stills and metadata.
struct PhotoLibraryPicker: UIViewControllerRepresentable {
  let onPick: ([PHPickerResult]) -> Void

  func makeUIViewController(context: Context) -> PHPickerViewController {
    var configuration = PHPickerConfiguration(photoLibrary: .shared())
    configuration.selectionLimit = 0
    configuration.preferredAssetRepresentationMode = .current
    configuration.selection = .ordered
    let controller = PHPickerViewController(configuration: configuration)
    controller.delegate = context.coordinator
    return controller
  }
  func updateUIViewController(_ controller: PHPickerViewController, context: Context) {}
  func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

  final class Coordinator: NSObject, PHPickerViewControllerDelegate {
    let onPick: ([PHPickerResult]) -> Void
    init(onPick: @escaping ([PHPickerResult]) -> Void) { self.onPick = onPick }
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
      onPick(results)
    }
  }
}

/// The system camera. The capture is encoded once as JPEG with the camera's own metadata.
struct CameraCapture: UIViewControllerRepresentable {
  let onCapture: (Data?) -> Void

  static var available: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let controller = UIImagePickerController()
    controller.sourceType = .camera
    controller.mediaTypes = [UTType.image.identifier]
    controller.delegate = context.coordinator
    return controller
  }
  func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
  func makeCoordinator() -> Coordinator { Coordinator(onCapture: onCapture) }

  final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate
  {
    let onCapture: (Data?) -> Void
    init(onCapture: @escaping (Data?) -> Void) { self.onCapture = onCapture }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onCapture(nil) }
    func imagePickerController(
      _ picker: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      let image = info[.originalImage] as? UIImage
      let metadata = info[.mediaMetadata] as? [CFString: Any]
      onCapture(image.flatMap { CameraCapture.jpeg($0, metadata: metadata) })
    }
  }

  static func jpeg(_ image: UIImage, metadata: [CFString: Any]?) -> Data? {
    guard let cgImage = image.cgImage else { return nil }
    let output = NSMutableData()
    guard
      let destination = CGImageDestinationCreateWithData(
        output, UTType.jpeg.identifier as CFString, 1, nil)
    else { return nil }
    var properties = metadata ?? [:]
    properties[kCGImagePropertyOrientation] = orientation(image.imageOrientation).rawValue
    properties[kCGImageDestinationLossyCompressionQuality] = 0.92
    CGImageDestinationAddImage(destination, cgImage, properties as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { return nil }
    return output as Data
  }

  private static func orientation(_ value: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch value {
    case .up: .up
    case .down: .down
    case .left: .left
    case .right: .right
    case .upMirrored: .upMirrored
    case .downMirrored: .downMirrored
    case .leftMirrored: .leftMirrored
    case .rightMirrored: .rightMirrored
    @unknown default: .up
    }
  }
}
