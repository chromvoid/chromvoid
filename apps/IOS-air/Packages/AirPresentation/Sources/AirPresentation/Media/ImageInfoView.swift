import SwiftUI

/// Everything known about the open image: catalog facts, pixel data and the camera's own records.
struct ImageInfoView: View {
  @AirLocalizedCopy private var copy
  var model: ImagePreviewModel
  let dismiss: () -> Void

  var body: some View {
    NavigationStack {
      Form {
        Section(copy.text("Name")) { Text(verbatim: model.name) }
        if let path = model.catalog?.path {
          Section(copy.text("Location")) { Text(verbatim: path) }
        }
        Section(copy.text("Image")) {
          if let width = model.details?.pixelWidth, let height = model.details?.pixelHeight {
            row(copy.text("Dimensions"), "\(width) × \(height)", identifier: "imageDimensions")
          } else if model.details == nil {
            row(copy.text("Dimensions"), copy.text("Loading…"))
          }
          if let facts = model.catalog {
            row(copy.text("Size"), copy.byteCount(Int64(facts.size)))
            if let mime = facts.mimeType { row(copy.text("Type"), mime) }
          }
          if let color = model.details?.colorModel {
            let depth = model.details?.depth.map { " · \($0)-bit" } ?? ""
            row(copy.text("Color"), color + depth)
          }
        }
        Section(copy.text("Dates")) {
          if let taken = model.details?.taken {
            row(copy.text("Taken"), taken.formatted(date: .abbreviated, time: .shortened))
          }
          if let facts = model.catalog {
            row(copy.text("Added"), date(facts.createdAt))
            if facts.updatedAt != facts.createdAt {
              row(copy.text("Modified"), date(facts.updatedAt))
            }
          }
        }
        if let details = model.details, details.hasCamera { camera(details) }
        if let details = model.details, let latitude = details.latitude,
          let longitude = details.longitude
        {
          Section(copy.text("Place")) {
            row(
              copy.text("Coordinates"), coordinates(latitude, longitude),
              identifier: "imageCoordinates")
          }
        }
      }
      .airCanvas()
      .task { model.loadDetails() }
      .navigationTitle(copy.text("Image information"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(copy.text("Done"), action: dismiss).accessibilityIdentifier("closeImageInfo")
        }
      }
    }
    .privacySensitive()
  }

  private func camera(_ details: ImageDetails) -> some View {
    Section(copy.text("Camera")) {
      let device = [details.cameraMake, details.cameraModel].compactMap { $0 }
        .joined(separator: " ")
      if !device.isEmpty { row(copy.text("Device"), device) }
      if let lens = details.lens { row(copy.text("Lens"), lens) }
      let exposure = [
        details.focalLength.map { "\(Self.number($0)) mm" },
        details.fNumber.map { "ƒ/\(Self.number($0))" },
        details.exposureTime.map(Self.exposure),
        details.iso.map { "ISO \($0)" },
      ].compactMap { $0 }
      if !exposure.isEmpty { row(copy.text("Exposure"), exposure.joined(separator: " · ")) }
      if let software = details.software { row(copy.text("Software"), software) }
    }
  }

  private func row(_ label: String, _ value: String, identifier: String? = nil) -> some View {
    LabeledContent(label) {
      Text(verbatim: value).multilineTextAlignment(.trailing).textSelection(.enabled)
        .accessibilityIdentifier(identifier ?? "")
    }
  }

  private func date(_ milliseconds: Int) -> String {
    Date(timeIntervalSince1970: TimeInterval(milliseconds) / 1000)
      .formatted(date: .abbreviated, time: .shortened)
  }

  private func coordinates(_ latitude: Double, _ longitude: Double) -> String {
    let lat = String(format: "%.5f", abs(latitude)) + (latitude < 0 ? " S" : " N")
    let lon = String(format: "%.5f", abs(longitude)) + (longitude < 0 ? " W" : " E")
    return lat + ", " + lon
  }

  private static func number(_ value: Double) -> String {
    value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
  }

  private static func exposure(_ seconds: Double) -> String {
    guard seconds > 0 else { return "" }
    if seconds >= 1 { return "\(number(seconds)) s" }
    return "1/\(Int((1 / seconds).rounded())) s"
  }
}
