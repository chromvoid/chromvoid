import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, cpSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const distRoot = join(projectRoot, 'dist')
const popupHtmlPath = join(projectRoot, 'popup.html')
const iconsPath = join(projectRoot, 'icons')
const manifestPath = join(projectRoot, 'manifest.json')

const buildFiles = ['service-worker.js', 'injectable.js', 'popup.js', 'styles.css']

const ensureBuildOutputs = () => {
  const missing = buildFiles.filter((file) => !existsSync(join(distRoot, file)))
  if (missing.length > 0) {
    throw new Error(`Missing build outputs in dist/: ${missing.join(', ')}`)
  }

  if (!existsSync(popupHtmlPath)) {
    throw new Error('popup.html is missing')
  }

  if (!existsSync(manifestPath)) {
    throw new Error('manifest.json is missing')
  }

  if (!existsSync(iconsPath)) {
    throw new Error('icons directory is missing')
  }
}

const readManifest = () => {
  const raw = readFileSync(manifestPath, 'utf8')
  return JSON.parse(raw)
}

const buildChromeManifest = (baseManifest) => {
  return {...baseManifest}
}

const buildFirefoxManifest = (baseManifest) => {
  const firefoxManifest = {...baseManifest}
  delete firefoxManifest.key

  const currentSettings =
    typeof firefoxManifest.browser_specific_settings === 'object' &&
    firefoxManifest.browser_specific_settings !== null
      ? firefoxManifest.browser_specific_settings
      : {}

  const currentGecko =
    typeof currentSettings.gecko === 'object' && currentSettings.gecko !== null ? currentSettings.gecko : {}

  firefoxManifest.browser_specific_settings = {
    ...currentSettings,
    gecko: {
      ...currentGecko,
      id: typeof currentGecko.id === 'string' ? currentGecko.id : 'chromvoid-passwordmanager@chromvoid.local',
      strict_min_version:
        typeof currentGecko.strict_min_version === 'string' ? currentGecko.strict_min_version : '121.0',
    },
  }

  return firefoxManifest
}

const writeTargetPackage = (targetName, manifest) => {
  const targetRoot = join(distRoot, targetName)
  const targetDist = join(targetRoot, 'dist')

  rmSync(targetRoot, {recursive: true, force: true})
  mkdirSync(targetDist, {recursive: true})

  for (const file of buildFiles) {
    cpSync(join(distRoot, file), join(targetDist, file))
  }

  cpSync(popupHtmlPath, join(targetRoot, 'popup.html'))
  cpSync(iconsPath, join(targetRoot, 'icons'), {recursive: true})

  writeFileSync(join(targetRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`✓ Packaged ${targetName} extension in dist/${targetName}`)
}

const main = () => {
  ensureBuildOutputs()
  const baseManifest = readManifest()
  writeTargetPackage('chrome', buildChromeManifest(baseManifest))
  writeTargetPackage('firefox', buildFirefoxManifest(baseManifest))
  console.log('\n✅ Browser packages are ready')
}

main()
