import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {build} from 'vite'

import {createExtensionBuildConfig, type ExtensionEntry} from '../vite.config.js'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url))
const entry: ExtensionEntry = {
  entry: join(projectRoot, 'tests', 'popup-fixture.entry.ts'),
  fileName: 'popup-fixture.js',
  globalName: 'ChromVoidPopupFixture',
}
const config = createExtensionBuildConfig(entry, {watch: false})

config.build = {
  ...config.build,
  emptyOutDir: true,
  outDir: join(workspaceRoot, 'output', 'playwright', 'browser-extension-fixture'),
}

await build(config)
