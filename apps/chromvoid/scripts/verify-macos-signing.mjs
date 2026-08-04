#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {
  DISTRIBUTION_APP_IDENTIFIER,
  assertNoSigningErrors,
  parseCodesignDetails,
  validateDistributionSignature,
} from './macos-signing.mjs'

function captureCodesign(args) {
  const result = spawnSync('codesign', args, {encoding: 'utf8'})
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`codesign ${args.join(' ')} exited with status ${result.status ?? 'unknown'}`)
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
}

function inspectArtifact(artifactPath) {
  return {
    details: parseCodesignDetails(captureCodesign(['-dv', '--verbose=4', artifactPath])),
    requirement: captureCodesign(['-d', '-r-', artifactPath]),
    entitlements: captureCodesign(['-d', '--entitlements', ':-', artifactPath]),
  }
}

export function verifyDistributionAppBundle(appBundle) {
  captureCodesign(['--verify', '--deep', '--strict', '--verbose=2', appBundle])

  const artifacts = [
    {label: 'main app', path: appBundle, identifier: DISTRIBUTION_APP_IDENTIFIER},
    {
      label: 'product CLI',
      path: path.join(appBundle, 'Contents', 'MacOS', 'chromvoid-agent'),
      identifier: 'com.chromvoid.cli',
    },
    {
      label: 'Credential Provider',
      path: path.join(appBundle, 'Contents', 'PlugIns', 'ChromVoidCredentialProvider.appex'),
      identifier: 'com.chromvoid.app.credential-provider',
    },
  ]

  for (const artifact of artifacts) {
    if (!fs.existsSync(artifact.path)) throw new Error(`${artifact.label} is missing: ${artifact.path}`)
  }

  const main = inspectArtifact(artifacts[0].path)
  assertNoSigningErrors(
    artifacts[0].label,
    validateDistributionSignature({
      ...main,
      expectedIdentifier: artifacts[0].identifier,
    }),
  )
  const teamIdentifier = main.details.teamIdentifier

  for (const artifact of artifacts.slice(1)) {
    const signature = inspectArtifact(artifact.path)
    assertNoSigningErrors(
      artifact.label,
      validateDistributionSignature({
        ...signature,
        expectedIdentifier: artifact.identifier,
        expectedTeamIdentifier: teamIdentifier,
      }),
    )
  }
}

const args = process.argv.slice(2)
const appIndex = args.indexOf('--app-bundle')
if (appIndex < 0 || !args[appIndex + 1]) {
  console.error('Usage: verify-macos-signing.mjs --app-bundle <ChromVoid.app>')
  process.exit(2)
}

try {
  verifyDistributionAppBundle(path.resolve(args[appIndex + 1]))
  console.log(`[macos-signing] verified Developer ID distribution bundle ${args[appIndex + 1]}`)
} catch (error) {
  console.error(`[macos-signing] ${error.message}`)
  process.exit(1)
}
