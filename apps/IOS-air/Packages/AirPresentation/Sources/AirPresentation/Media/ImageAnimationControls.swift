import SwiftUI

struct ImageAnimationControls: View {
  @AirLocalizedCopy private var copy
  var model: ImagePreviewModel

  var body: some View {
    if model.canAnimate {
      VStack(alignment: .leading, spacing: 8) {
        Button(action: model.togglePlayback) {
          Label(
            copy.text(model.isPlaying ? "Pause animation" : "Play animation"),
            systemImage: model.isPlaying ? "pause.fill" : "play.fill")
        }
        .buttonStyle(.bordered)
        if let issue = model.issue {
          Text(copy.text(issue)).font(.caption).foregroundStyle(.secondary)
        }
      }
    } else if model.firstFrameOnly {
      Text(copy.text("Showing the first frame of this image."))
        .font(.caption).foregroundStyle(.secondary)
    }
  }
}
