import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDir, '..')
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'password-import-bundle-contract-'))

const lifecycleEntry = path.join(tmpRoot, 'lifecycle-entry.js')
const stateEntry = path.join(tmpRoot, 'state-entry.js')
const dialogEntry = path.join(tmpRoot, 'dialog-entry.js')
const lifecycleOut = path.join(tmpRoot, 'lifecycle-out')
const stateOut = path.join(tmpRoot, 'state-out')
const dialogOut = path.join(tmpRoot, 'dialog-out')

const lifecycleImportPath = path.join(packageRoot, 'dist', 'ui', 'mobile-file-picker-lifecycle.js').replaceAll(path.sep, '/')
const stateImportPath = path.join(packageRoot, 'dist', 'ui', 'import-dialog-state.js').replaceAll(path.sep, '/')
const dialogImportPath = path.join(packageRoot, 'dist', 'ui', 'import-dialog.js').replaceAll(path.sep, '/')

async function bundle(entryFile, outdir) {
  await mkdir(outdir, {recursive: true})
  const outfile = path.join(outdir, path.basename(entryFile))

  await build({
    absWorkingDir: packageRoot,
    bundle: true,
    entryPoints: [entryFile],
    conditions: ['browser'],
    format: 'esm',
    mainFields: ['browser', 'module', 'main'],
    minify: true,
    outfile,
    platform: 'browser',
    target: 'es2022',
    treeShaking: true,
    write: true,
  })

  return readFile(outfile, 'utf8')
}

await writeFile(
  lifecycleEntry,
  `import {notifyMobileFilePickerLifecycleStart} from '${lifecycleImportPath}';\nconsole.log(typeof notifyMobileFilePickerLifecycleStart)\n`,
)
await writeFile(
  stateEntry,
  `import {setImportCatalogOps} from '${stateImportPath}';\nconsole.log(typeof setImportCatalogOps)\n`,
)
await writeFile(dialogEntry, `import {ImportDialog} from '${dialogImportPath}';\nconsole.log(ImportDialog.name)\n`)

try {
  const lifecycleBundle = await bundle(lifecycleEntry, lifecycleOut)
  const stateBundle = await bundle(stateEntry, stateOut)
  const dialogSource = await readFile(path.join(packageRoot, 'dist', 'ui', 'import-dialog.js'), 'utf8')

  for (const marker of ['kdbxweb', 'xmldom', 'pm-import-dialog', 'ImportDialog']) {
    if (lifecycleBundle.includes(marker)) {
      throw new Error(`Lifecycle bundle pulled unrelated marker: ${marker}`)
    }
  }

  for (const marker of ['kdbxweb', 'xmldom', 'ImportDialog', 'pm-import-dialog']) {
    if (stateBundle.includes(marker)) {
      throw new Error(`Dialog state bundle pulled unrelated marker: ${marker}`)
    }
  }

  for (const marker of [
    "from '../parsers/keepass.js'",
    "from '../parsers/csv.js'",
    "from '../parsers/bitwarden.js'",
    "from '../parsers/1password.js'",
  ]) {
    if (dialogSource.includes(marker)) {
      throw new Error(`Dialog source still contains static parser import: ${marker}`)
    }
  }

  if (!dialogSource.includes("import('../parsers/keepass.js')")) {
    throw new Error('Expected ImportDialog source to keep the lazy KeePass import')
  }

  console.log('[bundle] bundle contract passed')
} finally {
  await rm(tmpRoot, {recursive: true, force: true})
}
