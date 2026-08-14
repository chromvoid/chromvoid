import {spawn} from 'node:child_process'

import {captureSnapshot, writeJson, writeText} from '../helpers/artifacts.mjs'
import {switchToFirstWebview} from '../helpers/contexts.mjs'
import {MASTER_PASSWORD} from './vault-setup-or-unlock.mjs'
import {
  createAndUnlockFreshVaultThroughUi,
  createPersistenceMarker,
  hasPersistenceMarker,
  readPersistenceMarker,
  unlockPersistedVaultThroughUi,
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

function readToolsState() {
  function deepFind(root, selector) {
    const found = root.querySelector(selector)
    if (found) return found
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) {
        const nested = deepFind(element.shadowRoot, selector)
        if (nested) return nested
      }
    }
    return null
  }

  const tools = deepFind(document, 'welcome-tools-section')
  const model = tools?.model
  return {
    toolsVisible: Boolean(tools),
    sheetOpen: model?.deviceUtilitiesOpen?.() ?? null,
    screen: model?.deviceUtilitiesScreen?.() ?? null,
    busy: model?.busy?.() ?? null,
    backupInProgress: model?.backupInProgress?.() ?? null,
    restoreInProgress: model?.restoreInProgress?.() ?? null,
    form: model?.deviceUtilitiesForm?.() ?? null,
  }
}

async function waitForWelcomeTools(driver, {needInitialization}) {
  await driver.waitUntil(
    async () => {
      return await driver.execute((expectedNeedInitialization) => {
        function deepFind(root, selector) {
          const found = root.querySelector(selector)
          if (found) return found
          for (const element of root.querySelectorAll('*')) {
            if (element.shadowRoot) {
              const nested = deepFind(element.shadowRoot, selector)
              if (nested) return nested
            }
          }
          return null
        }

        const app = document.querySelector('chromvoid-app')
        const welcomePage = app?.shadowRoot?.querySelector('welcome-page')
        const layout =
          welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout') ||
          welcomePage?.shadowRoot?.querySelector('welcome-page-desktop-layout')
        const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
        return (
          app?.model?.renderedRoute?.() === 'welcome' &&
          setupSection?.model?.isNeedInit?.() === expectedNeedInitialization &&
          Boolean(deepFind(document, 'welcome-tools-section'))
        )
      }, needInitialization)
    },
    {
      timeout: 90_000,
      timeoutMsg: `Expected welcome tools for NeedUserInitialization=${needInitialization}`,
      interval: 500,
    },
  )
}

async function openDeviceUtility(driver, rowIndex) {
  const targetScreens = ['backup', 'restore', 'master-password', 'erase']
  const targetScreen = targetScreens[rowIndex]
  if (!targetScreen) {
    throw new Error(`Unsupported device utilities row ${rowIndex}`)
  }

  await driver.execute(() => {
    function deepFind(root, selector) {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = deepFind(element.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }

    const tools = deepFind(document, 'welcome-tools-section')
    const trigger = tools?.shadowRoot?.querySelector('.mobile-utilities-button, .desktop-utility-button')
    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error('Device utilities trigger is unavailable')
    }
    trigger.click()
  })

  await driver.waitUntil(
    async () => {
      const state = await driver.execute(readToolsState)
      return state.sheetOpen === true && state.screen === 'list'
    },
    {
      timeout: 15_000,
      timeoutMsg: 'Device utilities list did not open',
      interval: 250,
    },
  )

  await driver.execute((targetRowIndex) => {
    function deepFind(root, selector) {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = deepFind(element.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }

    const tools = deepFind(document, 'welcome-tools-section')
    const rows = [...(tools?.shadowRoot?.querySelectorAll('button.utilities-row') ?? [])]
    const row = rows[targetRowIndex]
    if (!(row instanceof HTMLButtonElement)) {
      throw new Error(`Device utilities row ${targetRowIndex} is unavailable`)
    }
    row.click()
  }, rowIndex)

  await driver.waitUntil(
    async () => {
      const state = await driver.execute(readToolsState)
      return state.sheetOpen === true && state.screen === targetScreen
    },
    {
      timeout: 15_000,
      timeoutMsg: `Device utilities did not open row ${rowIndex}`,
      interval: 250,
    },
  )
}

async function prepareUtilityForm(driver, {masterPassword, confirmationField = null}) {
  const prepared = await driver.execute(
    (password, shouldConfirm) => {
      function deepFind(root, selector) {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) {
            const nested = deepFind(element.shadowRoot, selector)
            if (nested) return nested
          }
        }
        return null
      }

      const tools = deepFind(document, 'welcome-tools-section')
      const root = tools?.shadowRoot
      const input = root
        ?.querySelector('cv-input.utilities-password-input')
        ?.shadowRoot?.querySelector('input')
      const checkboxHost = root?.querySelector('cv-checkbox.utilities-inline-check')
      const submit = root
        ?.querySelector('cv-button.utilities-form-submit')
        ?.shadowRoot?.querySelector('button')
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Device utilities password input is unavailable')
      }
      if (!(submit instanceof HTMLButtonElement)) {
        throw new Error('Device utilities submit button is unavailable')
      }

      if (shouldConfirm && checkboxHost instanceof HTMLElement && !checkboxHost.checked) {
        checkboxHost.click()
      }
      input.focus()
      input.value = password
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          composed: true,
          data: password,
          inputType: 'insertText',
        }),
      )
      input.blur()

      return {
        form: tools?.model?.deviceUtilitiesForm?.() ?? null,
        submitDisabled: submit.disabled,
        checkboxFound: checkboxHost instanceof HTMLElement,
        checkboxChecked: checkboxHost instanceof HTMLElement ? checkboxHost.checked : null,
      }
    },
    masterPassword,
    Boolean(confirmationField),
  )

  if (
    prepared.form?.masterPassword !== masterPassword ||
    (confirmationField && prepared.form?.[confirmationField] !== true)
  ) {
    throw new Error(`Device utilities form was not ready: ${JSON.stringify(prepared)}`)
  }

  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        function deepFind(root, selector) {
          const found = root.querySelector(selector)
          if (found) return found
          for (const element of root.querySelectorAll('*')) {
            if (element.shadowRoot) {
              const nested = deepFind(element.shadowRoot, selector)
              if (nested) return nested
            }
          }
          return null
        }

        const tools = deepFind(document, 'welcome-tools-section')
        const submit = tools?.shadowRoot
          ?.querySelector('cv-button.utilities-form-submit')
          ?.shadowRoot?.querySelector('button')
        return submit instanceof HTMLButtonElement && !submit.disabled
      })
    },
    {
      timeout: 15_000,
      timeoutMsg: `Device utilities submit did not become enabled: ${JSON.stringify(prepared)}`,
      interval: 250,
    },
  )
}

async function submitUtilityForm(driver, {switchToNative = true} = {}) {
  await driver.execute(() => {
    function deepFind(root, selector) {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = deepFind(element.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }

    const tools = deepFind(document, 'welcome-tools-section')
    const submit = tools?.shadowRoot
      ?.querySelector('cv-button.utilities-form-submit')
      ?.shadowRoot?.querySelector('button')
    if (!(submit instanceof HTMLButtonElement)) {
      throw new Error('Device utilities submit button is unavailable')
    }
    submit.click()
  })
  if (switchToNative) {
    await driver.switchContext('NATIVE_APP')
  }
}

async function clickFirstExisting(driver, selectors, {timeout = 20_000, label}) {
  let matched = null
  let matchedIndex = -1
  await driver.waitUntil(
    async () => {
      for (const [index, selector] of selectors.entries()) {
        const candidate = await driver.$(selector)
        if (await candidate.isExisting()) {
          matched = candidate
          matchedIndex = index
          return true
        }
      }
      return false
    },
    {
      timeout,
      timeoutMsg: `Android DocumentsUI element was unavailable: ${label}`,
      interval: 500,
    },
  )
  await matched.click()
  return matchedIndex
}

async function selectDocumentsTree(driver, pathSegments) {
  const downloadSelectors = [
    'android=new UiSelector().text("Download")',
    'android=new UiSelector().text("Downloads")',
    'android=new UiSelector().textContains("Download")',
  ]
  const drawerSelectors = [
    '~Show roots',
    'android=new UiSelector().descriptionContains("roots")',
    'android=new UiSelector().descriptionContains("navigation")',
  ]
  const navigationChoice = await clickFirstExisting(driver, [...downloadSelectors, ...drawerSelectors], {
    label: 'Downloads root or navigation drawer',
  })
  if (navigationChoice >= downloadSelectors.length) {
    await clickFirstExisting(driver, downloadSelectors, {label: 'Downloads root'})
  }

  for (const segment of pathSegments) {
    await clickFirstExisting(
      driver,
      [`android=new UiSelector().text("${segment}")`, `android=new UiSelector().textContains("${segment}")`],
      {label: `folder ${segment}`},
    )
  }

  await clickFirstExisting(
    driver,
    [
      'id=com.google.android.documentsui:id/action_menu_select',
      'id=com.android.documentsui:id/action_menu_select',
      'android=new UiSelector().textContains("USE THIS FOLDER")',
      'android=new UiSelector().textContains("Use this folder")',
    ],
    {label: 'Use this folder'},
  )

  const confirmSelectors = [
    'id=android:id/button1',
    'android=new UiSelector().text("ALLOW")',
    'android=new UiSelector().text("Allow")',
  ]
  for (const selector of confirmSelectors) {
    const confirm = await driver.$(selector)
    if (await confirm.isExisting()) {
      await confirm.click()
      break
    }
  }
}

async function waitForUtilityCompletion(driver, expectedScreen) {
  await switchToFirstWebview(driver, {timeout: 120_000})
  await driver.waitUntil(
    async () => {
      const state = await driver.execute(readToolsState)
      return (
        state.busy === false &&
        state.backupInProgress === false &&
        state.restoreInProgress === false &&
        (state.screen === expectedScreen || Boolean(state.form?.error))
      )
    },
    {
      timeout: 180_000,
      timeoutMsg: `Device utility ${expectedScreen} did not complete`,
      interval: 1_000,
    },
  )
  const state = await driver.execute(readToolsState)
  if (state.form?.error) {
    throw new Error(`Device utility ${expectedScreen} failed: ${state.form.error}`)
  }
  if (state.screen !== expectedScreen) {
    throw new Error(`Device utility ended on unexpected screen: ${JSON.stringify(state)}`)
  }
}

async function closeDeviceUtilities(driver) {
  await driver.execute(() => {
    function deepFind(root, selector) {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const nested = deepFind(element.shadowRoot, selector)
          if (nested) return nested
        }
      }
      return null
    }

    const tools = deepFind(document, 'welcome-tools-section')
    if (!tools?.model?.closeDeviceUtilities) {
      throw new Error('Device utilities close action is unavailable')
    }
    tools.model.closeDeviceUtilities()
  })

  await driver.waitUntil(async () => (await driver.execute(readToolsState)).sheetOpen === false, {
    timeout: 15_000,
    timeoutMsg: 'Device utilities sheet did not close after restore',
    interval: 250,
  })
}

async function waitForDeviceErase(driver) {
  await waitForWelcomeTools(driver, {needInitialization: true})
  await driver.waitUntil(
    async () => {
      const state = await driver.execute(readToolsState)
      return state.busy === false && state.screen === 'list' && (state.form?.error ?? null) === null
    },
    {
      timeout: 90_000,
      timeoutMsg: 'Device erase did not return the utilities sheet to its empty-vault state',
      interval: 500,
    },
  )
}

async function listBackupFolders({adb, serial, env, parentPath}) {
  const result = await runAdb(adb, serial, env, ['shell', 'ls', '-1', parentPath], {allowFailure: true})
  return result.stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export async function runSafBackupRestoreSmoke({
  driver,
  artifactRoot,
  adb,
  serial,
  env,
  packageName,
  mainActivity,
}) {
  const suffix = Date.now()
  const markerName = `android-saf-roundtrip-${suffix}.txt`
  const parentName = `ChromVoidSmoke${suffix}`
  const parentPath = `/sdcard/Download/${parentName}`

  await runAdb(adb, serial, env, ['shell', 'mkdir', '-p', parentPath])
  await createAndUnlockFreshVaultThroughUi(driver, artifactRoot)
  await createPersistenceMarker(driver, markerName)

  await driver.switchContext('NATIVE_APP')
  await runAdb(adb, serial, env, ['shell', 'am', 'force-stop', packageName])
  await runAdb(adb, serial, env, ['shell', 'am', 'start', '-W', '-n', `${packageName}/${mainActivity}`])
  await switchToFirstWebview(driver, {timeout: 120_000})
  await waitForWelcomeTools(driver, {needInitialization: false})

  await openDeviceUtility(driver, 0)
  await prepareUtilityForm(driver, {masterPassword: MASTER_PASSWORD})
  await captureSnapshot(driver, artifactRoot, '09-saf-backup-form-ready')
  await submitUtilityForm(driver)
  await selectDocumentsTree(driver, [parentName])
  await waitForUtilityCompletion(driver, 'list')

  await driver.switchContext('NATIVE_APP')
  let backupFolders = []
  await driver.waitUntil(
    async () => {
      backupFolders = await listBackupFolders({adb, serial, env, parentPath})
      return backupFolders.length === 1
    },
    {
      timeout: 90_000,
      timeoutMsg: 'SAF backup directory was not created in the selected DocumentsUI tree',
      interval: 1_000,
    },
  )
  const backupFolder = backupFolders[0]
  await writeJson(artifactRoot, 'saf-backup-created.json', {parentName, backupFolder})

  await switchToFirstWebview(driver, {timeout: 120_000})
  await waitForWelcomeTools(driver, {needInitialization: false})
  await openDeviceUtility(driver, 3)
  await prepareUtilityForm(driver, {
    masterPassword: MASTER_PASSWORD,
    confirmationField: 'eraseConfirmed',
  })
  await submitUtilityForm(driver, {switchToNative: false})
  await waitForDeviceErase(driver)
  await captureSnapshot(driver, artifactRoot, '10-saf-restore-erased-device')

  await openDeviceUtility(driver, 1)
  await prepareUtilityForm(driver, {
    masterPassword: MASTER_PASSWORD,
    confirmationField: 'restoreConfirmed',
  })
  await submitUtilityForm(driver)
  await selectDocumentsTree(driver, [parentName, backupFolder])
  await waitForUtilityCompletion(driver, 'list')
  await captureSnapshot(driver, artifactRoot, '11-saf-restore-completed')

  await closeDeviceUtilities(driver)
  await unlockPersistedVaultThroughUi(driver)
  await driver.waitUntil(async () => await hasPersistenceMarker(driver, markerName), {
    timeout: 60_000,
    timeoutMsg: 'SAF-restored vault did not contain the persistence marker',
    interval: 500,
  })

  const result = {
    markerName,
    markerFound: await hasPersistenceMarker(driver, markerName),
    markerText: await readPersistenceMarker(driver, markerName),
    parentName,
    backupFolder,
  }
  await writeJson(artifactRoot, 'saf-backup-restore-result.json', result)
  await captureSnapshot(driver, artifactRoot, '12-saf-restored-vault-unlocked')
  const logcat = await runAdb(adb, serial, env, ['logcat', '-d', '-v', 'time', '-s', 'ChromVoid/SafBackup'], {
    allowFailure: true,
  })
  await writeText(artifactRoot, 'saf-backup-logcat.txt', `${logcat.stdout}${logcat.stderr}`)

  if (!result.markerFound || result.markerText !== `ChromVoid Android persistence marker: ${markerName}\n`) {
    throw new Error(`SAF backup/restore roundtrip failed: ${JSON.stringify(result)}`)
  }
}
