#!/usr/bin/env bash
# Shared paths for this checkout. Xcode's injected test libraries must be outside Documents.
AIR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$AIR_ROOT/../.." && pwd)"
AIR_CHECKOUT_KEY="$(printf '%s' "$REPO_ROOT" | shasum -a 256 | cut -c 1-12)"
AIR_DERIVED_ROOT="${TMPDIR:-/tmp}/chromvoid-ios-air-$AIR_CHECKOUT_KEY"
