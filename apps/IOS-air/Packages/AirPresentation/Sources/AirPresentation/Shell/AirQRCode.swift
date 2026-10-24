import CoreImage.CIFilterBuiltins
import SwiftUI

struct AirQRCode: View {
  let value: String
  var body: some View {
    if let image = image {
      Image(decorative: image, scale: 1)
        .interpolation(.none).resizable().scaledToFit()
        .frame(width: 200, height: 200)
        .padding(12).background(.white)
        .accessibilityHidden(true)
    }
  }
  private var image: CGImage? {
    let filter = CIFilter.qrCodeGenerator()
    filter.message = Data(value.utf8)
    guard let output = filter.outputImage else { return nil }
    return CIContext().createCGImage(output, from: output.extent)
  }
}
