import {access, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import os from 'node:os'
import {build} from 'esbuild'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDir, '..')

async function bundle(entrySource, outdir, name) {
  await mkdir(outdir, {recursive: true})
  const entryFile = path.join(outdir, `${name}.js`)
  const outfile = path.join(outdir, `${name}.bundle.js`)
  await writeFile(entryFile, entrySource)

  await build({
    absWorkingDir: packageRoot,
    bundle: true,
    entryPoints: [entryFile],
    conditions: ['browser'],
    external: ['crypto', 'kdbxweb', 'xmldom'],
    format: 'esm',
    mainFields: ['browser', 'module', 'main'],
    minify: true,
    outfile,
    platform: 'browser',
    target: 'es2022',
    treeShaking: true,
    write: true,
  })
}

async function main() {
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  const typeTargets = [
    packageJson.exports['.'].types,
    packageJson.exports['./types'].types,
    packageJson.exports['./validation'].types,
    packageJson.exports['./conflicts'].types,
    packageJson.exports['./mapper'].types,
    packageJson.exports['./parsers'].types,
    packageJson.exports['./parsers/1password'].types,
    packageJson.exports['./parsers/csv'].types,
    packageJson.exports['./parsers/bitwarden'].types,
    packageJson.exports['./parsers/keepass'].types,
    packageJson.exports['./ui/import-dialog'].types,
    packageJson.exports['./ui/import-dialog-state'].types,
    packageJson.exports['./ui/mobile-file-picker-lifecycle'].types,
    packageJson.exports['./ui/file-accept'].types,
  ]

  for (const target of typeTargets) {
    const fullPath = path.join(packageRoot, target)
    await access(fullPath)
    console.log(`[exports] types: ${fullPath}`)
  }

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'password-import-exports-smoke-'))

  try {
    await bundle(`import {ImportOrchestrator} from '${path.join(packageRoot, 'dist', 'index.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof ImportOrchestrator)\n`, tmpRoot, 'root')
    await bundle(`import {ImportOrchestrator} from '${path.join(packageRoot, 'dist', 'mapper.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof ImportOrchestrator)\n`, tmpRoot, 'mapper')
    await bundle(`import {notifyMobileFilePickerLifecycleStart} from '${path.join(packageRoot, 'dist', 'ui', 'mobile-file-picker-lifecycle.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof notifyMobileFilePickerLifecycleStart)\n`, tmpRoot, 'lifecycle')
    await bundle(`import {ImportDialog} from '${path.join(packageRoot, 'dist', 'ui', 'import-dialog.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof ImportDialog)\n`, tmpRoot, 'dialog')
    await bundle(`import {setImportCatalogOps} from '${path.join(packageRoot, 'dist', 'ui', 'import-dialog-state.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof setImportCatalogOps)\n`, tmpRoot, 'dialog-state')
    await bundle(`import {parseCSV} from '${path.join(packageRoot, 'dist', 'parsers', 'index.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof parseCSV)\n`, tmpRoot, 'parsers')
    await bundle(`import {parse1Password1PUX} from '${path.join(packageRoot, 'dist', 'parsers', '1password.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof parse1Password1PUX)\n`, tmpRoot, 'parsers-1password')
  } finally {
    await rm(tmpRoot, {recursive: true, force: true})
  }

  console.log('[exports] package export smoke passed')
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
