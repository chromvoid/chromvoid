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
  const typeTargets = Object.values(packageJson.exports).flatMap((entry) => typeof entry === 'object' && entry.types ? [entry.types] : [])

  for (const target of typeTargets) {
    const fullPath = path.join(packageRoot, target)
    await access(fullPath)
    console.log(`[exports] types: ${fullPath}`)
  }

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'password-import-exports-smoke-'))

  try {
    await bundle(`import {CredentialImportService} from '${path.join(packageRoot, 'dist', 'index.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof CredentialImportService)\n`, tmpRoot, 'root')
    await bundle(`import {setLang} from '${path.join(packageRoot, 'dist', 'i18n.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof setLang)\n`, tmpRoot, 'i18n')
    await bundle(`import {hasCompletePasswordImportTranslations} from '${path.join(packageRoot, 'dist', 'i18n', 'availability.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof hasCompletePasswordImportTranslations)\n`, tmpRoot, 'i18n-availability')
    await bundle(`import {notifyMobileFilePickerLifecycleStart} from '${path.join(packageRoot, 'dist', 'ui', 'mobile-file-picker-lifecycle.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof notifyMobileFilePickerLifecycleStart)\n`, tmpRoot, 'lifecycle')
    await bundle(`import {ImportDialog} from '${path.join(packageRoot, 'dist', 'ui', 'import-dialog.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof ImportDialog)\n`, tmpRoot, 'dialog')
    await bundle(`import {setCredentialImportService} from '${path.join(packageRoot, 'dist', 'ui', 'import-dialog-state.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof setCredentialImportService)\n`, tmpRoot, 'dialog-state')
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
