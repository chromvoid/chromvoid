import Foundation
import ObjectiveC
import Tauri
import UIKit
import WebKit

@_silgen_name("chromvoid_ios_push_set_registration")
func chromvoid_ios_push_set_registration(
  _ deviceToken: UnsafePointer<CChar>,
  _ environment: UnsafePointer<CChar>,
  _ bundleId: UnsafePointer<CChar>
) -> Int32

@_silgen_name("chromvoid_ios_push_handle_notification")
func chromvoid_ios_push_handle_notification(_ payloadJson: UnsafePointer<CChar>) -> Int32

private let didRegisterSelector = #selector(
  UIApplicationDelegate.application(_:didRegisterForRemoteNotificationsWithDeviceToken:))
private let didFailSelector = #selector(
  UIApplicationDelegate.application(_:didFailToRegisterForRemoteNotificationsWithError:))
private let didReceiveSelector = #selector(
  UIApplicationDelegate.application(_:didReceiveRemoteNotification:fetchCompletionHandler:))

private final class ChromVoidPushDelegateProxy: NSObject {
  @objc func chromvoid_application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: NSData
  ) {
    ChromVoidPushRuntime.shared.forwardDeviceToken(deviceToken as Data)
  }

  @objc func chromvoid_application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: NSError
  ) {
    NSLog("ios_push_bridge: remote notification registration failed: \(error.localizedDescription)")
  }

  @objc func chromvoid_application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: NSDictionary,
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    if ChromVoidPushRuntime.shared.forwardRemoteNotification(userInfo as? [AnyHashable: Any] ?? [:]) {
      completionHandler(.newData)
    } else {
      completionHandler(.noData)
    }
  }
}

private final class ChromVoidPushRuntime {
  static let shared = ChromVoidPushRuntime()
  private let proxy = ChromVoidPushDelegateProxy()
  private var installed = false

  private init() {}

  func installIfNeeded() {
    guard !installed else { return }

    guard let delegate = UIApplication.shared.delegate else {
      NSLog("ios_push_bridge: UIApplication delegate unavailable")
      return
    }

    let delegateClass: AnyClass = type(of: delegate)
    installMethodIfMissing(
      on: delegateClass,
      original: didRegisterSelector,
      proxy: #selector(ChromVoidPushDelegateProxy.chromvoid_application(_:didRegisterForRemoteNotificationsWithDeviceToken:))
    )
    installMethodIfMissing(
      on: delegateClass,
      original: didFailSelector,
      proxy: #selector(ChromVoidPushDelegateProxy.chromvoid_application(_:didFailToRegisterForRemoteNotificationsWithError:))
    )
    installMethodIfMissing(
      on: delegateClass,
      original: didReceiveSelector,
      proxy: #selector(ChromVoidPushDelegateProxy.chromvoid_application(_:didReceiveRemoteNotification:fetchCompletionHandler:))
    )

    UIApplication.shared.registerForRemoteNotifications()
    installed = true
    NSLog("ios_push_bridge: remote notification bridge installed")
  }

  private func installMethodIfMissing(on delegateClass: AnyClass, original: Selector, proxy: Selector) {
    if class_getInstanceMethod(delegateClass, original) != nil {
      NSLog("ios_push_bridge: selector already present, leaving existing implementation for %@", NSStringFromSelector(original))
      return
    }

    guard let proxyMethod = class_getInstanceMethod(ChromVoidPushDelegateProxy.self, proxy) else {
      NSLog("ios_push_bridge: proxy method missing for %@", NSStringFromSelector(original))
      return
    }

    let added = class_addMethod(
      delegateClass,
      original,
      method_getImplementation(proxyMethod),
      method_getTypeEncoding(proxyMethod)
    )
    if !added {
      NSLog("ios_push_bridge: failed to add selector %@", NSStringFromSelector(original))
    }
  }

  func forwardDeviceToken(_ deviceToken: Data) {
    let token = deviceToken.map { String(format: "%02x", $0) }.joined()
    let environment = pushEnvironment()
    let bundleId = Bundle.main.bundleIdentifier ?? "com.chromvoid.app"

    token.withCString { tokenPtr in
      environment.withCString { environmentPtr in
        bundleId.withCString { bundleIdPtr in
          _ = chromvoid_ios_push_set_registration(tokenPtr, environmentPtr, bundleIdPtr)
        }
      }
    }
  }

  func forwardRemoteNotification(_ userInfo: [AnyHashable: Any]) -> Bool {
    guard
      let data = try? JSONSerialization.data(
        withJSONObject: jsonSafeObject(userInfo),
        options: [.sortedKeys]
      ),
      let payload = String(data: data, encoding: .utf8)
    else {
      return false
    }

    return payload.withCString { chromvoid_ios_push_handle_notification($0) != 0 }
  }

  private func pushEnvironment() -> String {
    #if DEBUG
      return "development"
    #else
      return "production"
    #endif
  }

  private func jsonSafeObject(_ value: Any) -> Any {
    if let map = value as? [AnyHashable: Any] {
      var out: [String: Any] = [:]
      for (key, item) in map {
        out[String(describing: key)] = jsonSafeObject(item)
      }
      return out
    }

    if let list = value as? [Any] {
      return list.map(jsonSafeObject)
    }

    if value is String || value is NSNumber || value is NSNull {
      return value
    }

    if let data = value as? Data {
      return data.base64EncodedString()
    }

    return String(describing: value)
  }
}

final class IosPushBridgePlugin: Plugin {
  override func load(webview: WKWebView) {
    super.load(webview: webview)
    DispatchQueue.main.async {
      ChromVoidPushRuntime.shared.installIfNeeded()
    }
  }
}

@_cdecl("init_plugin_ios_push_bridge")
func initPluginIosPushBridge() -> Plugin {
  return IosPushBridgePlugin()
}
