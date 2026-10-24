// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "ChromVoidBridge",
  defaultLocalization: "en",
  platforms: [.iOS(.v17)],
  products: [
    .library(name: "ChromVoidBridge", targets: ["ChromVoidBridge"]),
    .library(name: "AirCredentialProvider", targets: ["AirCredentialProvider"]),
  ],
  dependencies: [.package(path: "../AirProviderTransport")],
  targets: [
    .target(
      name: "AirCredentialProvider",
      dependencies: [.product(name: "AirProviderTransport", package: "AirProviderTransport")],
      resources: [.process("Resources")]),
    .binaryTarget(name: "AirFFIFFI", path: ".artifacts/AirFFIFFI.xcframework"),
    .target(
      name: "ChromVoidBridge",
      dependencies: [
        "AirFFIFFI", .product(name: "AirProviderTransport", package: "AirProviderTransport"),
      ],
      resources: [.process("Resources")],
      linkerSettings: [
        .linkedFramework("CoreFoundation"), .linkedFramework("Security"),
        .linkedFramework("SystemConfiguration"),
      ]),
  ]
)
