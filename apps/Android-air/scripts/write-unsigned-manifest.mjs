import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {rename, rm, stat, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'
import {parseArgs} from 'node:util'

function positiveInteger(value, label) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return Number(value)
}

function apkMetadata(badging) {
  const packageLines = badging.split(/\r?\n/).filter((line) => line.startsWith('package:'))
  if (
    packageLines.length !== 1 ||
    !/^package:(?:\s+[A-Za-z][A-Za-z0-9_]*='[^']*')+\s*$/.test(packageLines[0])
  ) {
    throw new Error('Invalid aapt2 output: expected one package line')
  }

  const fields = new Map()
  for (const [, name, value] of packageLines[0].matchAll(/([A-Za-z][A-Za-z0-9_]*)='([^']*)'/g)) {
    if (fields.has(name)) throw new Error(`Invalid aapt2 output: duplicate ${name}`)
    fields.set(name, value)
  }
  const applicationId = fields.get('name')
  const versionName = fields.get('versionName')
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(applicationId)) {
    throw new Error('Invalid aapt2 output: missing or invalid package name')
  }
  if (!versionName) throw new Error('Invalid aapt2 output: missing versionName')

  return {
    application_id: applicationId,
    version_code: positiveInteger(fields.get('versionCode'), 'aapt2 versionCode'),
    version_name: versionName,
  }
}

async function fileMetadata(artifactDir, name, channel) {
  const filePath = join(artifactDir, name)
  if (!(await stat(filePath)).isFile()) throw new Error(`Not a file: ${filePath}`)
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
    size += chunk.length
  }
  return {name, channel, sha256: hash.digest('hex'), size}
}

async function main() {
  const {values} = parseArgs({
    options: {'artifact-dir': {type: 'string'}, aapt2: {type: 'string'}},
  })
  if (!values['artifact-dir'] || !values.aapt2) {
    throw new Error('Usage: write-unsigned-manifest.mjs --artifact-dir DIR --aapt2 PATH')
  }
  const runId = positiveInteger(process.env.CHROMVOID_ANDROID_RUN_ID, 'CHROMVOID_ANDROID_RUN_ID')
  const sourceCommit = process.env.CHROMVOID_ANDROID_COMMIT
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error('CHROMVOID_ANDROID_COMMIT must be 40 lowercase hexadecimal characters')
  }

  const artifactDir = resolve(values['artifact-dir'])
  const files = await Promise.all([
    fileMetadata(artifactDir, 'chromvoid-android-unsigned.aab', 'play'),
    fileMetadata(artifactDir, 'chromvoid-android-universal-unsigned.apk', 'sideload'),
  ])
  const badging = execFileSync(
    values.aapt2,
    ['dump', 'badging', join(artifactDir, 'chromvoid-android-universal-unsigned.apk')],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
  )
  const manifest = {
    schema_version: 1,
    kind: 'chromvoid-android-unsigned',
    repository: 'kaifaty/chromvoid',
    workflow: 'android-release.yml',
    run_id: runId,
    source_commit: sourceCommit,
    ...apkMetadata(badging),
    files,
  }

  const outputPath = join(artifactDir, 'android-unsigned-manifest.json')
  const temporaryPath = `${outputPath}.${process.pid}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {flag: 'wx'})
    await rename(temporaryPath, outputPath)
  } finally {
    await rm(temporaryPath, {force: true})
  }
}

main().catch((error) => {
  console.error(`Cannot write Android unsigned manifest: ${error.message}`)
  process.exitCode = 1
})
