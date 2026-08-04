import {spawn} from 'node:child_process'

import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'
import {switchToFirstWebview} from '../helpers/contexts.mjs'
import {MASTER_PASSWORD, runVaultFirstRunCreateSmoke} from './vault-setup-or-unlock.mjs'

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

function readVaultUiState() {
  const app = document.querySelector('chromvoid-app')
  const welcomePage = app?.shadowRoot?.querySelector('welcome-page')
  const layout =
    welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout') ||
    welcomePage?.shadowRoot?.querySelector('welcome-page-desktop-layout')
  const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
  const setupRoot = setupSection?.shadowRoot
  const model = setupSection?.model
  const route = app?.model?.renderedRoute?.() ?? null

  return {
    route,
    needUserInitialization: model?.isNeedInit?.() ?? null,
    storageOpened: route === 'dashboard',
    welcomeVisible: Boolean(welcomePage),
    setupSectionVisible: Boolean(setupSection),
    unlockFormExists: Boolean(setupRoot?.querySelector('.unlock-inline-form')),
    unlockInputExists: Boolean(setupRoot?.querySelector('#welcome-unlock-password')),
    unlockSubmitExists: Boolean(setupRoot?.querySelector('button.unlock-inline-submit')),
    unlockValidationError: model?.unlockValidationError?.() ?? '',
    sharedErrorText: model?.shared?.errorText?.() ?? '',
    setupInProgress: model?.setupInProgress?.() ?? null,
  }
}

export async function waitForLockedWelcome(driver) {
  await driver.waitUntil(
    async () => {
      const state = await driver.execute(readVaultUiState)
      return (
        state.route === 'welcome' &&
        state.needUserInitialization === false &&
        state.storageOpened !== true &&
        state.welcomeVisible &&
        state.setupSectionVisible
      )
    },
    {
      timeout: 90_000,
      timeoutMsg: 'Expected a persisted locked vault on the welcome route',
      interval: 500,
    },
  )
}

async function openUnlockSheet(driver) {
  await driver.waitUntil(async () => {
    const state = await driver.execute(readVaultUiState)
    return state.unlockFormExists && state.unlockInputExists && state.unlockSubmitExists
  }, {
    timeout: 15_000,
    timeoutMsg: 'Welcome inline unlock form did not become available',
    interval: 250,
  })
}

async function submitUnlockPassword(driver, password) {
  const prepared = await driver.execute((nextPassword) => {
    const welcomePage = document.querySelector('chromvoid-app')?.shadowRoot?.querySelector('welcome-page')
    const layout =
      welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout') ||
      welcomePage?.shadowRoot?.querySelector('welcome-page-desktop-layout')
    const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
    const root = setupSection?.shadowRoot
    const inputHost = root?.querySelector('#welcome-unlock-password')
    const input = inputHost?.shadowRoot?.querySelector('input')
    const submit = root?.querySelector('button.unlock-inline-submit')

    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Welcome unlock password input is unavailable')
    }
    if (!(submit instanceof HTMLButtonElement)) {
      throw new Error('Welcome unlock submit button is unavailable')
    }

    input.focus()
    input.value = nextPassword
    input.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        composed: true,
        data: nextPassword,
        inputType: 'insertText',
      }),
    )
    input.blur()

    return {
      modelPassword: setupSection?.model?.unlockPassword?.() ?? null,
      submitDisabled: submit.disabled,
    }
  }, password)

  if (prepared.modelPassword !== password || prepared.submitDisabled) {
    throw new Error(`Unlock form was not ready for submission: ${JSON.stringify(prepared)}`)
  }

  await driver.execute(() => {
    const welcomePage = document.querySelector('chromvoid-app')?.shadowRoot?.querySelector('welcome-page')
    const layout =
      welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout') ||
      welcomePage?.shadowRoot?.querySelector('welcome-page-desktop-layout')
    const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
    const submit = setupSection?.shadowRoot?.querySelector('button.unlock-inline-submit')
    if (!(submit instanceof HTMLButtonElement)) {
      throw new Error('Welcome unlock submit button is unavailable')
    }
    submit.click()
  })
}

async function waitForDashboard(driver) {
  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        const app = document.querySelector('chromvoid-app')
        return (
          app?.model?.renderedRoute?.() === 'dashboard' &&
          Boolean(app?.shadowRoot?.querySelector('chromvoid-file-manager'))
        )
      })
    },
    {
      timeout: 90_000,
      timeoutMsg: 'Expected unlocked dashboard after submitting the vault password',
      interval: 500,
    },
  )
}

export async function createPersistenceMarker(driver, markerName) {
  const content = `ChromVoid Android persistence marker: ${markerName}\n`
  const result = await driver.executeAsync(
    (name, markerContent, done) => {
      const app = document.querySelector('chromvoid-app')
      const fileManager = app?.shadowRoot?.querySelector('chromvoid-file-manager')
      const catalog = fileManager?.ensureModel?.()?.ctx?.catalog
      if (!catalog?.api?.upload) {
        done({ok: false, error: 'catalog.api.upload is unavailable'})
        return
      }
      const bytes = new TextEncoder().encode(markerContent)
      async function* source() {
        yield bytes
      }
      catalog.api
        .upload({name}, bytes.byteLength, source(), {name, type: 'text/plain'})
        .then((value) => done({ok: true, value}))
        .catch((error) => done({ok: false, error: String(error)}))
    },
    markerName,
    content,
  )

  if (!result?.ok) {
    throw new Error(`Failed to create vault persistence marker: ${result?.error || 'unknown error'}`)
  }

  await driver.waitUntil(async () => await hasPersistenceMarker(driver, markerName), {
    timeout: 30_000,
    timeoutMsg: 'Vault persistence marker was not readable from the backend catalog',
    interval: 500,
  })
}

export async function readPersistenceMarker(driver, markerName) {
  const result = await driver.executeAsync((name, done) => {
    const app = document.querySelector('chromvoid-app')
    const fileManager = app?.shadowRoot?.querySelector('chromvoid-file-manager')
    const catalog = fileManager?.ensureModel?.()?.ctx?.catalog
    if (!catalog?.api?.list || !catalog?.api?.download) {
      done({ok: false, error: 'catalog list/download APIs are unavailable'})
      return
    }

    void (async () => {
      try {
        const listing = await catalog.api.list('/')
        const marker = listing.items.find((item) => item?.name === name)
        const nodeId = marker?.nodeId ?? marker?.node_id ?? marker?.id
        if (!Number.isSafeInteger(nodeId)) {
          done({ok: false, error: 'persistence marker node is unavailable'})
          return
        }
        const source = await catalog.api.download(nodeId)
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
        done({ok: true, text: new TextDecoder().decode(joined)})
      } catch (error) {
        done({ok: false, error: String(error)})
      }
    })()
  }, markerName)

  if (!result?.ok) {
    throw new Error(`Failed to read vault persistence marker: ${result?.error || 'unknown error'}`)
  }
  return result.text
}

export async function hasPersistenceMarker(driver, markerName) {
  return await driver.executeAsync((name, done) => {
    const app = document.querySelector('chromvoid-app')
    const fileManager = app?.shadowRoot?.querySelector('chromvoid-file-manager')
    const catalog = fileManager?.ensureModel?.()?.ctx?.catalog
    if (!catalog?.api?.list) {
      done(false)
      return
    }
    catalog.api
      .list('/')
      .then((result) => done(result.items.some((item) => item?.name === name)))
      .catch(() => done(false))
  }, markerName)
}

async function restartApp({driver, adb, serial, env, packageName, mainActivity}) {
  await driver.switchContext('NATIVE_APP')
  await runAdb(adb, serial, env, ['shell', 'am', 'force-stop', packageName])
  await runAdb(adb, serial, env, ['shell', 'am', 'start', '-W', '-n', `${packageName}/${mainActivity}`])
  await switchToFirstWebview(driver, {timeout: 120_000})
}

async function unlockWithPassword(driver, password) {
  await waitForLockedWelcome(driver)
  await openUnlockSheet(driver)
  await submitUnlockPassword(driver, password)
}

export async function unlockPersistedVaultThroughUi(driver, password = MASTER_PASSWORD) {
  await unlockWithPassword(driver, password)
  await waitForDashboard(driver)
}

export async function createAndUnlockFreshVaultThroughUi(driver, artifactRoot) {
  await runVaultFirstRunCreateSmoke({driver, artifactRoot})
  await unlockPersistedVaultThroughUi(driver)
}

export async function runVaultRestartUnlockSmoke({
  driver,
  artifactRoot,
  adb,
  serial,
  env,
  packageName,
  mainActivity,
}) {
  const markerName = `android-vault-persistence-${Date.now()}.txt`

  await createAndUnlockFreshVaultThroughUi(driver, artifactRoot)
  await createPersistenceMarker(driver, markerName)
  await captureSnapshot(driver, artifactRoot, '09-vault-restart-marker-created')

  await restartApp({driver, adb, serial, env, packageName, mainActivity})
  await waitForLockedWelcome(driver)
  await captureSnapshot(driver, artifactRoot, '10-vault-restart-locked-after-process-death')

  await openUnlockSheet(driver)
  await submitUnlockPassword(driver, 'android-decoy-vault-password')
  await waitForDashboard(driver)
  const decoyResult = {
    markerFound: await hasPersistenceMarker(driver, markerName),
    state: await driver.execute(readVaultUiState),
  }
  await writeJson(artifactRoot, 'vault-restart-decoy-password.json', decoyResult)
  await captureSnapshot(driver, artifactRoot, '11-vault-restart-decoy-empty')

  if (
    decoyResult.markerFound ||
    decoyResult.state.storageOpened !== true ||
    decoyResult.state.route !== 'dashboard'
  ) {
    throw new Error(`Vault deniability contract failed: ${JSON.stringify(decoyResult)}`)
  }

  await restartApp({driver, adb, serial, env, packageName, mainActivity})
  await unlockPersistedVaultThroughUi(driver)
  await driver.waitUntil(async () => await hasPersistenceMarker(driver, markerName), {
    timeout: 45_000,
    timeoutMsg: 'Vault marker was missing after process restart and successful unlock',
    interval: 500,
  })
  const markerText = await readPersistenceMarker(driver, markerName)

  const result = {
    markerName,
    markerFound: await hasPersistenceMarker(driver, markerName),
    markerText,
    state: await driver.execute(readVaultUiState),
  }
  await writeJson(artifactRoot, 'vault-restart-unlock-result.json', result)
  await captureSnapshot(driver, artifactRoot, '12-vault-restart-primary-unlocked-persisted')

  if (
    !result.markerFound ||
    result.markerText !== `ChromVoid Android persistence marker: ${markerName}\n` ||
    result.state.storageOpened !== true ||
    result.state.route !== 'dashboard'
  ) {
    throw new Error(`Vault restart/unlock roundtrip failed: ${JSON.stringify(result)}`)
  }
}
