import SwiftUI

/// Offline guidance contains no runtime state or vault-derived content.
enum HelpTopic: String, CaseIterable, Identifiable {
  case passwords, storage, backups, connections

  var id: Self { self }

  var title: String {
    switch self {
    case .passwords: "Passwords and device authentication"
    case .storage: "Help with secure storage"
    case .backups: "Backups and recovery"
    case .connections: "Local and remote access"
    }
  }

  var symbol: String {
    switch self {
    case .passwords: "key.horizontal"
    case .storage: "lock.trianglebadge.exclamationmark"
    case .backups: "arrow.counterclockwise"
    case .connections: "point.3.connected.trianglepath.dotted"
    }
  }

  var paragraphs: [String] {
    switch self {
    case .passwords:
      [
        "Your vault password opens its private space. The administrative password protects device administration, backups and storage maintenance. These passwords serve different purposes.",
        "Optional device authentication protects entry to the app. Face ID, Touch ID or the device passcode does not replace your vault password.",
        "Keep both passwords safe. Changing a password does not update existing backups; they retain the passwords used when they were created.",
      ]
    case .storage:
      [
        "If protected storage is temporarily unavailable, unlock your device, return to ChromVoid Air and tap Try again.",
        "If the device key is unavailable, your stored data is preserved, but the app cannot open it without the required key. Repeating your vault password does not restore that key.",
        "Do not delete the app, erase local data or create new storage over the existing data to fix this error. Keep the original installation and any backups while you investigate storage access.",
      ]
    case .backups:
      [
        "Create a backup from Settings and keep the complete backup folder in a safe location. You need its administrative password to check and restore it, and the original vault password to open the restored vault.",
        "Restoration requires empty storage. The app checks the selected backup before asking you to confirm restoration. Older backups may also require the original device’s administrator data.",
        "Deleting local data is a separate destructive action. Do not erase your only copy of the data to troubleshoot access or prepare a restore.",
      ]
    case .connections:
      [
        "Local vault data belongs to this device. Remote access uses a paired host and the permissions granted by that host; it does not automatically create a local backup.",
        "A listening host and an open vault are different states. Pairing or connecting does not by itself unlock a vault or grant access to its contents.",
        "Use Connections to check the host and connection status. iOS may suspend the app in the background, so a connection is not a promise of continuous background availability.",
      ]
    }
  }
}

struct HelpView: View {
  @AirLocalizedCopy private var copy

  var body: some View {
    List(HelpTopic.allCases) { topic in
      NavigationLink {
        HelpTopicView(topic: topic)
      } label: {
        Label(copy.text(topic.title), systemImage: topic.symbol)
      }
      .accessibilityIdentifier("helpTopic-\(topic.rawValue)")
    }
    .airCanvas()
    .navigationTitle(copy.text("Help"))
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("helpScreen")
  }
}

struct HelpTopicView: View {
  @AirLocalizedCopy private var copy
  let topic: HelpTopic

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        Label(copy.text(topic.title), systemImage: topic.symbol)
          .font(.title2.bold())
          .accessibilityAddTraits(.isHeader)
        ForEach(topic.paragraphs, id: \.self) { paragraph in
          Text(copy.text(paragraph))
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      .padding(24)
      .frame(maxWidth: 640, alignment: .leading)
      .frame(maxWidth: .infinity)
    }
    .navigationTitle(copy.text("Help"))
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("helpDetail-\(topic.rawValue)")
  }
}
