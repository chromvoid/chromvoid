import Foundation
import AVFoundation
import AVKit
import MediaPlayer
import Photos
import Tauri
import UIKit
import UniformTypeIdentifiers
import WebKit

private struct NativeShareFile: Decodable {
  let path: String
  let mimeType: String?
}

private struct NativeAudioTrack: Decodable {
  let trackId: UInt64
  let systemTitle: String
  let mimeType: String?
  let size: UInt64?
  let sourceRevision: UInt64?
  let sourceToken: String?
}

private struct NativeAudioCommand: Decodable {
  let command: String
  let nativeSessionId: String
  let tracks: [NativeAudioTrack]?
  let index: Int?
  let autoplay: Bool?
  let positionMs: UInt64?
}

private struct NativeVideoSource: Decodable {
  let token: String
  let nodeId: UInt64?
  let name: String?
  let mimeType: String
  let size: UInt64
  let sourceRevision: UInt64?
}

private func contentTypeIdentifier(mimeType: String, fallback: String) -> String {
  if #available(iOS 14.0, *) {
    return UTType(mimeType: mimeType)?.identifier ?? fallback
  }
  return fallback
}

private func mimeTypeForFilenameExtension(_ filenameExtension: String) -> String? {
  guard !filenameExtension.isEmpty else {
    return nil
  }
  if #available(iOS 14.0, *) {
    return UTType(filenameExtension: filenameExtension)?.preferredMIMEType
  }
  return nil
}

private func makeExportPicker(url: URL) -> UIDocumentPickerViewController {
  if #available(iOS 14.0, *) {
    return UIDocumentPickerViewController(forExporting: [url], asCopy: true)
  }
  return UIDocumentPickerViewController(url: url, in: .exportToService)
}

private func makeUploadPicker() -> UIDocumentPickerViewController {
  if #available(iOS 14.0, *) {
    return UIDocumentPickerViewController(forOpeningContentTypes: [UTType.item], asCopy: true)
  }
  return UIDocumentPickerViewController(documentTypes: ["public.item"], in: .import)
}

private func makeRestorePicker() -> UIDocumentPickerViewController {
  if #available(iOS 14.0, *) {
    return UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder], asCopy: false)
  }
  return UIDocumentPickerViewController(documentTypes: ["public.folder"], in: .open)
}

@_silgen_name("chromvoid_ios_native_restore_source_result")
func chromvoid_ios_native_restore_source_result(
  _ operationId: UnsafePointer<CChar>,
  _ backupPath: UnsafePointer<CChar>?,
  _ displayName: UnsafePointer<CChar>?,
  _ status: Int32,
  _ errorMessage: UnsafePointer<CChar>?
)

@_silgen_name("chromvoid_ios_native_upload_picker_result")
func chromvoid_ios_native_upload_picker_result(
  _ uploadId: UnsafePointer<CChar>,
  _ sessionId: UnsafePointer<CChar>?,
  _ status: Int32,
  _ errorMessage: UnsafePointer<CChar>?
)

@_silgen_name("chromvoid_ios_native_otp_qr_scan_result")
func chromvoid_ios_native_otp_qr_scan_result(
  _ scanId: UnsafePointer<CChar>,
  _ status: UnsafePointer<CChar>,
  _ value: UnsafePointer<CChar>?,
  _ message: UnsafePointer<CChar>?
) -> Int32

@_silgen_name("chromvoid_ios_native_audio_read_source")
func chromvoid_ios_native_audio_read_source(
  _ token: UnsafePointer<CChar>,
  _ offset: UInt64,
  _ length: UInt64,
  _ outLen: UnsafeMutablePointer<Int>,
  _ outErrorCode: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> UnsafeMutablePointer<UInt8>?

@_silgen_name("chromvoid_ios_native_audio_free_bytes")
func chromvoid_ios_native_audio_free_bytes(
  _ bytes: UnsafeMutablePointer<UInt8>?,
  _ len: Int
)

@_silgen_name("chromvoid_ios_native_audio_free_string")
func chromvoid_ios_native_audio_free_string(
  _ value: UnsafeMutablePointer<CChar>?
)

@_silgen_name("chromvoid_ios_native_audio_player_event")
func chromvoid_ios_native_audio_player_event(
  _ eventJson: UnsafePointer<CChar>
) -> Int32

private enum NativePickerPurpose {
  case export
  case upload(uploadId: String)
  case restore(operationId: String)
}

private final class NativeDocumentPickerDelegate: NSObject, UIDocumentPickerDelegate {
  private let purpose: NativePickerPurpose
  private weak var runtime: ChromVoidNativeBridgeRuntime?

  init(purpose: NativePickerPurpose, runtime: ChromVoidNativeBridgeRuntime) {
    self.purpose = purpose
    self.runtime = runtime
    super.init()
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    if case .upload(let uploadId) = purpose {
      runtime?.completeUploadPicker(
        uploadId: uploadId,
        sessionId: nil,
        status: 1,
        errorMessage: nil
      )
    } else if case .restore(let operationId) = purpose {
      runtime?.completeRestorePicker(
        operationId: operationId,
        backupPath: nil,
        displayName: nil,
        status: 1,
        errorMessage: nil
      )
    }
    runtime?.releasePresentedController(controller)
    runtime?.releasePicker(self)
  }

  func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    defer {
      runtime?.releasePresentedController(controller)
      runtime?.releasePicker(self)
    }

    if case .upload(let uploadId) = purpose {
      runtime?.stageUploadFiles(uploadId: uploadId, sources: urls)
      return
    }

    guard case .restore(let operationId) = purpose else {
      return
    }

    guard let url = urls.first else {
      runtime?.completeRestorePicker(
        operationId: operationId,
        backupPath: nil,
        displayName: nil,
        status: 2,
        errorMessage: "No restore source selected"
      )
      return
    }

    runtime?.stageRestoreSource(operationId: operationId, source: url)
  }

  func cancelForLifecycleRelease() {
    if case .upload(let uploadId) = purpose {
      runtime?.completeUploadPicker(
        uploadId: uploadId,
        sessionId: nil,
        status: 1,
        errorMessage: "Native session released"
      )
    } else if case .restore(let operationId) = purpose {
      runtime?.completeRestorePicker(
        operationId: operationId,
        backupPath: nil,
        displayName: nil,
        status: 1,
        errorMessage: "Native session released"
      )
    }
    runtime?.releasePicker(self)
  }
}

private final class OtpQrScannerViewController: UIViewController {
  var previewLayer: AVCaptureVideoPreviewLayer?
  var onCancel: (() -> Void)?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black

    if let previewLayer {
      previewLayer.frame = view.bounds
      view.layer.addSublayer(previewLayer)
    }

    let cancelButton = UIButton(type: .system)
    cancelButton.setTitle("Cancel", for: .normal)
    cancelButton.setTitleColor(.white, for: .normal)
    cancelButton.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    cancelButton.layer.cornerRadius = 8
    cancelButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 16, bottom: 10, right: 16)
    cancelButton.translatesAutoresizingMaskIntoConstraints = false
    cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
    view.addSubview(cancelButton)

    NSLayoutConstraint.activate([
      cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
      cancelButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
    ])
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
  }

  @objc private func cancelTapped() {
    onCancel?()
  }
}

private final class NativeAudioSessionController: NSObject, AVAssetResourceLoaderDelegate {
  private let nativeSessionId: String
  private let tracks: [NativeAudioTrack]
  private weak var runtime: ChromVoidNativeBridgeRuntime?
  private let resourceQueue: DispatchQueue
  private var player: AVPlayer?
  private var itemStatusObservation: NSKeyValueObservation?
  private var timeControlObservation: NSKeyValueObservation?
  private var periodicTimeObserver: Any?
  private var endObserver: NSObjectProtocol?
  private var currentIndex: Int
  private var playbackIntent: String
  private var stopped = false

  init(nativeSessionId: String, tracks: [NativeAudioTrack], index: Int, runtime: ChromVoidNativeBridgeRuntime) {
    self.nativeSessionId = nativeSessionId
    self.tracks = tracks
    self.currentIndex = max(0, min(index, max(0, tracks.count - 1)))
    self.runtime = runtime
    self.playbackIntent = "pause"
    self.resourceQueue = DispatchQueue(label: "com.chromvoid.ios.native-audio.\(nativeSessionId)")
    super.init()
  }

  func start(autoplay: Bool) -> Bool {
    guard tracks.indices.contains(currentIndex) else {
      return false
    }
    playbackIntent = autoplay ? "play" : "pause"
    configureAudioSession()
    runtime?.activateNativeAudioRemoteControls(nativeSessionId: nativeSessionId)
    preparePlayer(autoplay: autoplay)
    return true
  }

  func handle(command: NativeAudioCommand) -> Bool {
    guard !stopped else {
      return command.command == "stop"
    }

    switch command.command {
    case "togglePlayPause":
      return handle(command: NativeAudioCommand(
        command: playbackIntent == "play" ? "pause" : "play",
        nativeSessionId: command.nativeSessionId,
        tracks: nil,
        index: nil,
        autoplay: nil,
        positionMs: nil
      ))
    case "play":
      playbackIntent = "play"
      player?.play()
      emitState(playbackState: "buffering", playbackIntent: "play", loadingState: nil)
      return true
    case "pause":
      playbackIntent = "pause"
      player?.pause()
      emitState(playbackState: "paused", playbackIntent: "pause", loadingState: nil)
      return true
    case "stop":
      stop(reason: "system_stop")
      return true
    case "seekTo":
      let millis = command.positionMs ?? 0
      let time = CMTime(seconds: Double(millis) / 1000.0, preferredTimescale: 600)
      player?.seek(to: time)
      emitState(positionMs: millis)
      return true
    case "selectTrack":
      guard let index = command.index, tracks.indices.contains(index) else {
        return false
      }
      currentIndex = index
      preparePlayer(autoplay: playbackIntent == "play")
      return true
    case "nextTrack":
      guard currentIndex + 1 < tracks.count else {
        return false
      }
      currentIndex += 1
      preparePlayer(autoplay: playbackIntent == "play")
      return true
    case "previousTrack":
      guard currentIndex > 0 else {
        return false
      }
      currentIndex -= 1
      preparePlayer(autoplay: playbackIntent == "play")
      return true
    default:
      return false
    }
  }

  func stop(reason: String) {
    guard !stopped else {
      return
    }
    stopped = true
    tearDownPlayer()
    runtime?.deactivateNativeAudioRemoteControls(nativeSessionId: nativeSessionId)
    emitReleased(reason: reason)
  }

  private func preparePlayer(autoplay: Bool) {
    tearDownPlayer()
    guard tracks.indices.contains(currentIndex), let sourceToken = tracks[currentIndex].sourceToken, !sourceToken.isEmpty else {
      emitError(code: "ERR_NATIVE_AUDIO_UNSUPPORTED", recoverable: false)
      return
    }

    let escapedToken = sourceToken.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sourceToken
    guard let url = URL(string: "chromvoid-native-audio://source/\(escapedToken)") else {
      emitError(code: "ERR_NATIVE_AUDIO_UNSUPPORTED", recoverable: false)
      return
    }

    let asset = AVURLAsset(url: url)
    asset.resourceLoader.setDelegate(self, queue: resourceQueue)
    let item = AVPlayerItem(asset: asset)
    let player = AVPlayer(playerItem: item)
    self.player = player

    endObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: item,
      queue: .main
    ) { [weak self] _ in
      self?.emitEnded()
    }

    itemStatusObservation = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
      DispatchQueue.main.async {
        self?.handleItemStatus(item.status)
      }
    }
    timeControlObservation = player.observe(\.timeControlStatus, options: [.initial, .new]) { [weak self] player, _ in
      DispatchQueue.main.async {
        self?.handleTimeControlStatus(player.timeControlStatus)
      }
    }
    periodicTimeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 1, preferredTimescale: 600),
      queue: .main
    ) { [weak self] time in
      self?.emitState(positionMs: UInt64(max(0, time.seconds) * 1000))
    }

    emitState(playbackState: autoplay ? "buffering" : "paused", playbackIntent: autoplay ? "play" : "pause", loadingState: "loading")
    if autoplay {
      player.play()
    }
  }

  private func tearDownPlayer() {
    if let periodicTimeObserver {
      player?.removeTimeObserver(periodicTimeObserver)
      self.periodicTimeObserver = nil
    }
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
      self.endObserver = nil
    }
    itemStatusObservation?.invalidate()
    timeControlObservation?.invalidate()
    itemStatusObservation = nil
    timeControlObservation = nil
    player?.pause()
    player = nil
  }

  private func handleItemStatus(_ status: AVPlayerItem.Status) {
    guard !stopped else {
      return
    }

    switch status {
    case .readyToPlay:
      emitState(playbackState: playbackIntent == "play" ? "buffering" : "paused", playbackIntent: playbackIntent, loadingState: "loaded")
    case .failed:
      emitError(code: "ERR_NATIVE_AUDIO_SOURCE_READ", recoverable: true)
    case .unknown:
      emitState(playbackState: "buffering", playbackIntent: playbackIntent, loadingState: "loading")
    @unknown default:
      emitError(code: "ERR_NATIVE_AUDIO_SOURCE_READ", recoverable: true)
    }
  }

  private func handleTimeControlStatus(_ status: AVPlayer.TimeControlStatus) {
    guard !stopped else {
      return
    }

    switch status {
    case .playing:
      emitState(playbackState: "playing", playbackIntent: "play", loadingState: "loaded")
    case .waitingToPlayAtSpecifiedRate:
      emitState(playbackState: playbackIntent == "play" ? "buffering" : "paused", playbackIntent: playbackIntent)
    case .paused:
      emitState(playbackState: "paused", playbackIntent: playbackIntent)
    @unknown default:
      emitState(playbackState: "buffering", playbackIntent: playbackIntent)
    }
  }

  private func configureAudioSession() {
    do {
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      NSLog("ios_native_bridge: native audio session activation failed")
    }
  }

  func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest
  ) -> Bool {
    guard tracks.indices.contains(currentIndex), let sourceToken = tracks[currentIndex].sourceToken else {
      loadingRequest.finishLoading(with: NativeBridgeError.nativeAudioSourceUnavailable)
      return true
    }

    let track = tracks[currentIndex]
    if let contentInfo = loadingRequest.contentInformationRequest {
      let mimeType = track.mimeType ?? "audio/mpeg"
      contentInfo.contentType = contentTypeIdentifier(mimeType: mimeType, fallback: "public.audio")
      contentInfo.contentLength = Int64(track.size ?? 0)
      contentInfo.isByteRangeAccessSupported = true
    }

    guard let dataRequest = loadingRequest.dataRequest else {
      loadingRequest.finishLoading()
      return true
    }

    var offset = UInt64(max(0, dataRequest.currentOffset != 0 ? dataRequest.currentOffset : dataRequest.requestedOffset))
    var remaining = max(0, dataRequest.requestedLength)
    while remaining > 0 {
      let chunkLength = min(remaining, 1_048_576)
      let chunk = readSourceChunk(token: sourceToken, offset: offset, length: UInt64(chunkLength))
      if let data = chunk.data {
        if data.isEmpty {
          remaining = 0
        } else {
          dataRequest.respond(with: data)
          offset += UInt64(data.count)
          remaining -= data.count
        }
      } else {
        let code = chunk.errorCode ?? "ERR_NATIVE_AUDIO_SOURCE_READ"
        emitError(code: code, recoverable: true)
        loadingRequest.finishLoading(with: NativeBridgeError.nativeAudioSourceUnavailable)
        return true
      }
    }

    loadingRequest.finishLoading()
    return true
  }

  private func readSourceChunk(token: String, offset: UInt64, length: UInt64) -> (data: Data?, errorCode: String?) {
    return token.withCString { tokenPtr in
      var len = 0
      var errorPtr: UnsafeMutablePointer<CChar>?
      guard let bytes = chromvoid_ios_native_audio_read_source(tokenPtr, offset, length, &len, &errorPtr) else {
        let code = errorPtr.map { String(cString: $0) } ?? "ERR_NATIVE_AUDIO_SOURCE_READ"
        chromvoid_ios_native_audio_free_string(errorPtr)
        return (nil, code)
      }
      defer {
        chromvoid_ios_native_audio_free_bytes(bytes, len)
      }
      guard len > 0 else {
        return (Data(), nil)
      }
      return (Data(bytes: bytes, count: len), nil)
    }
  }

  private func emitState(
    playbackState: String? = nil,
    playbackIntent: String? = nil,
    loadingState: String? = nil,
    positionMs: UInt64? = nil
  ) {
    var payload: [String: Any] = [
      "event": "state",
      "nativeSessionId": nativeSessionId,
      "index": currentIndex,
      "positionMs": positionMs ?? currentPositionMs(),
      "hasPrevious": currentIndex > 0,
      "hasNext": currentIndex < tracks.count - 1,
      "canSeek": true,
    ]
    if let trackId = currentTrack?.trackId {
      payload["trackId"] = trackId
    }
    if let sourceRevision = currentTrack?.sourceRevision {
      payload["sourceRevision"] = sourceRevision
    }
    if let playbackState {
      payload["playbackState"] = playbackState
    }
    if let playbackIntent {
      payload["playbackIntent"] = playbackIntent
    }
    if let loadingState {
      payload["loadingState"] = loadingState
    }
    if let durationMs = currentDurationMs() {
      payload["durationMs"] = durationMs
    }
    updateNowPlaying(playbackState: playbackState, positionMs: positionMs ?? currentPositionMs())
    emit(payload)
  }

  private func emitError(code: String, recoverable: Bool) {
    var payload: [String: Any] = [
      "event": "error",
      "nativeSessionId": nativeSessionId,
      "index": currentIndex,
      "playbackState": "error",
      "loadingState": "error",
      "code": code,
      "recoverable": recoverable,
    ]
    if let trackId = currentTrack?.trackId {
      payload["trackId"] = trackId
    }
    if let sourceRevision = currentTrack?.sourceRevision {
      payload["sourceRevision"] = sourceRevision
    }
    emit(payload)
  }

  private func emitEnded() {
    var payload: [String: Any] = [
      "event": "ended",
      "nativeSessionId": nativeSessionId,
      "index": currentIndex,
    ]
    if let trackId = currentTrack?.trackId {
      payload["trackId"] = trackId
    }
    if let sourceRevision = currentTrack?.sourceRevision {
      payload["sourceRevision"] = sourceRevision
    }
    emit(payload)
  }

  private func emitReleased(reason: String) {
    emit([
      "event": "released",
      "nativeSessionId": nativeSessionId,
      "reason": reason,
    ])
  }

  private func emit(_ payload: [String: Any]) {
    runtime?.emitNativeAudioEvent(payload)
  }

  private var currentTrack: NativeAudioTrack? {
    tracks.indices.contains(currentIndex) ? tracks[currentIndex] : nil
  }

  private func currentPositionMs() -> UInt64 {
    guard let seconds = player?.currentTime().seconds, seconds.isFinite, seconds > 0 else {
      return 0
    }
    return UInt64(seconds * 1000)
  }

  private func currentDurationMs() -> UInt64? {
    guard let seconds = player?.currentItem?.duration.seconds, seconds.isFinite, seconds > 0 else {
      return nil
    }
    return UInt64(seconds * 1000)
  }

  private func updateNowPlaying(playbackState: String?, positionMs: UInt64) {
    let duration = currentDurationMs().map { Double($0) / 1000.0 }
    let elapsed = Double(positionMs) / 1000.0
    let rate = playbackState == "playing" || (playbackState == nil && playbackIntent == "play") ? 1.0 : 0.0

    DispatchQueue.main.async {
      var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
      info[MPMediaItemPropertyTitle] = "ChromVoid audio"
      info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
      info[MPNowPlayingInfoPropertyPlaybackRate] = rate
      if let duration {
        info[MPMediaItemPropertyPlaybackDuration] = duration
      }
      MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
  }
}

private final class NativeVideoSessionController: NSObject, AVAssetResourceLoaderDelegate {
  private let source: NativeVideoSource
  private let resourceQueue: DispatchQueue
  private var playerViewController: AVPlayerViewController?
  private var player: AVPlayer?

  init(source: NativeVideoSource) {
    self.source = source
    self.resourceQueue = DispatchQueue(label: "com.chromvoid.ios.native-video")
    super.init()
  }

  func present(from root: UIViewController) -> Bool {
    guard !source.token.isEmpty else {
      return false
    }
    let escapedToken = source.token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? source.token
    guard let url = URL(string: "chromvoid-native-video://source/\(escapedToken)") else {
      return false
    }

    let asset = AVURLAsset(url: url)
    asset.resourceLoader.setDelegate(self, queue: resourceQueue)
    let item = AVPlayerItem(asset: asset)
    let player = AVPlayer(playerItem: item)
    let controller = AVPlayerViewController()
    controller.player = player
    controller.modalPresentationStyle = .fullScreen
    self.player = player
    self.playerViewController = controller
    root.present(controller, animated: true) {
      player.play()
    }
    return true
  }

  func stop() {
    player?.pause()
    player = nil
    let controller = playerViewController
    playerViewController = nil
    controller?.dismiss(animated: true)
  }

  func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest
  ) -> Bool {
    if let contentInfo = loadingRequest.contentInformationRequest {
      contentInfo.contentType = contentTypeIdentifier(mimeType: source.mimeType, fallback: "public.movie")
      contentInfo.contentLength = Int64(source.size)
      contentInfo.isByteRangeAccessSupported = true
    }

    guard let dataRequest = loadingRequest.dataRequest else {
      loadingRequest.finishLoading()
      return true
    }

    var offset = UInt64(max(0, dataRequest.currentOffset != 0 ? dataRequest.currentOffset : dataRequest.requestedOffset))
    var remaining = max(0, dataRequest.requestedLength)
    while remaining > 0 {
      let chunkLength = min(remaining, 1_048_576)
      if let data = readSourceChunk(token: source.token, offset: offset, length: UInt64(chunkLength)) {
        if data.isEmpty {
          remaining = 0
        } else {
          dataRequest.respond(with: data)
          offset += UInt64(data.count)
          remaining -= data.count
        }
      } else {
        loadingRequest.finishLoading(with: NativeBridgeError.nativeAudioSourceUnavailable)
        return true
      }
    }

    loadingRequest.finishLoading()
    return true
  }

  private func readSourceChunk(token: String, offset: UInt64, length: UInt64) -> Data? {
    return token.withCString { tokenPtr in
      var len = 0
      var errorPtr: UnsafeMutablePointer<CChar>?
      guard let bytes = chromvoid_ios_native_audio_read_source(tokenPtr, offset, length, &len, &errorPtr) else {
        chromvoid_ios_native_audio_free_string(errorPtr)
        return nil
      }
      defer {
        chromvoid_ios_native_audio_free_bytes(bytes, len)
      }
      guard len > 0 else {
        return Data()
      }
      return Data(bytes: bytes, count: len)
    }
  }
}

private final class ChromVoidNativeBridgeRuntime: NSObject, UIDocumentInteractionControllerDelegate {
  static let shared = ChromVoidNativeBridgeRuntime()

  private var activeDocumentControllers: [UIDocumentInteractionController] = []
  private var activePresentedControllers: [UIViewController] = []
  private var activePickerDelegates: [NativeDocumentPickerDelegate] = []
  private weak var rootViewController: UIViewController?
  private let appGroupIdentifier = "group.com.chromvoid.app.shared"
  private var activeOtpScanId: String?
  private var activeOtpSession: AVCaptureSession?
  private var activeOtpController: OtpQrScannerViewController?
  private var activeAudioSessions: [String: NativeAudioSessionController] = [:]
  private var activeAudioRemoteSessionId: String?
  private var audioRemoteCommandTargets: [Any] = []
  private var activeVideoSessions: [String: NativeVideoSessionController] = [:]

  private override init() {
    super.init()
  }

  func setRootViewController(_ controller: UIViewController?) {
    rootViewController = controller
  }

  func openFile(path: String, mimeType: String?) -> Int32 {
    guard FileManager.default.fileExists(atPath: path) else {
      return 0
    }

    DispatchQueue.main.async {
      guard let root = self.topViewController() else {
        NSLog("ios_native_bridge: root view controller unavailable")
        return
      }

      let controller = UIDocumentInteractionController(url: URL(fileURLWithPath: path))
      controller.delegate = self
      self.retainDocumentController(controller)

      if !controller.presentPreview(animated: true) {
        controller.presentOptionsMenu(from: root.view.bounds, in: root.view, animated: true)
      }
    }

    return 1
  }

  func shareFiles(_ items: [NativeShareFile]) -> Int32 {
    let urls = items
      .map { URL(fileURLWithPath: $0.path) }
      .filter { FileManager.default.fileExists(atPath: $0.path) }

    guard !urls.isEmpty else {
      return 0
    }

    DispatchQueue.main.async {
      guard let root = self.topViewController() else {
        NSLog("ios_native_bridge: root view controller unavailable")
        return
      }

      let controller = UIActivityViewController(activityItems: urls, applicationActivities: nil)
      if let popover = controller.popoverPresentationController {
        popover.sourceView = root.view
        popover.sourceRect = CGRect(
          x: root.view.bounds.midX,
          y: root.view.bounds.midY,
          width: 1,
          height: 1
        )
        popover.permittedArrowDirections = []
      }
      controller.completionWithItemsHandler = { [weak self, weak controller] _, _, _, _ in
        guard let controller else {
          return
        }
        self?.releasePresentedController(controller)
      }
      self.presentNativeController(controller, from: root)
    }

    return 1
  }

  func openAppSettings() -> Int32 {
    DispatchQueue.main.async {
      guard let url = URL(string: UIApplication.openSettingsURLString) else {
        return
      }
      UIApplication.shared.open(url)
    }
    return 1
  }

  func exportBackup(path: String) -> Int32 {
    guard FileManager.default.fileExists(atPath: path) else {
      return 0
    }

    DispatchQueue.main.async {
      guard let root = self.topViewController() else {
        NSLog("ios_native_bridge: root view controller unavailable")
        return
      }

      let url = URL(fileURLWithPath: path)
      let picker = makeExportPicker(url: url)
      let delegate = NativeDocumentPickerDelegate(purpose: .export, runtime: self)
      picker.delegate = delegate
      self.retainPicker(delegate)
      self.presentNativeController(picker, from: root)
    }

    return 1
  }

  func pickUploadFiles(uploadId: String) -> Int32 {
    guard !uploadId.isEmpty else {
      return 0
    }

    DispatchQueue.main.async {
      guard let root = self.topViewController() else {
        self.completeUploadPicker(
          uploadId: uploadId,
          sessionId: nil,
          status: 2,
          errorMessage: "Root view controller unavailable"
        )
        return
      }

      let picker = makeUploadPicker()
      let delegate = NativeDocumentPickerDelegate(purpose: .upload(uploadId: uploadId), runtime: self)
      picker.delegate = delegate
      picker.allowsMultipleSelection = true
      self.retainPicker(delegate)
      self.presentNativeController(picker, from: root)
    }

    return 1
  }

  func pickRestoreSource(operationId: String) -> Int32 {
    guard !operationId.isEmpty else {
      return 0
    }

    DispatchQueue.main.async {
      guard let root = self.topViewController() else {
        self.completeRestorePicker(
          operationId: operationId,
          backupPath: nil,
          displayName: nil,
          status: 2,
          errorMessage: "Root view controller unavailable"
        )
        return
      }

      let picker = makeRestorePicker()
      let delegate = NativeDocumentPickerDelegate(purpose: .restore(operationId: operationId), runtime: self)
      picker.delegate = delegate
      picker.allowsMultipleSelection = false
      self.retainPicker(delegate)
      self.presentNativeController(picker, from: root)
    }

    return 1
  }

  func stageUploadFiles(uploadId: String, sources: [URL]) {
    guard !sources.isEmpty else {
      completeUploadPicker(
        uploadId: uploadId,
        sessionId: nil,
        status: 1,
        errorMessage: nil
      )
      return
    }

    do {
      guard let appGroupUrl = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupIdentifier
      ) else {
        throw NativeBridgeError.appGroupUnavailable
      }

      let sessionId = "upload-\(UUID().uuidString)"
      let sessionRoot = appGroupUrl
        .appendingPathComponent("NativeStaging", isDirectory: true)
        .appendingPathComponent("uploads", isDirectory: true)
        .appendingPathComponent(sessionId, isDirectory: true)

      if FileManager.default.fileExists(atPath: sessionRoot.path) {
        try FileManager.default.removeItem(at: sessionRoot)
      }
      try FileManager.default.createDirectory(
        at: sessionRoot,
        withIntermediateDirectories: true
      )

      var files: [[String: Any]] = []
      for (index, source) in sources.enumerated() {
        let accessed = source.startAccessingSecurityScopedResource()
        defer {
          if accessed {
            source.stopAccessingSecurityScopedResource()
          }
        }

        let displayName = source.lastPathComponent.isEmpty ? "File \(index + 1)" : source.lastPathComponent
        let extensionPart = source.pathExtension.isEmpty ? "" : ".\(source.pathExtension)"
        let stagedName = "item-\(index + 1)-\(UUID().uuidString)\(extensionPart)"
        let destination = sessionRoot.appendingPathComponent(stagedName, isDirectory: false)
        try FileManager.default.copyItem(at: source, to: destination)

        let attributes = try FileManager.default.attributesOfItem(atPath: destination.path)
        let size = (attributes[.size] as? NSNumber)?.uint64Value ?? 0
        let mimeType = mimeTypeForFilenameExtension(source.pathExtension)
        files.append([
          "stagedName": stagedName,
          "displayName": displayName,
          "size": size,
          "mimeType": mimeType ?? NSNull(),
        ])
      }

      let manifest: [String: Any] = [
        "sessionId": sessionId,
        "createdAtUnixMs": Int64(Date().timeIntervalSince1970 * 1000),
        "files": files,
      ]
      let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted])
      try manifestData.write(to: sessionRoot.appendingPathComponent("manifest.json"))

      completeUploadPicker(
        uploadId: uploadId,
        sessionId: sessionId,
        status: 0,
        errorMessage: nil
      )
    } catch {
      completeUploadPicker(
        uploadId: uploadId,
        sessionId: nil,
        status: 2,
        errorMessage: "Upload staging failed"
      )
    }
  }

  func completeUploadPicker(
    uploadId: String,
    sessionId: String?,
    status: Int32,
    errorMessage: String?
  ) {
    uploadId.withCString { uploadPtr in
      withOptionalCString(sessionId) { sessionPtr in
        withOptionalCString(errorMessage) { errorPtr in
          chromvoid_ios_native_upload_picker_result(
            uploadPtr,
            sessionPtr,
            status,
            errorPtr
          )
        }
      }
    }
  }

  func stageRestoreSource(operationId: String, source: URL) {
    let accessed = source.startAccessingSecurityScopedResource()
    defer {
      if accessed {
        source.stopAccessingSecurityScopedResource()
      }
    }

    do {
      guard let appGroupUrl = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupIdentifier
      ) else {
        throw NativeBridgeError.appGroupUnavailable
      }

      let sessionRoot = appGroupUrl
        .appendingPathComponent("NativeStaging", isDirectory: true)
        .appendingPathComponent("backup-restore", isDirectory: true)
        .appendingPathComponent(operationId, isDirectory: true)

      if FileManager.default.fileExists(atPath: sessionRoot.path) {
        try FileManager.default.removeItem(at: sessionRoot)
      }
      try FileManager.default.createDirectory(
        at: sessionRoot,
        withIntermediateDirectories: true
      )

      let displayName = source.lastPathComponent.isEmpty ? "ChromVoid Backup" : source.lastPathComponent
      let destination = sessionRoot.appendingPathComponent(displayName, isDirectory: true)
      try FileManager.default.copyItem(at: source, to: destination)

      completeRestorePicker(
        operationId: operationId,
        backupPath: destination.path,
        displayName: displayName,
        status: 0,
        errorMessage: nil
      )
    } catch {
      completeRestorePicker(
        operationId: operationId,
        backupPath: nil,
        displayName: nil,
        status: 2,
        errorMessage: "Restore source staging failed"
      )
    }
  }

  func completeRestorePicker(
    operationId: String,
    backupPath: String?,
    displayName: String?,
    status: Int32,
    errorMessage: String?
  ) {
    operationId.withCString { operationPtr in
      withOptionalCString(backupPath) { backupPathPtr in
        withOptionalCString(displayName) { displayNamePtr in
          withOptionalCString(errorMessage) { errorPtr in
            chromvoid_ios_native_restore_source_result(
              operationPtr,
              backupPathPtr,
              displayNamePtr,
              status,
              errorPtr
            )
          }
        }
      }
    }
  }

  func startOtpQrScan(scanId: String) -> Int32 {
    guard !scanId.isEmpty else {
      return 1
    }

    return syncOnMain {
      var result: Int32 = 0
      guard self.activeOtpScanId == nil else {
        return 2
      }

      switch AVCaptureDevice.authorizationStatus(for: .video) {
      case .authorized:
        result = self.startAuthorizedOtpQrScan(scanId: scanId)
      case .notDetermined:
        self.activeOtpScanId = scanId
        AVCaptureDevice.requestAccess(for: .video) { granted in
          DispatchQueue.main.async {
            guard self.activeOtpScanId == scanId else {
              return
            }
            if granted {
              if self.startAuthorizedOtpQrScan(scanId: scanId) != 0 {
                self.finishOtpQrScan(status: "unavailable", value: nil, message: "Camera scanner failed to start")
              }
            } else {
              self.finishOtpQrScan(status: "permission_denied", value: nil, message: "Camera permission denied")
            }
          }
        }
        result = 0
      case .denied, .restricted:
        self.activeOtpScanId = scanId
        self.finishOtpQrScan(status: "permission_denied", value: nil, message: "Camera permission denied")
        result = 0
      @unknown default:
        self.activeOtpScanId = scanId
        self.finishOtpQrScan(status: "unavailable", value: nil, message: "Camera scanner is unavailable")
        result = 0
      }
      return result
    }
  }

  func cancelOtpQrScan(scanId: String) -> Int32 {
    return syncOnMain {
      guard self.activeOtpScanId == scanId else {
        return 0
      }
      self.finishOtpQrScan(status: "cancelled", value: nil, message: "QR scan cancelled")
      return 1
    }
  }

  func handleNativeAudioCommand(payloadJson: String) -> Int32 {
    guard
      let data = payloadJson.data(using: .utf8),
      let command = try? JSONDecoder().decode(NativeAudioCommand.self, from: data),
      !command.nativeSessionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      return 0
    }

    return syncOnMain {
      switch command.command {
      case "startSession":
        guard
          let tracks = command.tracks,
          !tracks.isEmpty,
          let index = command.index,
          tracks.indices.contains(index)
        else {
          return 0
        }

        activeAudioSessions[command.nativeSessionId]?.stop(reason: "system_stop")
        let controller = NativeAudioSessionController(
          nativeSessionId: command.nativeSessionId,
          tracks: tracks,
          index: index,
          runtime: self
        )
        activeAudioSessions[command.nativeSessionId] = controller
        return controller.start(autoplay: command.autoplay ?? false) ? 1 : 0
      default:
        guard let controller = activeAudioSessions[command.nativeSessionId] else {
          return command.command == "stop" ? 1 : 0
        }
        let accepted = controller.handle(command: command)
        if command.command == "stop" {
          activeAudioSessions.removeValue(forKey: command.nativeSessionId)
        }
        return accepted ? 1 : 0
      }
    }
  }

  func startNativeVideo(sourceJson: String) -> Int32 {
    guard
      let data = sourceJson.data(using: .utf8),
      let source = try? JSONDecoder().decode(NativeVideoSource.self, from: data),
      !source.token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      return 0
    }

    return syncOnMain {
      guard let root = self.topViewController() else {
        return 0
      }
      activeVideoSessions[source.token]?.stop()
      let controller = NativeVideoSessionController(source: source)
      guard controller.present(from: root) else {
        return 0
      }
      activeVideoSessions[source.token] = controller
      return 1
    }
  }

  func stopNativeVideo(token: String) -> Int32 {
    let token = token.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !token.isEmpty else {
      return 1
    }
    return syncOnMain {
      activeVideoSessions.removeValue(forKey: token)?.stop()
      return 1
    }
  }

  func emitNativeAudioEvent(_ payload: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          let json = String(data: data, encoding: .utf8)
    else {
      return
    }

    json.withCString { eventPtr in
      _ = chromvoid_ios_native_audio_player_event(eventPtr)
    }
  }

  func activateNativeAudioRemoteControls(nativeSessionId: String) {
    deactivateNativeAudioRemoteControls(nativeSessionId: activeAudioRemoteSessionId)
    activeAudioRemoteSessionId = nativeSessionId

    let commandCenter = MPRemoteCommandCenter.shared()
    commandCenter.playCommand.isEnabled = true
    commandCenter.pauseCommand.isEnabled = true
    commandCenter.togglePlayPauseCommand.isEnabled = true
    commandCenter.nextTrackCommand.isEnabled = true
    commandCenter.previousTrackCommand.isEnabled = true
    commandCenter.changePlaybackPositionCommand.isEnabled = true

    audioRemoteCommandTargets = [
      commandCenter.playCommand.addTarget { [weak self] _ in
        self?.handleNativeAudioRemoteCommand(nativeSessionId: nativeSessionId, command: "play") ?? .commandFailed
      },
      commandCenter.pauseCommand.addTarget { [weak self] _ in
        self?.handleNativeAudioRemoteCommand(nativeSessionId: nativeSessionId, command: "pause") ?? .commandFailed
      },
      commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
        self?.handleNativeAudioRemoteCommand(nativeSessionId: nativeSessionId, command: "togglePlayPause") ?? .commandFailed
      },
      commandCenter.nextTrackCommand.addTarget { [weak self] _ in
        self?.handleNativeAudioRemoteCommand(nativeSessionId: nativeSessionId, command: "nextTrack") ?? .commandFailed
      },
      commandCenter.previousTrackCommand.addTarget { [weak self] _ in
        self?.handleNativeAudioRemoteCommand(nativeSessionId: nativeSessionId, command: "previousTrack") ?? .commandFailed
      },
      commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
        guard let event = event as? MPChangePlaybackPositionCommandEvent else {
          return .commandFailed
        }
        return self?.handleNativeAudioRemoteCommand(
          nativeSessionId: nativeSessionId,
          command: "seekTo",
          positionMs: UInt64(max(0, event.positionTime) * 1000)
        ) ?? .commandFailed
      },
    ]
  }

  func deactivateNativeAudioRemoteControls(nativeSessionId: String?) {
    guard nativeSessionId == nil || nativeSessionId == activeAudioRemoteSessionId else {
      return
    }

    let commandCenter = MPRemoteCommandCenter.shared()
    for target in audioRemoteCommandTargets {
      commandCenter.playCommand.removeTarget(target)
      commandCenter.pauseCommand.removeTarget(target)
      commandCenter.togglePlayPauseCommand.removeTarget(target)
      commandCenter.nextTrackCommand.removeTarget(target)
      commandCenter.previousTrackCommand.removeTarget(target)
      commandCenter.changePlaybackPositionCommand.removeTarget(target)
    }
    audioRemoteCommandTargets = []
    activeAudioRemoteSessionId = nil
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
  }

  private func handleNativeAudioRemoteCommand(
    nativeSessionId: String,
    command: String,
    positionMs: UInt64? = nil
  ) -> MPRemoteCommandHandlerStatus {
    guard let controller = activeAudioSessions[nativeSessionId] else {
      return .noSuchContent
    }

    let accepted = controller.handle(command: NativeAudioCommand(
      command: command,
      nativeSessionId: nativeSessionId,
      tracks: nil,
      index: nil,
      autoplay: nil,
      positionMs: positionMs
    ))
    return accepted ? .success : .commandFailed
  }

  private func startAuthorizedOtpQrScan(scanId: String) -> Int32 {
    guard activeOtpScanId == nil || activeOtpScanId == scanId else {
      return 2
    }

    guard let root = topViewController() else {
      return 3
    }
    guard let camera = AVCaptureDevice.default(for: .video) else {
      activeOtpScanId = scanId
      finishOtpQrScan(status: "unavailable", value: nil, message: "Camera is unavailable")
      return 0
    }

    do {
      let session = AVCaptureSession()
      let input = try AVCaptureDeviceInput(device: camera)
      guard session.canAddInput(input) else {
        return 3
      }
      session.addInput(input)

      let output = AVCaptureMetadataOutput()
      guard session.canAddOutput(output) else {
        return 3
      }
      session.addOutput(output)
      output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
      output.metadataObjectTypes = [.qr]

      let previewLayer = AVCaptureVideoPreviewLayer(session: session)
      previewLayer.videoGravity = .resizeAspectFill

      let controller = OtpQrScannerViewController()
      controller.modalPresentationStyle = .fullScreen
      controller.previewLayer = previewLayer
      controller.onCancel = { [weak self] in
        self?.finishOtpQrScan(status: "cancelled", value: nil, message: "QR scan cancelled")
      }

      activeOtpScanId = scanId
      activeOtpSession = session
      activeOtpController = controller
      presentNativeController(controller, from: root) {
        DispatchQueue.global(qos: .userInitiated).async {
          session.startRunning()
        }
      }
      return 0
    } catch {
      return 3
    }
  }

  private func finishOtpQrScan(status: String, value: String?, message: String?) {
    guard let scanId = activeOtpScanId else {
      return
    }

    let session = activeOtpSession
    let controller = activeOtpController
    activeOtpScanId = nil
    activeOtpSession = nil
    activeOtpController = nil

    if let session {
      DispatchQueue.global(qos: .userInitiated).async {
        session.stopRunning()
      }
    }

    if let controller {
      releasePresentedController(controller)
      controller.dismiss(animated: true)
    }

    emitOtpQrScanResult(scanId: scanId, status: status, value: value, message: message)
  }

  private func emitOtpQrScanResult(scanId: String, status: String, value: String?, message: String?) {
    scanId.withCString { scanPtr in
      status.withCString { statusPtr in
        withOptionalCString(value) { valuePtr in
          withOptionalCString(message) { messagePtr in
            _ = chromvoid_ios_native_otp_qr_scan_result(scanPtr, statusPtr, valuePtr, messagePtr)
          }
        }
      }
    }
  }

  func saveImageToPhotos(data: Data, fileName: String, mimeType: String?) -> Int32 {
    guard !data.isEmpty else {
      return 0
    }

    DispatchQueue.main.async {
      PHPhotoLibrary.shared().performChanges({
        let request = PHAssetCreationRequest.forAsset()
        let options = PHAssetResourceCreationOptions()
        options.originalFilename = self.safeOriginalFilename(fileName)
        request.addResource(with: .photo, data: data, options: options)
      }) { success, error in
        if !success {
          NSLog("ios_native_bridge: photo library save failed: \(error?.localizedDescription ?? "unknown error")")
        }
      }
    }

    return 1
  }

  func documentInteractionControllerViewControllerForPreview(
    _ controller: UIDocumentInteractionController
  ) -> UIViewController {
    return topViewController() ?? UIViewController()
  }

  func documentInteractionControllerDidEndPreview(_ controller: UIDocumentInteractionController) {
    releaseDocumentController(controller)
  }

  private func topViewController() -> UIViewController? {
    var controller = rootViewController
    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller
  }

  private func retainDocumentController(_ controller: UIDocumentInteractionController) {
    activeDocumentControllers.append(controller)
    if activeDocumentControllers.count > 8 {
      activeDocumentControllers.removeFirst(activeDocumentControllers.count - 8)
    }
  }

  private func releaseDocumentController(_ controller: UIDocumentInteractionController) {
    activeDocumentControllers.removeAll { $0 === controller }
  }

  private func presentNativeController(
    _ controller: UIViewController,
    from root: UIViewController,
    completion: (() -> Void)? = nil
  ) {
    retainPresentedController(controller)
    root.present(controller, animated: true, completion: completion)
  }

  private func retainPresentedController(_ controller: UIViewController) {
    guard !activePresentedControllers.contains(where: { $0 === controller }) else {
      return
    }
    activePresentedControllers.append(controller)
  }

  func releasePresentedController(_ controller: UIViewController) {
    activePresentedControllers.removeAll { $0 === controller }
  }

  private func retainPicker(_ delegate: NativeDocumentPickerDelegate) {
    activePickerDelegates.append(delegate)
  }

  func releasePicker(_ delegate: NativeDocumentPickerDelegate) {
    activePickerDelegates.removeAll { $0 === delegate }
  }

  private func safeOriginalFilename(_ fileName: String) -> String {
    let trimmed = fileName.trimmingCharacters(in: .whitespacesAndNewlines)
    let fallback = trimmed.isEmpty ? "image" : trimmed
    return URL(fileURLWithPath: fallback).lastPathComponent
  }

  func releaseLifecycleSessions(reason: String) -> Int32 {
    return syncOnMain {
      let lifecycleReason = reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? "lifecycle_release"
        : reason

      if activeOtpScanId != nil {
        finishOtpQrScan(status: "cancelled", value: nil, message: "Native session released")
      }

      let pickerDelegates = activePickerDelegates
      activePickerDelegates.removeAll()
      for delegate in pickerDelegates {
        delegate.cancelForLifecycleRelease()
      }

      let audioSessions = Array(activeAudioSessions.values)
      activeAudioSessions.removeAll()
      for session in audioSessions {
        session.stop(reason: lifecycleReason)
      }

      let videoSessions = Array(activeVideoSessions.values)
      activeVideoSessions.removeAll()
      for session in videoSessions {
        session.stop()
      }

      for controller in activePresentedControllers {
        controller.dismiss(animated: false)
      }
      activePresentedControllers.removeAll()

      for controller in activeDocumentControllers {
        controller.dismissPreview(animated: false)
        controller.dismissMenu(animated: false)
      }
      activeDocumentControllers.removeAll()

      deactivateNativeAudioRemoteControls(nativeSessionId: nil)
      return 1
    }
  }
}

extension ChromVoidNativeBridgeRuntime: AVCaptureMetadataOutputObjectsDelegate {
  func metadataOutput(
    _ output: AVCaptureMetadataOutput,
    didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    guard activeOtpScanId != nil else {
      return
    }
    for object in metadataObjects {
      guard
        let readable = object as? AVMetadataMachineReadableCodeObject,
        readable.type == .qr,
        let value = readable.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
        !value.isEmpty
      else {
        continue
      }
      finishOtpQrScan(status: "success", value: value, message: nil)
      return
    }
  }
}

private enum NativeBridgeError: Error {
  case appGroupUnavailable
  case nativeAudioSourceUnavailable
}

private func withOptionalCString<T>(
  _ value: String?,
  _ body: (UnsafePointer<CChar>?) -> T
) -> T {
  guard let value else {
    return body(nil)
  }
  return value.withCString(body)
}

private func syncOnMain<T>(_ body: () -> T) -> T {
  if Thread.isMainThread {
    return body()
  }
  return DispatchQueue.main.sync(execute: body)
}

final class IosNativeBridgePlugin: Plugin {
  override func load(webview: WKWebView) {
    super.load(webview: webview)
    ChromVoidNativeBridgeRuntime.shared.setRootViewController(manager.viewController)
    NSLog("ios_native_bridge: native bridge loaded")
  }
}

@_cdecl("chromvoid_ios_native_open_file")
func chromvoidIosNativeOpenFile(
  _ pathPtr: UnsafePointer<CChar>?,
  _ mimeTypePtr: UnsafePointer<CChar>?
) -> Int32 {
  guard let pathPtr else {
    return 0
  }

  let path = String(cString: pathPtr)
  let mimeType = mimeTypePtr.map { String(cString: $0) }
  return ChromVoidNativeBridgeRuntime.shared.openFile(path: path, mimeType: mimeType)
}

@_cdecl("chromvoid_ios_native_share_files")
func chromvoidIosNativeShareFiles(_ payloadPtr: UnsafePointer<CChar>?) -> Int32 {
  guard
    let payloadPtr,
    let data = String(cString: payloadPtr).data(using: .utf8),
    let items = try? JSONDecoder().decode([NativeShareFile].self, from: data)
  else {
    return 0
  }

  return ChromVoidNativeBridgeRuntime.shared.shareFiles(items)
}

@_cdecl("chromvoid_ios_native_open_app_settings")
func chromvoidIosNativeOpenAppSettings() -> Int32 {
  return ChromVoidNativeBridgeRuntime.shared.openAppSettings()
}

@_cdecl("chromvoid_ios_native_export_backup_path")
func chromvoidIosNativeExportBackupPath(_ pathPtr: UnsafePointer<CChar>?) -> Int32 {
  guard let pathPtr else {
    return 0
  }

  return ChromVoidNativeBridgeRuntime.shared.exportBackup(path: String(cString: pathPtr))
}

@_cdecl("chromvoid_ios_native_pick_upload_files")
func chromvoidIosNativePickUploadFiles(_ uploadIdPtr: UnsafePointer<CChar>?) -> Int32 {
  guard let uploadIdPtr else {
    return 0
  }

  return ChromVoidNativeBridgeRuntime.shared.pickUploadFiles(uploadId: String(cString: uploadIdPtr))
}

@_cdecl("chromvoid_ios_native_pick_restore_source")
func chromvoidIosNativePickRestoreSource(_ operationIdPtr: UnsafePointer<CChar>?) -> Int32 {
  guard let operationIdPtr else {
    return 0
  }

  return ChromVoidNativeBridgeRuntime.shared.pickRestoreSource(operationId: String(cString: operationIdPtr))
}

@_cdecl("chromvoid_ios_native_otp_qr_scan_start")
func chromvoidIosNativeOtpQrScanStart(_ scanIdPtr: UnsafePointer<CChar>?) -> Int32 {
  guard let scanIdPtr else {
    return 1
  }

  return ChromVoidNativeBridgeRuntime.shared.startOtpQrScan(scanId: String(cString: scanIdPtr))
}

@_cdecl("chromvoid_ios_native_otp_qr_scan_cancel")
func chromvoidIosNativeOtpQrScanCancel(_ scanIdPtr: UnsafePointer<CChar>?) -> Int32 {
  guard let scanIdPtr else {
    return 0
  }

  return ChromVoidNativeBridgeRuntime.shared.cancelOtpQrScan(scanId: String(cString: scanIdPtr))
}

@_cdecl("chromvoid_ios_native_audio_command")
func chromvoidIosNativeAudioCommand(_ payloadPtr: UnsafePointer<CChar>?) -> Int32 {
  guard let payloadPtr else {
    return 0
  }

  return ChromVoidNativeBridgeRuntime.shared.handleNativeAudioCommand(
    payloadJson: String(cString: payloadPtr)
  )
}

@_cdecl("chromvoid_ios_native_video_start")
func chromvoidIosNativeVideoStart(_ sourcePtr: UnsafePointer<CChar>?) -> Int32 {
  guard let sourcePtr else {
    return 0
  }

  return ChromVoidNativeBridgeRuntime.shared.startNativeVideo(sourceJson: String(cString: sourcePtr))
}

@_cdecl("chromvoid_ios_native_video_stop")
func chromvoidIosNativeVideoStop(_ tokenPtr: UnsafePointer<CChar>?) -> Int32 {
  guard let tokenPtr else {
    return 1
  }

  return ChromVoidNativeBridgeRuntime.shared.stopNativeVideo(token: String(cString: tokenPtr))
}

@_cdecl("chromvoid_ios_native_release_lifecycle_sessions")
func chromvoidIosNativeReleaseLifecycleSessions(_ reasonPtr: UnsafePointer<CChar>?) -> Int32 {
  let reason = reasonPtr.map { String(cString: $0) } ?? "lifecycle_release"
  return ChromVoidNativeBridgeRuntime.shared.releaseLifecycleSessions(reason: reason)
}

@_cdecl("chromvoid_ios_native_save_image_to_photos")
func chromvoidIosNativeSaveImageToPhotos(
  _ bytesPtr: UnsafePointer<UInt8>?,
  _ byteCount: Int,
  _ fileNamePtr: UnsafePointer<CChar>?,
  _ mimeTypePtr: UnsafePointer<CChar>?
) -> Int32 {
  guard let bytesPtr, byteCount > 0, let fileNamePtr else {
    return 0
  }

  let data = Data(bytes: bytesPtr, count: byteCount)
  let fileName = String(cString: fileNamePtr)
  let mimeType = mimeTypePtr.map { String(cString: $0) }
  return ChromVoidNativeBridgeRuntime.shared.saveImageToPhotos(
    data: data,
    fileName: fileName,
    mimeType: mimeType
  )
}

@_cdecl("init_plugin_ios_native_bridge")
func initPluginIosNativeBridge() -> Plugin {
  return IosNativeBridgePlugin()
}
