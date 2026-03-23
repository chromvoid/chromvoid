import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, extname, join} from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'

type FontVendorSource = {
  id: string
  cssUrl: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const srcDir = join(projectRoot, 'src')
const assetsDir = join(srcDir, 'assets')
const outFontsDir = join(assetsDir, 'fonts/vendor')
const outCssPath = join(srcDir, 'styles/base/fonts.vendored.css')
const indexHtmlPath = join(srcDir, 'index.html')

const sources: FontVendorSource[] = [
  {
    id: 'inter',
    cssUrl:
      'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  },
  {
    id: 'jetbrains-mono',
    cssUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap',
  },
  {
    id: 'satoshi',
    cssUrl: 'https://api.fontshare.com/v2/css?f[]=satoshi@700,500,400&display=swap',
  },
]

const isForce = process.argv.includes('--force')

function ensureDir(path: string) {
  mkdirSync(path, {recursive: true})
}

function sha256Short(input: string) {
  return createHash('sha256').update(input).digest('hex').slice(0, 12)
}

function sanitizeBaseName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function urlToFileParts(url: string): {base: string; ext: string} {
  // Strip query/hash and keep a stable filename.
  const withoutHash = url.split('#')[0] ?? url
  const clean = withoutHash.split('?')[0] ?? withoutHash
  const parts = clean.split('/')
  const last = parts[parts.length - 1] || 'font'
  const ext = extname(last) || '.bin'
  const base = sanitizeBaseName(last.slice(0, last.length - ext.length) || 'font')
  return {base, ext}
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      // Some providers adjust response based on UA.
      'User-Agent': 'Mozilla/5.0 (vendor-fonts; ChromVoid)',
      Accept: 'text/css,*/*;q=0.1',
    },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch CSS: ${url} (${res.status} ${res.statusText})`)
  }
  return await res.text()
}

async function fetchBinary(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (vendor-fonts; ChromVoid)',
    },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch font: ${url} (${res.status} ${res.statusText})`)
  }
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

function extractRemoteUrls(css: string) {
  const urls = new Set<string>()

  // url('https://...') / url("https://...") / url(https://...)
  // url('//cdn.example.com/...') (protocol-relative)
  const re = /url\(\s*(['"]?)((?:https?:)?\/\/[^'"\)\s]+)\1\s*\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    const found = m[2]
    if (typeof found === 'string' && found.length > 0) {
      urls.add(found.startsWith('//') ? `https:${found}` : found)
    }
  }
  return Array.from(urls)
}

async function writeBinaryIfNeeded(absPath: string, data: Uint8Array) {
  if (!isForce && existsSync(absPath)) {
    return
  }
  ensureDir(dirname(absPath))
  await Bun.write(absPath, data)
}

async function main() {
  ensureDir(outFontsDir)

  const urlToLocalPublicPath = new Map<string, string>()

  const cssBlocks: string[] = []
  for (const source of sources) {
    const css = await fetchText(source.cssUrl)
    cssBlocks.push(`/* Source: ${source.cssUrl} */\n${css.trim()}\n`)
  }

  const combinedCss = cssBlocks.join('\n\n')
  const remoteUrls = extractRemoteUrls(combinedCss)

  console.log(`Found ${remoteUrls.length} remote font URLs`) // eslint-disable-line no-console

  for (const remoteUrl of remoteUrls) {
    const {base, ext} = urlToFileParts(remoteUrl)
    const hash = sha256Short(remoteUrl)
    const fileName = `${base}.${hash}${ext}`

    // Keep fonts grouped by their original provider source.
    const host = new URL(remoteUrl).hostname
    const hostDir = sanitizeBaseName(host)
    const localRel = `fonts/vendor/${hostDir}/${fileName}`
    const localAbs = join(assetsDir, localRel)
    // Fonts are stored under src/assets/, so their public URLs must be rooted at /assets/.
    // This keeps both dev server and production dist (dist/assets/...) working.
    const publicPath = `/assets/${localRel.replace(/\\/g, '/')}`

    urlToLocalPublicPath.set(remoteUrl, publicPath)

    if (!isForce && existsSync(localAbs)) {
      continue
    }

    const data = await fetchBinary(remoteUrl)
    await writeBinaryIfNeeded(localAbs, data)
  }

  const rewrittenCss = combinedCss.replace(
    /url\(\s*(['"]?)((?:https?:)?\/\/[^'"\)\s]+)\1\s*\)/gi,
    (full, quote, rawUrl: string) => {
      const normalized = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl
      const mapped = urlToLocalPublicPath.get(normalized)
      if (!mapped) return full
      return `url(${quote || ''}${mapped}${quote || ''})`
    },
  )

  const remoteUrlRe = /url\(\s*["']?(?:https?:)?\/\//i
  const remoteImportRe = /@import\s+url\(\s*["']?(?:https?:)?\/\//i
  if (remoteUrlRe.test(rewrittenCss) || remoteImportRe.test(rewrittenCss)) {
    throw new Error('Vendored CSS still contains remote url()/@import after rewrite')
  }

  const out = `/*
 * Vendored web fonts.
 *
 * Generated by: bun run vendor:fonts
 *
 * NOTE: This file is intended to be committed so dashboard builds stay offline.
 */\n\n${rewrittenCss.trim()}\n`
  writeFileSync(outCssPath, out)
  console.log(`Wrote ${outCssPath}`) // eslint-disable-line no-console

  // Ensure index.html does not reference external font providers.
  const html = readFileSync(indexHtmlPath, 'utf-8')
  const cleaned = html
    .replace(/\s*<!--\s*External fonts[\s\S]*?-->\s*\n?/g, '')
    .replace(/\s*<link[^>]+href=["']https:\/\/fonts\.googleapis\.com\/[^"']+["'][^>]*>\s*\n?/gi, '')
    .replace(/\s*<link[^>]+href=["']https:\/\/api\.fontshare\.com\/[^"']+["'][^>]*>\s*\n?/gi, '')

  if (cleaned !== html) {
    writeFileSync(indexHtmlPath, cleaned)
    console.log(`Updated ${indexHtmlPath}`) // eslint-disable-line no-console
  }
}

main().catch((e) => {
  console.error(e) // eslint-disable-line no-console
  process.exit(1)
})
