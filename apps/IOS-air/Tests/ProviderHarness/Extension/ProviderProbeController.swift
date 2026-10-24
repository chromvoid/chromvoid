import AuthenticationServices
import OSLog
import UIKit

#if !AIR_FIXTURE
  #error("Provider probe is a fixture-only target")
#endif

/// Callback/lifecycle observation only. No shared carrier or privileged runtime exists here.
final class ProviderProbeController: ASCredentialProviderViewController {
  private let logger = Logger(
    subsystem: "com.chromvoid.iosair.dev.provider-harness", category: "provider")

  override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
    logger.notice("provider_list_callback")
    showUnavailable()
  }

  override func provideCredentialWithoutUserInteraction(
    for credentialIdentity: ASPasswordCredentialIdentity
  ) {
    logger.notice("provider_noninteractive_callback")
    extensionContext.cancelRequest(
      withError: NSError(
        domain: ASExtensionErrorDomain,
        code: ASExtensionError.userInteractionRequired.rawValue))
  }

  override func prepareInterfaceToProvideCredential(
    for credentialIdentity: ASPasswordCredentialIdentity
  ) {
    logger.notice("provider_interactive_callback")
    showUnavailable()
  }

  private func showUnavailable() {
    view.backgroundColor = .systemBackground
    let label = UILabel()
    label.text =
      "Air Provider Probe\n\nThe extension callback was observed. This lifecycle harness never supplies credentials. Return to the host app and inspect its background-lock observations."
    label.font = .preferredFont(forTextStyle: .body)
    label.adjustsFontForContentSizeCategory = true
    label.numberOfLines = 0
    let cancel = UIButton(type: .system)
    cancel.setTitle("Cancel", for: .normal)
    cancel.addTarget(self, action: #selector(cancelProbe), for: .touchUpInside)
    let stack = UIStackView(arrangedSubviews: [label, cancel])
    stack.axis = .vertical
    stack.spacing = 24
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
      stack.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor),
    ])
  }

  @objc private func cancelProbe() {
    extensionContext.cancelRequest(
      withError: NSError(
        domain: ASExtensionErrorDomain,
        code: ASExtensionError.userCanceled.rawValue))
  }
}
