import {access, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {build} from 'vite'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))

if (manifest.exports?.['.']) {
  throw new Error('@project/theme must not expose a bare entrypoint')
}

for (const [name, target] of Object.entries(manifest.exports ?? {})) {
  if (name === './package.json') continue
  if (typeof target !== 'string' || !target.endsWith('.css')) {
    throw new Error(`Invalid CSS export ${name}`)
  }
  await access(path.join(packageRoot, target))
}

const fixtureRoot = await mkdtemp(path.join(packageRoot, '.vite-fixture-'))
try {
  await writeFile(
    path.join(fixtureRoot, 'index.html'),
    '<script type="module" src="/entry.js"></script>',
  )
  await writeFile(path.join(fixtureRoot, 'entry.js'), "import '@project/theme/webview.css'\n")
  await build({
    root: fixtureRoot,
    logLevel: 'silent',
    resolve: {
      alias: {
        '@project/theme/webview.css': path.join(packageRoot, manifest.exports['./webview.css']),
      },
    },
  })
} finally {
  await rm(fixtureRoot, {recursive: true, force: true})
}

console.log('[theme:exports] passed')
