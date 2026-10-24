# Contributing to ChromVoid

Thanks for helping improve ChromVoid.

ChromVoid is a local-first encrypted vault. Contributions should preserve the
project's security posture: secrets stay local or on user-controlled hosts,
browser integrations stay thin, and deniability-oriented behavior must be
described with clear threat-model limits.

## Before opening an issue

- For security vulnerabilities, do not open a public issue. Follow
  [SECURITY.md](SECURITY.md).
- For bugs, include the affected platform, build or commit, expected behavior,
  actual behavior, and reproduction steps.
- For feature requests, describe the user problem, the threat model or workflow,
  and any privacy or security tradeoffs.

## Before opening a pull request

- Keep changes focused on the reported issue or intended improvement.
- Use Bun for JavaScript and TypeScript tooling. The canonical lint command is
  `bun run lint`.
- Run the narrowest relevant checks for the area you touched.
- Do not include vault data, passwords, keys, tokens, logs with secrets, or
  production credentials in commits, issues, screenshots, or fixtures.
- Update documentation when behavior, setup, release process, or security
  boundaries change.

## Development notes

This repository is a monorepo. Technical setup and package-specific commands
live near the affected app, crate, package, or service.

High-level layout:

```text
apps/       Desktop app, WebView UI, browser extension, relay
backend/    Backend services, landing pages, blog, admin
crates/     Rust core, protocol, FUSE, CLI, platform bridges
packages/   Shared TypeScript packages and UI libraries
tests/      Integration and E2E tests
```

## Licensing

ChromVoid uses a mixed license model. By contributing, you agree that your
contribution is provided under the license terms that apply to the files you
change. See [LICENSING.md](LICENSING.md).
