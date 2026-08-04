import {describe, expect, test} from 'bun:test'
import {
  findDeveloperIdApplicationIdentity,
  parseCodesignDetails,
  validateDistributionSignature,
  validateStableDevSignature,
} from './macos-signing.mjs'

const stableRequirement =
  'designated => identifier "com.chromvoid.app" and anchor apple generic and certificate leaf[subject.OU] = TEAM123'

function distributionDetails(overrides = {}) {
  return {
    identifier: 'com.chromvoid.app',
    signature: null,
    teamIdentifier: 'TEAM123',
    authorities: ['Developer ID Application: ChromVoid (TEAM123)', 'Developer ID Certification Authority'],
    ...overrides,
  }
}

describe('macOS signing validation', () => {
  test('parses code-signing metadata and selects Developer ID Application', () => {
    expect(
      parseCodesignDetails(`Identifier=com.chromvoid.app\nAuthority=Developer ID Application: ChromVoid (TEAM123)\nTeamIdentifier=TEAM123`),
    ).toEqual({
      identifier: 'com.chromvoid.app',
      signature: null,
      teamIdentifier: 'TEAM123',
      authorities: ['Developer ID Application: ChromVoid (TEAM123)'],
    })
    expect(
      findDeveloperIdApplicationIdentity(
        '  1) 0123456789ABCDEF0123456789ABCDEF01234567 "Developer ID Application: ChromVoid (TEAM123)"',
      ),
    ).toEqual({
      hash: '0123456789ABCDEF0123456789ABCDEF01234567',
      name: 'Developer ID Application: ChromVoid (TEAM123)',
    })
  })

  test('accepts a stable Developer ID distribution signature', () => {
    expect(
      validateDistributionSignature({
        details: distributionDetails(),
        requirement: stableRequirement,
        expectedIdentifier: 'com.chromvoid.app',
      }),
    ).toEqual([])
  })

  test.each([
    ['wrong identifier', distributionDetails({identifier: 'com.example.app'}), stableRequirement],
    ['ad-hoc signature', distributionDetails({signature: 'adhoc'}), stableRequirement],
    ['cdhash requirement', distributionDetails(), 'designated => cdhash H"ABCD"'],
    [
      'Apple Development identity',
      distributionDetails({authorities: ['Apple Development: ChromVoid (TEAM123)']}),
      stableRequirement,
    ],
  ])('rejects %s', (_label, details, requirement) => {
    expect(
      validateDistributionSignature({details, requirement, expectedIdentifier: 'com.chromvoid.app'}),
    ).not.toEqual([])
  })

  test('rejects Team ID drift and get-task-allow', () => {
    const errors = validateDistributionSignature({
      details: distributionDetails({teamIdentifier: 'OTHERTEAM'}),
      requirement: stableRequirement,
      entitlements:
        '<plist><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>',
      expectedIdentifier: 'com.chromvoid.app',
      expectedTeamIdentifier: 'TEAM123',
    })
    expect(errors.join(' ')).toContain('TeamIdentifier')
    expect(errors.join(' ')).toContain('get-task-allow')
  })

  test('rejects unstable development signatures', () => {
    const details = parseCodesignDetails('Identifier=com.chromvoid.app.dev\nSignature=adhoc')
    expect(validateStableDevSignature({details, requirement: 'designated => cdhash H"ABCD"'})).not.toEqual(
      [],
    )
  })
})
