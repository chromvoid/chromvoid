import AVKit
import SwiftUI

struct MediaPreviewView: View {
  @AirLocalizedCopy private var copy
  var model: MediaPreviewModel
  let dismiss: () -> Void
  let lock: () -> Void

  var body: some View {
    NavigationStack {
      Group {
        if let player = model.player {
          NativeMediaPlayer(player: player)
            .accessibilityIdentifier("mediaPlayer")
        } else if let issue = model.issue {
          VStack(spacing: 16) {
            Image(systemName: "play.slash").font(.largeTitle).foregroundStyle(.secondary)
            Text(copy.text(issue)).multilineTextAlignment(.center)
            Button(copy.text("Try again")) { model.load() }
          }.padding()
        } else {
          ProgressView(copy.text("Loading media…"))
        }
      }
      .navigationTitle(model.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(copy.text("Done"), action: dismiss).accessibilityIdentifier("closeMediaPreview")
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(action: lock) { Image(systemName: "lock") }
            .accessibilityLabel(copy.text("Lock vault"))
            .accessibilityIdentifier("lockMediaPreview")
        }
      }
    }
    .privacySensitive()
    .task { await model.load()?.value }
    .onDisappear { model.revoke() }
  }
}

private struct NativeMediaPlayer: UIViewControllerRepresentable {
  let player: AVPlayer

  func makeUIViewController(context: Context) -> AVPlayerViewController {
    let controller = AVPlayerViewController()
    controller.allowsPictureInPicturePlayback = false
    controller.updatesNowPlayingInfoCenter = false
    controller.player = player
    return controller
  }
  func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
    controller.player = player
  }
  static func dismantleUIViewController(_ controller: AVPlayerViewController, coordinator: Void) {
    controller.player?.pause()
    controller.player = nil
  }
}
