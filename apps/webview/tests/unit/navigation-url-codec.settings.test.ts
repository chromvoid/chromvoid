import {describe, expect, it} from 'vitest'

import {
  decodeNavigationSnapshotFromUrl,
  encodeNavigationSnapshotToUrl,
} from '../../src/app/navigation/navigation-url-codec'

describe('Settings navigation URL codec', () => {
  it.each([
    'security',
    'autofill',
    'files',
    'passwords',
    'license',
    'vault-rekey',
    'password-import',
  ] as const)('round-trips the %s route', (kind) => {
    const url = encodeNavigationSnapshotToUrl(
      {surface: 'settings', settings: {kind}, overlay: {kind: 'none'}},
      'https://chromvoid.local/dashboard?layout=mobile',
    )

    expect(new URL(url).searchParams.get('settings')).toBe(kind)
    expect(decodeNavigationSnapshotFromUrl(url)).toEqual({
      surface: 'settings',
      settings: {kind},
      overlay: {kind: 'none'},
    })
  })

  it('uses overview for a missing or unknown route and omits it from canonical URLs', () => {
    expect(
      decodeNavigationSnapshotFromUrl(
        'https://chromvoid.local/dashboard?surface=settings&settings=unknown',
      ),
    ).toEqual({
      surface: 'settings',
      settings: {kind: 'overview'},
      overlay: {kind: 'none'},
    })

    const url = encodeNavigationSnapshotToUrl(
      {surface: 'settings', settings: {kind: 'overview'}, overlay: {kind: 'none'}},
      'https://chromvoid.local/dashboard?layout=mobile&settings=security',
    )
    expect(new URL(url).searchParams.has('settings')).toBe(false)

    const implicitOverviewUrl = encodeNavigationSnapshotToUrl(
      {surface: 'settings', overlay: {kind: 'none'}},
      'https://chromvoid.local/dashboard?layout=mobile&settings=security',
    )
    expect(new URL(implicitOverviewUrl).searchParams.has('settings')).toBe(false)
  })
})
