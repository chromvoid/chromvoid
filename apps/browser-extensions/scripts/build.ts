import {existsSync, rmSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {build as viteBuild} from 'vite'

import {createExtensionBuildConfig, extensionEntries} from '../vite.config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const distDir = join(projectRoot, 'dist')
const isWatch = process.argv.includes('--watch')

async function run() {
  const watchers: Array<{close(): Promise<void> | void}> = []

  if (!isWatch && existsSync(distDir)) {
    rmSync(distDir, {recursive: true, force: true})
  }

  for (const entry of extensionEntries) {
    const result = await viteBuild(createExtensionBuildConfig(entry, {watch: isWatch}))

    if (isWatch) {
      const active = Array.isArray(result) ? result : [result]
      for (const item of active) {
        if (item && typeof item === 'object' && 'close' in item && typeof item.close === 'function') {
          watchers.push(item)
        }
      }
      console.log(`Watching ${entry.fileName}`)
      continue
    }

    console.log(`Built ${entry.fileName}`)
  }

  if (!isWatch) {
    console.log('\nBuild complete')
    return
  }

  const closeAll = async () => {
    await Promise.all(watchers.map((watcher) => watcher.close()))
    process.exit(0)
  }

  process.once('SIGINT', () => void closeAll())
  process.once('SIGTERM', () => void closeAll())

  await new Promise(() => {})
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
