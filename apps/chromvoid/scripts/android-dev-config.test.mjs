import {describe, expect, test} from 'bun:test'
import fs from 'node:fs'

import {createAndroidDevConfigOverlay} from './android-dev-config.mjs'

describe('createAndroidDevConfigOverlay', () => {
  test('keeps the Android namespace identifier while preserving dev settings', () => {
    const devConfig = {
      productName: 'ChromVoid Dev',
      identifier: 'com.chromvoid.app.dev',
      app: {
        security: {
          capabilities: ['main-window-dev', 'mobile-dev'],
        },
      },
    }

    const overlay = createAndroidDevConfigOverlay({identifier: 'com.chromvoid.app'}, devConfig)

    expect(overlay).toEqual({
      ...devConfig,
      identifier: 'com.chromvoid.app',
    })
    expect(devConfig.identifier).toBe('com.chromvoid.app.dev')
  })

  test('rejects a missing base identifier', () => {
    expect(() => createAndroidDevConfigOverlay({}, {})).toThrow('base Tauri config must define an identifier')
  })

  test('keeps the repository dev identifier aligned with the Android debug suffix', () => {
    const baseConfig = JSON.parse(
      fs.readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
    )
    const devConfig = JSON.parse(
      fs.readFileSync(new URL('../src-tauri/tauri.dev.conf.json', import.meta.url), 'utf8'),
    )
    const debugSuffix = baseConfig.bundle.android.debugApplicationIdSuffix

    expect(devConfig.identifier).toBe(`${baseConfig.identifier}${debugSuffix}`)
    expect(createAndroidDevConfigOverlay(baseConfig, devConfig).identifier).toBe(baseConfig.identifier)
  })

  test('routes android:dev through the packaged WebView build mode', () => {
    const packageConfig = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const devScript = packageConfig.scripts['android:dev']

    expect(devScript).toContain('CHROMVOID_ANDROID_DEV_BUILD=1')
    expect(devScript).not.toContain('CHROMVOID_ANDROID_LIVE_DEV')
    expect(devScript).not.toContain('tauri android dev')
  })
})
