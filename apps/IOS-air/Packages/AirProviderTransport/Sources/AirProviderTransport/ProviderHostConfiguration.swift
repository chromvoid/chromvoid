import Foundation

public enum ProviderHostConfiguration {
  /// Resolve only the actual host's isolated development group, never a production group.
  public static func serviceName() -> String? {
    guard let identity = Bundle.main.bundleIdentifier,
      identity.hasPrefix("com.chromvoid.iosair.dev"),
      let group = Bundle.main.object(forInfoDictionaryKey: "AirProviderAppGroup") as? String,
      group == "group.\(identity).provider",
      FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil
    else { return nil }
    return "\(group).requests"
  }
}
