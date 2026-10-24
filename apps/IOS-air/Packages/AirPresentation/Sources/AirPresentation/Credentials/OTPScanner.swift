import AVFoundation
import SwiftUI
import VisionKit

@MainActor
public protocol OTPScanAccess {
  func request() async -> OTPScanAvailability
}
public enum OTPScanAvailability { case ready, denied, unavailable }

@MainActor
public struct SystemOTPScanAccess: OTPScanAccess {
  public init() {}
  public func request() async -> OTPScanAvailability {
    guard DataScannerViewController.isSupported else { return .unavailable }
    let allowed: Bool
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: allowed = true
    case .notDetermined: allowed = await AVCaptureDevice.requestAccess(for: .video)
    default: allowed = false
    }
    guard allowed else { return .denied }
    return DataScannerViewController.isAvailable ? .ready : .unavailable
  }
}

/// Apple owns capture and recognition. Only the selected QR payload reaches the intake model.
struct OTPScanner: UIViewControllerRepresentable {
  let model: CredentialOTPImportModel
  let session: UUID
  func makeCoordinator() -> Coordinator { Coordinator(model: model, session: session) }
  func makeUIViewController(context: Context) -> Controller {
    let controller = Controller()
    controller.scanner.delegate = context.coordinator
    controller.failed = { [weak model] in model?.scanFailed(session: session) }
    return controller
  }
  func updateUIViewController(_ controller: Controller, context: Context) {}
  static func dismantleUIViewController(_ controller: Controller, coordinator: Coordinator) {
    controller.scanner.stopScanning()
    controller.scanner.delegate = nil
    controller.failed = nil
  }
  @MainActor final class Controller: UIViewController {
    let scanner = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.qr])],
      qualityLevel: .balanced, recognizesMultipleItems: false,
      isHighFrameRateTrackingEnabled: false,
      isPinchToZoomEnabled: true, isGuidanceEnabled: true, isHighlightingEnabled: true)
    var failed: (() -> Void)?
    override func viewDidLoad() {
      super.viewDidLoad()
      addChild(scanner)
      scanner.view.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(scanner.view)
      NSLayoutConstraint.activate([
        scanner.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
        scanner.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        scanner.view.topAnchor.constraint(equalTo: view.topAnchor),
        scanner.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      ])
      scanner.didMove(toParent: self)
    }
    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      do { try scanner.startScanning() } catch { failed?() }
    }
    override func viewWillDisappear(_ animated: Bool) {
      scanner.stopScanning()
      super.viewWillDisappear(animated)
    }
  }
  @MainActor final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    private weak var model: CredentialOTPImportModel?
    private let session: UUID
    init(model: CredentialOTPImportModel, session: UUID) {
      self.model = model
      self.session = session
    }
    func dataScanner(
      _ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
      allItems: [RecognizedItem]
    ) {
      guard
        let value = addedItems.compactMap({ item -> String? in
          if case .barcode(let barcode) = item { return barcode.payloadStringValue }
          return nil
        }).first
      else { return }
      dataScanner.stopScanning()
      model?.receive(value, session: session)
    }
    func dataScanner(
      _ dataScanner: DataScannerViewController,
      becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable
    ) {
      model?.scanFailed(session: session)
    }
  }
}
