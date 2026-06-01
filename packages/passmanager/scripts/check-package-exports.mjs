import {access, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
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
    external: ['@reatom/core'],
    format: 'esm',
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
    packageJson.exports['./core'].types,
    packageJson.exports['./types'].types,
    packageJson.exports['./ports'].types,
    packageJson.exports['./i18n'].types,
    packageJson.exports['./i18n/format'].types,
    packageJson.exports['./notify'].types,
    packageJson.exports['./dialog'].types,
    packageJson.exports['./select'].types,
    packageJson.exports['./tags'].types,
    packageJson.exports['./sorting'].types,
    packageJson.exports['./security-audit'].types,
    packageJson.exports['./sort-storage'].types,
    packageJson.exports['./password-utils'].types,
    packageJson.exports['./timer'].types,
    packageJson.exports['./flags'].types,
    packageJson.exports['./theme'].types,
    packageJson.exports['./consts'].types,
    packageJson.exports['./urls'].types,
  ]

  for (const target of typeTargets) {
    const fullPath = path.join(packageRoot, target)
    await access(fullPath)
    console.log(`[exports] types: ${fullPath}`)
  }

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'passmanager-exports-smoke-'))

  try {
    await bundle(`import {ManagerRoot} from '${path.join(packageRoot, 'dist', 'index.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof ManagerRoot)\n`, tmpRoot, 'root')
    await bundle(`import {Entry, ManagerRoot} from '${path.join(packageRoot, 'dist', 'core.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof Entry, typeof ManagerRoot)\n`, tmpRoot, 'core')
    await bundle(`import {i18n} from '${path.join(packageRoot, 'dist', 'i18n', 'index.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof i18n)\n`, tmpRoot, 'i18n')
    await bundle(`import {confirmPassManagerAction} from '${path.join(packageRoot, 'dist', 'service', 'dialog.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof confirmPassManagerAction)\n`, tmpRoot, 'dialog')
    await bundle(`import {createCredentialAuditResult} from '${path.join(packageRoot, 'dist', 'security-audit.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof createCredentialAuditResult)\n`, tmpRoot, 'security-audit')
    await bundle(`import {copyWithAutoWipe} from '${path.join(packageRoot, 'dist', 'password-utils.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof copyWithAutoWipe)\n`, tmpRoot, 'password-utils')
    await bundle(`import {timer} from '${path.join(packageRoot, 'dist', 'timer.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof timer)\n`, tmpRoot, 'timer')
    await bundle(`import {SAVE_KEY} from '${path.join(packageRoot, 'dist', 'consts.js').replaceAll(path.sep, '/')}';\nconsole.log(SAVE_KEY)\n`, tmpRoot, 'consts')
    await bundle(`import {URLValidator} from '${path.join(packageRoot, 'dist', 'urls.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof URLValidator)\n`, tmpRoot, 'urls')
    await bundle(`import {normalizeCredentialTags} from '${path.join(packageRoot, 'dist', 'tags.js').replaceAll(path.sep, '/')}';\nconsole.log(typeof normalizeCredentialTags)\n`, tmpRoot, 'tags')
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
