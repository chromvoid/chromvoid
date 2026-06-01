// swift-tools-version:5.3

import PackageDescription

let package = Package(
  name: "tauri-plugin-ios-native-bridge",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v14),
  ],
  products: [
    .library(
      name: "tauri-plugin-ios-native-bridge",
      type: .static,
      targets: ["tauri-plugin-ios-native-bridge"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-ios-native-bridge",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
