/// The same inactivity choices as the existing client. Zero leaves background locking intact.
public enum AutoLockTimeout: Int, CaseIterable, Sendable {
  case never = 0
  case oneMinute = 60
  case fiveMinutes = 300
  case fifteenMinutes = 900
  case thirtyMinutes = 1800
  case oneHour = 3600

  var label: String {
    switch self {
    case .never: "Never"
    case .oneMinute: "1 minute"
    case .fiveMinutes: "5 minutes"
    case .fifteenMinutes: "15 minutes"
    case .thirtyMinutes: "30 minutes"
    case .oneHour: "1 hour"
    }
  }
}
