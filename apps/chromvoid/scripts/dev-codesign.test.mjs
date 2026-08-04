import {describe, expect, test} from 'bun:test'
import {
  DEV_APP_IDENTIFIER,
  DEV_SIGNING_IDENTITY,
  resolveDevSigningEnvironment,
} from './macos-signing.mjs'

const identityOutput = `  1) 0123456789ABCDEF0123456789ABCDEF01234567 "${DEV_SIGNING_IDENTITY}"`

describe('macOS development signing preflight', () => {
  test('requires the stable development identity on macOS', () => {
    expect(() =>
      resolveDevSigningEnvironment({
        platform: 'darwin',
        env: {},
        identityOutput: '0 valid identities found',
        linkerPath: '/repo/codesign-linker.sh',
      }),
    ).toThrow('bun run setup:dev-signing')
  })

  test('makes stable signing the default for both macOS Rust targets', () => {
    const env = resolveDevSigningEnvironment({
      platform: 'darwin',
      env: {KEEP: 'yes'},
      identityOutput,
      linkerPath: '/repo/codesign-linker.sh',
    })

    expect(env).toMatchObject({
      KEEP: 'yes',
      CODESIGN_IDENTITY: DEV_SIGNING_IDENTITY,
      CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER: '/repo/codesign-linker.sh',
      CARGO_TARGET_X86_64_APPLE_DARWIN_LINKER: '/repo/codesign-linker.sh',
    })
    expect(DEV_APP_IDENTIFIER).toBe('com.chromvoid.app.dev')
  })

  test('does not alter non-macOS development environments', () => {
    expect(
      resolveDevSigningEnvironment({
        platform: 'linux',
        env: {KEEP: 'yes'},
        identityOutput: '',
        linkerPath: '/unused',
      }),
    ).toEqual({KEEP: 'yes'})
  })
})
