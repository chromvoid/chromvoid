// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "AirPresentation",
  defaultLocalization: "en",
  platforms: [.iOS(.v17)],
  products: [.library(name: "AirPresentation", targets: ["AirPresentation"])],
  dependencies: [.package(path: "../ChromVoidBridge")],
  targets: [
    .target(
      name: "AirPresentation",
      dependencies: [.product(name: "ChromVoidBridge", package: "ChromVoidBridge")],
      resources: [.process("Resources")])
  ]
)
