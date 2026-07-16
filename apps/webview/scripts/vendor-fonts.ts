import {createHash} from 'node:crypto'
import {existsSync} from 'node:fs'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {unzipSync} from 'fflate'
import {compress as compressWoff2} from 'wawoff2'

type FontAsset = {
  archive?: {
    path: string
    sha256: string
  }
  output: string
  sha256: string
  transform?: 'woff2'
  url: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const assetsDir = join(__dirname, '../src/assets')
const fontsDir = join(assetsDir, 'fonts')
const isForce = process.argv.includes('--force')

const assets: FontAsset[] = [
  {
    output: 'inter/InterVariable.woff2',
    sha256: '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3',
    url: 'https://raw.githubusercontent.com/rsms/inter/v4.1/docs/font-files/InterVariable.woff2',
  },
  {
    output: 'inter/InterVariable-Italic.woff2',
    sha256: 'e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a',
    url: 'https://raw.githubusercontent.com/rsms/inter/v4.1/docs/font-files/InterVariable-Italic.woff2',
  },
  {
    output: 'inter/LICENSE.txt',
    sha256: '262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a',
    url: 'https://raw.githubusercontent.com/rsms/inter/v4.1/LICENSE.txt',
  },
  {
    output: 'jetbrains-mono/JetBrainsMonoVariable.ttf',
    sha256: '662a196d58f1183bf2d77428b6d5283fe3f45161ab021bea4036bc98e5cac016',
    url: 'https://raw.githubusercontent.com/JetBrains/JetBrainsMono/v2.304/fonts/variable/JetBrainsMono%5Bwght%5D.ttf',
  },
  {
    output: 'jetbrains-mono/OFL.txt',
    sha256: '30f0c136e3c88e422d0791acd97238870f9054a9729bc34cf2ff0d4ed8cac4ad',
    url: 'https://raw.githubusercontent.com/JetBrains/JetBrainsMono/v2.304/OFL.txt',
  },
  {
    archive: {
      path: 'NotoSansArabic/full/slim-variable-ttf/NotoSansArabic[wght].ttf',
      sha256: '1301aceaea84c501cf2e6dcfb3182e2328c8eae5725817fcb239672bda7154f1',
    },
    output: 'noto-sans-arabic/NotoSansArabicVariable.woff2',
    sha256: 'b060ee09f0388b7c2ab70f0272d949b20286146d082623f37ae5fa3dc86cc083',
    transform: 'woff2',
    url: 'https://github.com/notofonts/arabic/releases/download/NotoSansArabic-v2.013/NotoSansArabic-v2.013.zip',
  },
  {
    archive: {
      path: 'OFL.txt',
      sha256: '1301aceaea84c501cf2e6dcfb3182e2328c8eae5725817fcb239672bda7154f1',
    },
    output: 'noto-sans-arabic/OFL.txt',
    sha256: 'a7a5a25eb188bf1cd96982030d53e23c33485c69b1044a562254226857ee13af',
    url: 'https://github.com/notofonts/arabic/releases/download/NotoSansArabic-v2.013/NotoSansArabic-v2.013.zip',
  },
]

const downloads = new Map<string, Promise<Uint8Array>>()

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function verifyAsset(asset: FontAsset, data: Uint8Array): void {
  const actual = sha256(data)
  if (actual !== asset.sha256) {
    throw new Error(`Checksum mismatch for ${asset.output}: expected ${asset.sha256}, received ${actual}`)
  }
}

async function download(url: string): Promise<Uint8Array> {
  const cached = downloads.get(url)
  if (cached !== undefined) return cached

  const pending = (async () => {
    const response = await fetch(url, {
      headers: {'User-Agent': 'ChromVoid font vendor'},
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
    }
    return new Uint8Array(await response.arrayBuffer())
  })()
  downloads.set(url, pending)
  return pending
}

async function fetchAsset(asset: FontAsset): Promise<Uint8Array> {
  const downloaded = await download(asset.url)
  if (asset.archive === undefined) return downloaded

  const archiveChecksum = sha256(downloaded)
  if (archiveChecksum !== asset.archive.sha256) {
    throw new Error(
      `Checksum mismatch for archive ${asset.url}: expected ${asset.archive.sha256}, received ${archiveChecksum}`,
    )
  }

  const entry = unzipSync(downloaded)[asset.archive.path]
  if (entry === undefined) {
    throw new Error(`Missing ${asset.archive.path} in archive ${asset.url}`)
  }
  return entry
}

async function vendorAsset(asset: FontAsset): Promise<void> {
  const outputPath = join(fontsDir, asset.output)
  if (!isForce && existsSync(outputPath)) {
    verifyAsset(asset, await readFile(outputPath))
    return
  }

  const source = await fetchAsset(asset)
  const data = asset.transform === 'woff2' ? await compressWoff2(source) : source
  verifyAsset(asset, data)
  await mkdir(dirname(outputPath), {recursive: true})
  await writeFile(outputPath, data)
}

async function main(): Promise<void> {
  for (const asset of assets) {
    await vendorAsset(asset)
  }

  for (const obsoleteAsset of [
    'jetbrains-mono/JetBrainsMono-Regular.woff2',
    'jetbrains-mono/JetBrainsMono-Medium.woff2',
    'jetbrains-mono/JetBrainsMono-SemiBold.woff2',
    'jetbrains-mono/JetBrainsMono-Bold.woff2',
    'noto-sans-arabic/NotoSansArabicVariable.ttf',
  ]) {
    await rm(join(fontsDir, obsoleteAsset), {force: true})
  }
  await rm(join(fontsDir, 'vendor'), {recursive: true, force: true})
  await rm(join(assetsDir, 'lato'), {recursive: true, force: true})
  console.log(`Verified ${assets.length} vendored font assets`) // eslint-disable-line no-console
}

main().catch((error: unknown) => {
  console.error(error) // eslint-disable-line no-console
  process.exit(1)
})
