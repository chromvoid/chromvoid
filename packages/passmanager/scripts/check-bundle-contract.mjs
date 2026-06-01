import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDir, '..')
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'passmanager-bundle-contract-'))

const i18nEntry = path.join(tmpRoot, 'i18n-entry.js')
const utilsEntry = path.join(tmpRoot, 'utils-entry.js')
const constsEntry = path.join(tmpRoot, 'consts-entry.js')
const i18nOut = path.join(tmpRoot, 'i18n-out')
const utilsOut = path.join(tmpRoot, 'utils-out')
const constsOut = path.join(tmpRoot, 'consts-out')

const i18nImportPath = path.join(packageRoot, 'dist', 'i18n', 'index.js').replaceAll(path.sep, '/')
const utilsImportPath = path.join(packageRoot, 'dist', 'password-utils.js').replaceAll(path.sep, '/')
const constsImportPath = path.join(packageRoot, 'dist', 'consts.js').replaceAll(path.sep, '/')

async function bundle(entryFile, outdir) {
  await mkdir(outdir, {recursive: true})
  const outfile = path.join(outdir, path.basename(entryFile))

  await build({
    absWorkingDir: packageRoot,
    bundle: true,
    entryPoints: [entryFile],
    format: 'esm',
    minify: true,
    outfile,
    platform: 'browser',
    target: 'es2022',
    treeShaking: true,
    write: true,
  })

  return readFile(outfile, 'utf8')
}

await writeFile(i18nEntry, `import {i18n} from '${i18nImportPath}';\nconsole.log(typeof i18n)\n`)
await writeFile(
  utilsEntry,
  `import {copyWithAutoWipe, DEFAULT_SECRET_REVEAL_MS} from '${utilsImportPath}';\nconsole.log(typeof copyWithAutoWipe, DEFAULT_SECRET_REVEAL_MS)\n`,
)
await writeFile(constsEntry, `import {SAVE_KEY} from '${constsImportPath}';\nconsole.log(SAVE_KEY)\n`)

try {
  const i18nBundle = await bundle(i18nEntry, i18nOut)
  const utilsBundle = await bundle(utilsEntry, utilsOut)
  const constsBundle = await bundle(constsEntry, constsOut)

  for (const marker of ['ManagerRoot', 'class Entry', 'uuid']) {
    if (i18nBundle.includes(marker)) {
      throw new Error(`I18n bundle pulled unrelated marker: ${marker}`)
    }
  }

  if (utilsBundle.includes('setInterval')) {
    throw new Error('Password utils bundle pulled timer side effect')
  }

  for (const marker of ['ManagerRoot', 'Entry']) {
    if (constsBundle.includes(marker)) {
      throw new Error(`Consts bundle pulled unrelated marker: ${marker}`)
    }
  }

  console.log('[bundle] bundle contract passed')
} finally {
  await rm(tmpRoot, {recursive: true, force: true})
}
