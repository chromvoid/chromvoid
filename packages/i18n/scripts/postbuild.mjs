import {readdir, readFile, rm, stat, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDir, '..')
const distDir = path.join(packageRoot, 'dist')

const RELATIVE_SPECIFIER_RE = /((?:import|export)\s[^'"]*?\sfrom\s*|import\s*\()(['"])(\.\.?\/[^'")]+)(\2)/g

async function walk(dir) {
  const entries = await readdir(dir, {withFileTypes: true})
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
      continue
    }
    files.push(fullPath)
  }

  return files
}

function needsJsExtension(specifier) {
  if (!specifier.startsWith('.')) return false
  return !/\.(?:[cm]?js|css|json|node)$/u.test(specifier)
}

async function resolveJsSpecifier(filePath, specifier) {
  const candidatePath = path.resolve(path.dirname(filePath), specifier)

  try {
    const candidateStat = await stat(candidatePath)
    if (candidateStat.isDirectory()) {
      return `${specifier}/index.js`
    }
  } catch {}

  return `${specifier}.js`
}

async function rewriteRelativeSpecifiers(filePath) {
  const source = await readFile(filePath, 'utf8')
  let rewritten = ''
  let lastIndex = 0

  for (const match of source.matchAll(RELATIVE_SPECIFIER_RE)) {
    const [fullMatch, prefix, quote, specifier, suffix] = match
    const matchIndex = match.index ?? 0

    rewritten += source.slice(lastIndex, matchIndex)

    if (!needsJsExtension(specifier)) {
      rewritten += fullMatch
    } else {
      const nextSpecifier = await resolveJsSpecifier(filePath, specifier)
      rewritten += `${prefix}${quote}${nextSpecifier}${suffix}`
    }

    lastIndex = matchIndex + fullMatch.length
  }

  rewritten += source.slice(lastIndex)

  if (rewritten !== source) {
    await writeFile(filePath, rewritten)
  }
}

try {
  for (const filePath of await walk(distDir)) {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) continue
    if (!/\.(?:js|d\.ts)$/u.test(filePath)) continue
    await rewriteRelativeSpecifiers(filePath)
  }
} catch (error) {
  await rm(distDir, {recursive: true, force: true})
  throw error
}
