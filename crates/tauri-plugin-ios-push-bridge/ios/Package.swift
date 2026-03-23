// swift-tools-version:5.3

import PackageDescription

let package = Package(
  name: "tauri-plugin-ios-push-bridge",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v13),
  ],
  products: [
    .library(
      name: "tauri-plugin-ios-push-bridge",
      type: .static,
      targets: ["tauri-plugin-ios-push-bridge"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-ios-push-bridge",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
