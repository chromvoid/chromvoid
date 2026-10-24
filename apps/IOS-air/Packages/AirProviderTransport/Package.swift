// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "AirProviderTransport",
  platforms: [.iOS(.v17)],
  products: [
    .library(name: "AirProviderTransport", type: .dynamic, targets: ["AirProviderTransport"])
  ],
  targets: [.target(name: "AirProviderTransport")]
)
