#!/bin/bash
# Sets up a local "ChromVoid Dev" code-signing certificate so that
# macOS Keychain stops prompting for a password on every recompile.
#
# Run once on a fresh machine:
#   bash scripts/setup-dev-codesign.sh
#
# After setup, the standard `bun run dev` command signs automatically.

set -euo pipefail

IDENTITY="ChromVoid Dev"
TMPDIR_CERT="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_CERT"' EXIT

# ── 1. Check if the identity already exists ──────────────────────────

if security find-identity -v -p codesigning 2>/dev/null | grep -q "\"$IDENTITY\""; then
    echo "✓ Code-signing identity \"$IDENTITY\" already exists."
else
    echo "Setting up \"$IDENTITY\" code-signing certificate …"

# ── 2. Generate a self-signed certificate ────────────────────────────

cat > "$TMPDIR_CERT/cert.conf" << 'CONF'
[req]
distinguished_name = req_dn
x509_extensions    = codesign_ext
prompt             = no

[req_dn]
CN = ChromVoid Dev

[codesign_ext]
keyUsage         = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
CONF

openssl req -x509 -newkey rsa:2048 \
    -keyout "$TMPDIR_CERT/key.pem" \
    -out    "$TMPDIR_CERT/cert.pem" \
    -days 3650 -nodes \
    -config "$TMPDIR_CERT/cert.conf" \
    2>/dev/null

# ── 3. Package as PKCS#12 and import into login keychain ────────────

openssl pkcs12 -export \
    -out    "$TMPDIR_CERT/cert.p12" \
    -inkey  "$TMPDIR_CERT/key.pem" \
    -in     "$TMPDIR_CERT/cert.pem" \
    -passout pass:chromvoid \
    -legacy 2>/dev/null

security import "$TMPDIR_CERT/cert.p12" \
    -k ~/Library/Keychains/login.keychain-db \
    -T /usr/bin/codesign \
    -P "chromvoid"

# ── 4. Trust the certificate for code signing ────────────────────────

security add-trusted-cert -d -r trustRoot -p codeSign \
    -k ~/Library/Keychains/login.keychain-db \
    "$TMPDIR_CERT/cert.pem"
fi

# ── 5. Verify ────────────────────────────────────────────────────────

if ! security find-identity -v -p codesigning 2>/dev/null | grep -q "\"$IDENTITY\""; then
    echo "✗ Something went wrong — identity not found after import." >&2
    exit 1
fi

PROBE="$TMPDIR_CERT/chromvoid-dev-signing-probe"
printf '#!/bin/sh\nexit 0\n' > "$PROBE"
chmod 755 "$PROBE"
codesign --force --sign "$IDENTITY" --identifier com.chromvoid.app.dev --timestamp=none "$PROBE"
codesign --verify --strict --verbose=2 "$PROBE"
DETAILS="$(codesign -dv --verbose=4 "$PROBE" 2>&1)"
REQUIREMENT="$(codesign -d -r- "$PROBE" 2>&1)"
if ! grep -Fq 'Identifier=com.chromvoid.app.dev' <<<"$DETAILS" || \
   grep -Fqi 'Signature=adhoc' <<<"$DETAILS" || \
   [ -z "$REQUIREMENT" ] || \
   grep -Eqi '(^|[^[:alnum:]_])cdhash([^[:alnum:]_]|$)' <<<"$REQUIREMENT"; then
    echo "✗ Probe signature does not have a stable ChromVoid development identity." >&2
    exit 1
fi

echo "✓ Done. \"$IDENTITY\" is ready for stable development signing."
echo ""
echo "  Use:  bun run dev"
echo ""
echo "  Existing generic \"chromvoid\" storage access may prompt once; choose \"Always Allow\"."
echo "  Development USB pairing now uses a separate Keychain service and must be paired once again."
