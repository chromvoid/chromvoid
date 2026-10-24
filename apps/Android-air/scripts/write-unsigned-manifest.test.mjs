import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

const scriptPath = fileURLToPath(new URL('./write-unsigned-manifest.mjs', import.meta.url))
const aabName = 'chromvoid-android-unsigned.aab'
const apkName = 'chromvoid-android-universal-unsigned.apk'
const manifestName = 'android-unsigned-manifest.json'
const sourceCommit = 'abcdef01'.repeat(5)
const aabBytes = Buffer.from([0, 255, 13, 10, 4, 128, 42])
const apkBytes = Buffer.from([80, 75, 3, 4, 0, 254, 128, 1, 2, 3, 4])

function fixture(
  t,
  badging = "package: name='com.chromvoid.air.dev' versionCode='1' versionName='0.1.0'\n",
) {
  const directory = mkdtempSync(join(tmpdir(), 'chromvoid-unsigned-'))
  t.after(() => rmSync(directory, {recursive: true, force: true}))
  writeFileSync(join(directory, aabName), aabBytes)
  writeFileSync(join(directory, apkName), apkBytes)
  const badgingPath = join(directory, 'aapt2-output.txt')
  const argumentsPath = join(directory, 'aapt2-arguments.json')
  writeFileSync(badgingPath, badging)
  const aapt2Path = join(directory, 'aapt2')
  writeFileSync(
    aapt2Path,
    `#!${process.execPath}\n` +
      "import {readFileSync, writeFileSync} from 'node:fs'\n" +
      'writeFileSync(process.env.FAKE_AAPT2_ARGUMENTS, JSON.stringify(process.argv.slice(2)))\n' +
      'process.stdout.write(readFileSync(process.env.FAKE_AAPT2_OUTPUT))\n' +
      'process.exit(Number(process.env.FAKE_AAPT2_STATUS || 0))\n',
    {mode: 0o755},
  )
  return {
    directory,
    argumentsPath,
    manifestPath: join(directory, manifestName),
    run(env = {}, args = ['--artifact-dir', directory, '--aapt2', aapt2Path]) {
      return spawnSync(process.execPath, [scriptPath, ...args], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CHROMVOID_ANDROID_RUN_ID: '12345',
          CHROMVOID_ANDROID_COMMIT: sourceCommit,
          FAKE_AAPT2_OUTPUT: badgingPath,
          FAKE_AAPT2_ARGUMENTS: argumentsPath,
          FAKE_AAPT2_STATUS: '0',
          ...env,
        },
      })
    },
  }
}

for (const {applicationId, versionCode, versionName} of [
  {applicationId: 'com.chromvoid.air.dev', versionCode: 1, versionName: '0.1.0'},
  {applicationId: 'org.example.release', versionCode: 1000009, versionName: '1.0.9-beta.2'},
]) {
  test(`writes the exact contract using APK metadata for ${applicationId}`, (t) => {
    const f = fixture(
      t,
      `package: name='${applicationId}' versionCode='${versionCode}' versionName='${versionName}' platformBuildVersionName='16' compileSdkVersion='36'\n` +
        "sdkVersion:'29'\napplication-label:'ChromVoid'\n",
    )
    const result = f.run()
    assert.equal(result.status, 0, result.stderr)
    const manifest = JSON.parse(readFileSync(f.manifestPath, 'utf8'))
    assert.deepEqual(manifest, {
      schema_version: 1,
      kind: 'chromvoid-android-unsigned',
      repository: 'kaifaty/chromvoid',
      workflow: 'android-release.yml',
      run_id: 12345,
      source_commit: sourceCommit,
      application_id: applicationId,
      version_code: versionCode,
      version_name: versionName,
      files: [
        {
          name: aabName,
          channel: 'play',
          sha256: createHash('sha256').update(aabBytes).digest('hex'),
          size: aabBytes.length,
        },
        {
          name: apkName,
          channel: 'sideload',
          sha256: createHash('sha256').update(apkBytes).digest('hex'),
          size: apkBytes.length,
        },
      ],
    })
    assert.match(manifest.source_commit, /^[0-9a-f]{40}$/)
    for (const file of manifest.files) assert.match(file.sha256, /^[0-9a-f]{64}$/)
    assert.deepEqual(JSON.parse(readFileSync(f.argumentsPath, 'utf8')), [
      'dump',
      'badging',
      join(f.directory, apkName),
    ])
  })
}

for (const missingName of [aabName, apkName]) {
  test(`rejects missing ${missingName} without creating a manifest`, (t) => {
    const f = fixture(t)
    rmSync(join(f.directory, missingName))
    const result = f.run()
    assert.equal(result.status, 1)
    assert.match(result.stderr, /ENOENT/)
    assert.equal(existsSync(f.manifestPath), false)
    assert.equal(existsSync(f.argumentsPath), false)
  })
}

for (const badging of [
  '',
  "application-label:'ChromVoid'\n",
  "package: name='com.example.app' versionCode='1'\n",
  "package: name='com.example.app' versionCode='1' versionName=''\n",
  "package: name='bad package' versionCode='1' versionName='1.0'\n",
  "package: name='com.example.app' versionCode='1x' versionName='1.0'\n",
  "package: name='com.example.app' versionCode='0' versionName='1.0'\n",
  "package: name='com.example.app' versionCode='9007199254740992' versionName='1.0'\n",
  "package: name='com.example.app' versionCode='1' versionName='1.0' versionCode='2'\n",
  "package: name='com.example.app' versionCode='1' versionName='1.0' unexpected\n",
  "package: name='com.example.app' versionCode='1' versionName='1.0'\npackage: name='com.other.app' versionCode='2' versionName='2.0'\n",
]) {
  test(`rejects malformed aapt2 output: ${JSON.stringify(badging)}`, (t) => {
    const f = fixture(t, badging)
    const result = f.run()
    assert.equal(result.status, 1)
    assert.match(result.stderr, /aapt2/)
    assert.equal(existsSync(f.manifestPath), false)
  })
}

for (const [name, value] of [
  ['CHROMVOID_ANDROID_RUN_ID', ''],
  ['CHROMVOID_ANDROID_RUN_ID', '0'],
  ['CHROMVOID_ANDROID_RUN_ID', '-1'],
  ['CHROMVOID_ANDROID_RUN_ID', '1.5'],
  ['CHROMVOID_ANDROID_RUN_ID', '9007199254740992'],
  ['CHROMVOID_ANDROID_COMMIT', ''],
  ['CHROMVOID_ANDROID_COMMIT', 'abcdef0'],
  ['CHROMVOID_ANDROID_COMMIT', sourceCommit.toUpperCase()],
  ['CHROMVOID_ANDROID_COMMIT', 'g'.repeat(40)],
]) {
  test(`rejects invalid ${name}=${JSON.stringify(value)}`, (t) => {
    const f = fixture(t)
    const result = f.run({[name]: value})
    assert.equal(result.status, 1)
    assert.match(result.stderr, new RegExp(name))
    assert.equal(existsSync(f.manifestPath), false)
  })
}

test('rejects aapt2 command failure without creating a manifest', (t) => {
  const f = fixture(t)
  const result = f.run({FAKE_AAPT2_STATUS: '9'})
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Command failed/)
  assert.equal(existsSync(f.manifestPath), false)
})

test('requires the artifact directory and aapt2 path', (t) => {
  const f = fixture(t)
  const result = f.run({}, [])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Usage:/)
  assert.equal(existsSync(f.manifestPath), false)
})
