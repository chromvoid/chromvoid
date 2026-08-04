import {describe, expect, test} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  assertConfiguredExternalBuildStorageAvailable,
  resolveMacosVolumeRoot,
} from './external-build-storage.mjs'

describe('external build storage preflight', () => {
  test('reports a disconnected macOS build volume before the build starts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chromvoid-external-build-storage-'))
    const configuredPath = path.join(root, 'dist')
    const targetPath = '/Volumes/DisconnectedDevSSD/project/dist'
    fs.symlinkSync(targetPath, configuredPath)

    try {
      expect(() => assertConfiguredExternalBuildStorageAvailable([configuredPath], 'darwin')).toThrow(
        'External build volume "DisconnectedDevSSD" is unavailable',
      )
    } finally {
      fs.rmSync(root, {recursive: true, force: true})
    }
  })

  test('ignores ordinary local build directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chromvoid-local-build-storage-'))

    try {
      expect(() => assertConfiguredExternalBuildStorageAvailable([root], 'darwin')).not.toThrow()
    } finally {
      fs.rmSync(root, {recursive: true, force: true})
    }
  })

  test('resolves the mount root for a macOS volume target', () => {
    expect(resolveMacosVolumeRoot('/Volumes/DevSSD/Dev/project/dist')).toBe('/Volumes/DevSSD')
    expect(resolveMacosVolumeRoot('/Users/example/project/dist')).toBeNull()
  })
})
