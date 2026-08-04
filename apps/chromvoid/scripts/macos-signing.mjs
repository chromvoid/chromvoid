export const DEV_SIGNING_IDENTITY = 'ChromVoid Dev'
export const DEV_APP_IDENTIFIER = 'com.chromvoid.app.dev'
export const DISTRIBUTION_APP_IDENTIFIER = 'com.chromvoid.app'

export function parseCodeSigningIdentities(output) {
  return String(output)
    .split(/\r?\n/u)
    .map((line) => {
      const match = line.match(/^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"([^"]+)"/u)
      return match ? {hash: match[1], name: match[2]} : null
    })
    .filter(Boolean)
}

export function findCodeSigningIdentity(output, expectedName) {
  return parseCodeSigningIdentities(output).find(({name}) => name === expectedName) ?? null
}

export function findDeveloperIdApplicationIdentity(output) {
  return (
    parseCodeSigningIdentities(output).find(({name}) => name.startsWith('Developer ID Application:')) ??
    null
  )
}

export function resolveDevSigningEnvironment({platform, env, identityOutput, linkerPath}) {
  if (platform !== 'darwin') return {...env}
  if (!findCodeSigningIdentity(identityOutput, DEV_SIGNING_IDENTITY)) {
    throw new Error(
      `macOS development requires the "${DEV_SIGNING_IDENTITY}" code-signing identity. Run: bun run setup:dev-signing`,
    )
  }
  return {
    ...env,
    CODESIGN_IDENTITY: DEV_SIGNING_IDENTITY,
    CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER: linkerPath,
    CARGO_TARGET_X86_64_APPLE_DARWIN_LINKER: linkerPath,
  }
}

export function parseCodesignDetails(output) {
  const details = {identifier: null, signature: null, teamIdentifier: null, authorities: []}
  for (const line of String(output).split(/\r?\n/u)) {
    const separator = line.indexOf('=')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (key === 'Identifier') details.identifier = value
    if (key === 'Signature') details.signature = value
    if (key === 'TeamIdentifier') details.teamIdentifier = value === 'not set' ? null : value
    if (key === 'Authority') details.authorities.push(value)
  }
  return details
}

function commonSignatureErrors({details, requirement, expectedIdentifier}) {
  const errors = []
  if (details.identifier !== expectedIdentifier) {
    errors.push(`expected identifier ${expectedIdentifier}, got ${details.identifier ?? 'none'}`)
  }
  if (details.signature?.toLowerCase() === 'adhoc') errors.push('ad-hoc signature is forbidden')
  if (!requirement || /\bcdhash\b/iu.test(requirement)) {
    errors.push('designated requirement must be stable and must not depend on cdhash')
  }
  return errors
}

export function validateStableDevSignature({details, requirement}) {
  return commonSignatureErrors({details, requirement, expectedIdentifier: DEV_APP_IDENTIFIER})
}

export function hasGetTaskAllow(entitlements) {
  return /<key>\s*com\.apple\.security\.get-task-allow\s*<\/key>\s*<true\s*\/?>/iu.test(
    String(entitlements),
  )
}

export function validateDistributionSignature({
  details,
  requirement,
  entitlements = '',
  expectedIdentifier,
  expectedTeamIdentifier = null,
}) {
  const errors = commonSignatureErrors({details, requirement, expectedIdentifier})
  if (!details.authorities.some((authority) => authority.startsWith('Developer ID Application:'))) {
    errors.push('Developer ID Application signature is required')
  }
  if (!details.teamIdentifier) errors.push('TeamIdentifier is required')
  if (expectedTeamIdentifier && details.teamIdentifier !== expectedTeamIdentifier) {
    errors.push(`expected TeamIdentifier ${expectedTeamIdentifier}, got ${details.teamIdentifier ?? 'none'}`)
  }
  if (hasGetTaskAllow(entitlements)) errors.push('get-task-allow entitlement is forbidden')
  return errors
}

export function assertNoSigningErrors(label, errors) {
  if (errors.length > 0) throw new Error(`${label}: ${errors.join('; ')}`)
}
