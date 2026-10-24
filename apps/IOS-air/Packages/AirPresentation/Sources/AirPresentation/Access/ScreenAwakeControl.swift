import UIKit

@MainActor
public protocol ScreenAwakeControlling {
  func setAwake(_ awake: Bool)
}

/// The application coordinator is the sole owner of this process-wide UIKit setting.
@MainActor
public final class SystemScreenAwakeControl: ScreenAwakeControlling {
  public init() {}
  public func setAwake(_ awake: Bool) {
    UIApplication.shared.isIdleTimerDisabled = awake
  }
}
