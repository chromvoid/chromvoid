import SwiftUI

extension Binding {
  /// A sheet or push driven by model state: the model owns the presented value and only ever
  /// hears about dismissal, so a stale `set(true)` from SwiftUI can never re-present.
  public static func presence<Presented>(
    _ read: @escaping () -> Presented?, close: @escaping () -> Void
  ) -> Binding<Presented?> where Value == Presented? {
    Binding<Presented?>(get: read, set: { if $0 == nil { close() } })
  }

  /// The boolean form of `presence` for pushes and sheets without a payload.
  public static func presented(_ read: @escaping () -> Bool, close: @escaping () -> Void)
    -> Binding<Bool> where Value == Bool
  {
    Binding<Bool>(get: read, set: { if !$0 { close() } })
  }
}
