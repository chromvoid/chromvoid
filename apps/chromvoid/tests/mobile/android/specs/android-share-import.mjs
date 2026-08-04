import {spawn} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {captureSnapshot, ensureSubdir, writeJson, writeText} from '../helpers/artifacts.mjs'
import {switchToFirstWebview} from '../helpers/contexts.mjs'
import {
  createAndUnlockFreshVaultThroughUi,
  unlockPersistedVaultThroughUi,
  waitForLockedWelcome,
} from './vault-restart-unlock.mjs'

function runCommand(command, args, {env, allowFailure = false} = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', rejectPromise)
    child.on('exit', (code) => {
      if (code === 0 || allowFailure) {
        resolvePromise({code: code ?? 1, stdout, stderr})
        return
      }
      rejectPromise(new Error(`${command} ${args.join(' ')} exited with code ${code}\n${stderr || stdout}`))
    })
  })
}

async function runAdb(adb, serial, env, args, options = {}) {
  return await runCommand(adb, ['-s', serial, ...args], {env, ...options})
}

async function stageShareFixture({adb, serial, env, packageName, artifactRoot, fileName, content}) {
  const fixtureDir = await ensureSubdir(artifactRoot, 'fixtures')
  const fixturePath = join(fixtureDir, fileName)
  const deviceStagingPath = `/data/local/tmp/${fileName}`

  await writeFile(fixturePath, content, 'utf8')
  await runAdb(adb, serial, env, ['push', fixturePath, deviceStagingPath])
  await runAdb(adb, serial, env, ['shell', 'run-as', packageName, 'mkdir', '-p', 'cache/chromvoid-share'])
  await runAdb(adb, serial, env, [
    'shell',
    'run-as',
    packageName,
    'cp',
    deviceStagingPath,
    `cache/chromvoid-share/${fileName}`,
  ])
  await runAdb(adb, serial, env, ['shell', 'rm', '-f', deviceStagingPath], {allowFailure: true})

  return `content://${packageName}.fileprovider/chromvoid_share/${encodeURIComponent(fileName)}`
}

async function launchShareIntent({driver, adb, serial, env, packageName, uri}) {
  await driver.switchContext('NATIVE_APP')
  const result = await runAdb(adb, serial, env, [
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.SEND',
    '-t',
    'text/plain',
    '--eu',
    'android.intent.extra.STREAM',
    uri,
    '-f',
    '0x00000001',
    '-n',
    `${packageName}/com.chromvoid.app.ShareImportActivity`,
  ])
  await switchToFirstWebview(driver, {timeout: 120_000})
  return result
}

async function findImportedNode(driver, fileName) {
  return await driver.executeAsync((expectedName, done) => {
    const app = document.querySelector('chromvoid-app')
    const fileManager = app?.shadowRoot?.querySelector('chromvoid-file-manager')
    const catalog = fileManager?.ensureModel?.()?.ctx?.catalog
    if (!catalog?.api?.list) {
      done(null)
      return
    }
    catalog.api
      .list('/')
      .then((result) => {
        const node = result.items.find((candidate) => candidate?.name === expectedName)
        done(
          node
            ? {
                name: node.name ?? null,
                nodeId: node.nodeId ?? node.node_id ?? node.id ?? null,
                size: node.size ?? null,
                mimeType: node.mimeType ?? node.mime_type ?? null,
              }
            : null,
        )
      })
      .catch(() => done(null))
  }, fileName)
}

async function readImportedText(driver, nodeId) {
  const result = await driver.executeAsync((targetNodeId, done) => {
    const app = document.querySelector('chromvoid-app')
    const fileManager = app?.shadowRoot?.querySelector('chromvoid-file-manager')
    const catalog = fileManager?.ensureModel?.()?.ctx?.catalog
    if (!catalog?.api?.download) {
      done({ok: false, error: 'catalog.api.download is unavailable'})
      return
    }

    void (async () => {
      try {
        const source = await catalog.api.download(targetNodeId)
        const chunks = []
        let total = 0
        for await (const chunk of source) {
          const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
          chunks.push(bytes)
          total += bytes.byteLength
        }
        const joined = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) {
          joined.set(chunk, offset)
          offset += chunk.byteLength
        }
        done({ok: true, text: new TextDecoder().decode(joined), byteLength: joined.byteLength})
      } catch (error) {
        done({ok: false, error: String(error)})
      }
    })()
  }, nodeId)

  if (!result?.ok) {
    throw new Error(`Failed to read imported Android share fixture: ${result?.error || 'unknown error'}`)
  }
  return result
}

async function captureShareDiagnostics({adb, serial, env, artifactRoot}) {
  const logcat = await runAdb(
    adb,
    serial,
    env,
    ['logcat', '-d', '-v', 'time', '-s', 'ChromVoidShare', 'ChromVoid/NativeUpload'],
    {allowFailure: true},
  )
  await writeText(artifactRoot, 'android-share-logcat.txt', `${logcat.stdout}${logcat.stderr}`)
  return `${logcat.stdout}${logcat.stderr}`
}

export async function runAndroidShareImportSmoke({driver, artifactRoot, adb, serial, env, packageName}) {
  const suffix = Date.now()
  const fileName = `android-share-${suffix}.txt`
  const content = `ChromVoid Android share smoke ${suffix}\n`

  await createAndUnlockFreshVaultThroughUi(driver, artifactRoot)
  await driver.switchContext('NATIVE_APP')
  await runAdb(adb, serial, env, ['shell', 'am', 'force-stop', packageName])
  await runAdb(adb, serial, env, ['logcat', '-c'], {allowFailure: true})
  const uri = await stageShareFixture({
    adb,
    serial,
    env,
    packageName,
    artifactRoot,
    fileName,
    content,
  })
  await captureSnapshot(driver, artifactRoot, '09-android-share-before-intent')
  const activityStart = await launchShareIntent({driver, adb, serial, env, packageName, uri})
  await writeText(
    artifactRoot,
    'android-share-activity-start.txt',
    `${activityStart.stdout}${activityStart.stderr}`,
  )
  await waitForLockedWelcome(driver)
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000))
  const beforeUnlock = {
    importedNode: await findImportedNode(driver, fileName),
    nativeDiagnostics: await captureShareDiagnostics({adb, serial, env, artifactRoot}),
  }
  await writeJson(artifactRoot, 'android-share-before-unlock.json', {
    importedNode: beforeUnlock.importedNode,
    nativeUploadStarted:
      beforeUnlock.nativeDiagnostics.includes('source=android_share') &&
      beforeUnlock.nativeDiagnostics.includes('uri_upload_start_accepted'),
  })
  await captureSnapshot(driver, artifactRoot, '10-android-share-pending-locked')
  if (
    beforeUnlock.importedNode ||
    (beforeUnlock.nativeDiagnostics.includes('source=android_share') &&
      beforeUnlock.nativeDiagnostics.includes('uri_upload_start_accepted'))
  ) {
    throw new Error(
      `Android share import started before vault unlock: ${JSON.stringify(beforeUnlock.importedNode)}`,
    )
  }

  await unlockPersistedVaultThroughUi(driver)

  await driver.waitUntil(async () => Boolean(await findImportedNode(driver, fileName)), {
    timeout: 90_000,
    timeoutMsg: 'Android ACTION_SEND fixture was not imported into the vault root',
    interval: 500,
  })

  const node = await findImportedNode(driver, fileName)
  if (!Number.isSafeInteger(node?.nodeId)) {
    throw new Error(`Imported Android share node has no safe node id: ${JSON.stringify(node)}`)
  }
  const downloaded = await readImportedText(driver, node.nodeId)
  const diagnostics = await captureShareDiagnostics({adb, serial, env, artifactRoot})
  const result = {
    fileName,
    expectedByteLength: Buffer.byteLength(content),
    importedNode: node,
    downloaded,
    diagnostics: {
      proxyReceived: diagnostics.includes('share_proxy_received'),
      proxyConsumed: diagnostics.includes('share_proxy_consumed') && diagnostics.includes('consumed=true'),
      rawUriLeaked: diagnostics.includes(uri),
    },
  }
  await writeJson(artifactRoot, 'android-share-import-result.json', result)
  await captureSnapshot(driver, artifactRoot, '11-android-share-imported-after-unlock')

  if (downloaded.text !== content || downloaded.byteLength !== Buffer.byteLength(content)) {
    throw new Error(`Imported Android share bytes do not match the fixture: ${JSON.stringify(result)}`)
  }
  if (!result.diagnostics.proxyReceived || !result.diagnostics.proxyConsumed) {
    throw new Error(`Android share intent did not traverse the native proxy: ${JSON.stringify(result)}`)
  }
  if (result.diagnostics.rawUriLeaked) {
    throw new Error('Android share diagnostics leaked the raw content URI')
  }
}
