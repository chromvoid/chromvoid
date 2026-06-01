import {access, readFile} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDir, '..')

async function main() {
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  const rootTypesPath = path.join(packageRoot, packageJson.exports['.'].types)
  const rootModulePath = path.join(packageRoot, packageJson.exports['.'].import)

  await access(rootTypesPath)
  console.log(`[exports] types: ${rootTypesPath}`)

  const rootModule = await import(pathToFileURL(rootModulePath).href)
  if (typeof rootModule.createI18n !== 'function') {
    throw new Error('Root export smoke failed: createI18n export is missing')
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
