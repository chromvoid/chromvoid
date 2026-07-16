# Security Policy

ChromVoid is a local-first encrypted vault for passwords, OTP data, notes, files,
passkeys, SSH keys, wallet secrets, and related secret workflows.

This repository contains the ChromVoid apps, Rust core, protocol code, shared UI
packages, browser extension, backend services, relay-adjacent code, release
tooling, and supporting infrastructure. This policy explains how to report
security issues affecting this repository or ChromVoid-operated services.

For the full published policy, see:

- https://chromvoid.com/en/legal/security-policy/
- https://chromvoid.com/en/threat-model/

## Reporting a Vulnerability

Please report suspected vulnerabilities privately. Do not open a public GitHub
issue, public pull request, discussion, social media thread, or public proof of
concept before coordinated disclosure is complete.

Use one of these channels:

- GitHub Security Advisories / private vulnerability reporting, if enabled for
  this repository.
- Email: legal@chromvoid.com

Email is the canonical contact channel. If you use GitHub private vulnerability
reporting, include an email address we can use for follow-up if needed.

Please include as much of the following as you can safely provide:

- Affected component, product, version, commit, platform, operating system,
  browser, service URL, or build channel.
- Vulnerability class and suspected impact.
- Clear reproduction steps.
- Proof of concept, screenshots, logs, traces, crash output, or network captures
  with secrets removed.
- Whether the issue affects vault confidentiality, vault integrity,
  authentication, authorization, remote transport confidentiality, license or
  payment integrity, service availability, or user privacy.
- Whether you accessed, changed, deleted, or exfiltrated any data, even
  accidentally.
- Your preferred contact address for follow-up.

Do not send vault passwords, master passwords, private keys, seed phrases, OTP
seeds, passkeys, decrypted vault contents, payment secrets, recovery material,
or other live secrets in a report.

If you accidentally access data that is not yours, stop testing immediately, do
not copy or share the data, and report the incident.

## Scope

In scope:

- ChromVoid desktop and mobile apps.
- ChromVoid WebView application UI.
- ChromVoid browser extensions.
- Rust core, protocol, CLI, FUSE, and platform bridge code.
- Backend services for licensing, accounts, checkout, payments, pricing, blog,
  admin, notifications, and landing/public pages.
- Relay, wake, remote-connectivity, sync-adjacent, and transport-related code.
- Release, signing, packaging, update, and public-repository sync workflows.
- Infrastructure configuration that can materially affect ChromVoid production
  security.
- Dependency and supply-chain reports with a reachable vulnerable code path or
  a clear release/build impact.

Usually out of scope unless you can show a concrete exploit path or material
ChromVoid-specific impact:

- Requests to recover a lost vault password, master password, key, recovery
  material, deleted local vault, or deleted local backup.
- Generic scanner output without reproduction details or exploitability
  analysis.
- Outdated dependency reports without a reachable vulnerable code path.
- Missing security headers on non-sensitive static marketing pages.
- Self-XSS, clipboard, screenshot, local-device, or browser-profile issues that
  require the user to run attacker-controlled code on their own compromised
  device without additional impact.
- Physical access attacks, rooted or jailbroken devices, compromised operating
  systems, compromised browsers, keyloggers, malicious accessibility services,
  screen recorders, firmware compromise, or malware outside ChromVoid's control.
- Weak user-chosen passwords or unsafe backup practices without a ChromVoid
  implementation flaw.
- Third-party platform, app-store, browser, payment-provider, push-provider,
  email-provider, hosting-provider, or operating-system issues not caused or
  materially amplified by ChromVoid.
- Denial-of-service, stress, load, resource-exhaustion, or destructive testing.

We still welcome concise reports if you are unsure whether an issue is in scope.

## Research Rules

You may test ChromVoid systems you own, accounts you control, local vaults you
created, and public endpoints only to the minimum extent needed to validate a
security issue.

Do not:

- Access, copy, change, delete, or exfiltrate data that is not yours.
- Run denial-of-service, stress, load, resource-exhaustion, or destructive tests.
- Attempt social engineering, phishing, spam, impersonation, or attacks against
  ChromVoid users, employees, contractors, providers, or third parties.
- Upload malware, ransomware, credential stealers, persistence tooling, or
  destructive payloads.
- Bypass licensing, payment, entitlement, or rate-limit controls except to the
  minimum extent necessary to demonstrate a legitimate vulnerability on assets
  you control.
- Continue testing after we ask you to stop because of operational, legal, or
  user-safety risk.
- Publish exploit details before coordinated disclosure is complete.

This policy does not authorize unlawful activity, access to third-party systems,
access to other users' data, or violations of app-store, platform, provider, or
network rules.

## Coordinated Disclosure

We ask security researchers to follow coordinated disclosure:

- We aim to acknowledge new reports within 3 business days.
- We aim to provide an initial triage response within 7 business days.
- We may ask for additional details, reproduction help, or validation of a
  proposed fix.
- We will provide status updates when there is meaningful progress or when the
  expected timeline changes.
- Public disclosure should happen only after a fix is released, a mitigation is
  available, or a disclosure timeline is mutually agreed.

Some issues may require more time because of app-store review, platform release
timing, cryptographic migration, third-party dependencies, legal obligations, or
user-safety concerns.

## Security Boundaries

ChromVoid is designed so vault contents stay local to user-controlled devices or
user-controlled hosts. ChromVoid-operated services are not intended to receive
vault passwords, master passwords, decrypted files, passkeys, private keys, seed
phrases, OTP seeds, local autofill secrets, or decrypted vault contents.

Important limitations:

- ChromVoid cannot decrypt a local vault for a user.
- Lost vault passwords, master passwords, keys, recovery material, or local
  backups may permanently prevent recovery.
- Relay and remote-connectivity infrastructure should be treated as
  payload-confidential but metadata-exposed when endpoint encryption is operating
  correctly.
- A compromised device, operating system, browser profile, input path,
  clipboard, firmware, or ChromVoid process can compromise secrets while a vault
  is unlocked.
- Deniability-oriented behavior is conditional and depends on the documented
  threat model, storage medium, platform behavior, and user operational habits.

## Rewards and Recognition

ChromVoid does not currently operate a public bug bounty program and does not
promise payment, rewards, swag, employment, or public credit for reports.

We may choose to thank researchers publicly when it is safe, lawful, and
mutually agreed, but disclosure credit is not guaranteed.
