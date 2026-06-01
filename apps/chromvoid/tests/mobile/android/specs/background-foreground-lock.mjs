import {spawn} from 'node:child_process'

import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'
import {switchToFirstWebview} from '../helpers/contexts.mjs'
import {tauriInvoke} from '../helpers/tauri.mjs'

const MASTER_PASSWORD = 'android-ui-background-lock-password'
const BACKGROUND_LOCK_SETTINGS = {
  auto_lock_timeout_secs: 300,
  lock_on_sleep: true,
  lock_on_mobile_background: true,
  require_biometric_app_gate: false,
  auto_mount_after_unlock: false,
  keep_screen_awake_when_unlocked: false,
}

function runCommand(cmd, args, {env, allowFailure = false} = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, {
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

      rejectPromise(new Error(`${cmd} ${args.join(' ')} exited with code ${code}\n${stderr || stdout}`))
    })
  })
}

async function runAdb(adb, serial, env, args, {allowFailure = false} = {}) {
  return await runCommand(adb, ['-s', serial, ...args], {env, allowFailure})
}

async function waitForRoute(driver, route, {timeout = 30_000, label = route} = {}) {
  await driver.waitUntil(
    async () => {
      return await driver.execute((expectedRoute) => {
        return window.router?.route?.() === expectedRoute
      }, route)
    },
    {
      timeout,
      timeoutMsg: `Expected route "${label}" was not reached`,
      interval: 1_000,
    },
  )
}

async function waitForDashboardReady(driver, {timeout = 45_000} = {}) {
  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        const ctx = window.getAppContext?.()
        const state = ctx?.state?.data?.()
        const route = window.router?.route?.()
        const loading = document.body?.hasAttribute('loading') ?? false
        const fileManager =
          document.querySelector('chromvoid-file-manager')
          || document
            .querySelector('chromvoid-app')
            ?.shadowRoot?.querySelector('chromvoid-file-manager')

        return (
          route === 'dashboard'
          && state?.StorageOpened === true
          && !loading
          && Boolean(fileManager)
        )
      })
    },
    {
      timeout,
      timeoutMsg: 'Expected dashboard/file-manager surface was not reached after unlock',
      interval: 1_000,
    },
  )
}

async function readRuntimeState(driver) {
  return await driver.execute(() => {
    const ctx = window.getAppContext?.()
    const state = ctx?.state?.data?.()
    const store = ctx?.store
    const app = document.querySelector('chromvoid-app')
    const welcomePage = app?.shadowRoot?.querySelector('welcome-page')
    const fileManager =
      document.querySelector('chromvoid-file-manager')
      || app?.shadowRoot?.querySelector('chromvoid-file-manager')

    return {
      href: location.href,
      route: window.router?.route?.() ?? null,
      storageOpened: state?.StorageOpened ?? null,
      needUserInitialization: state?.NeedUserInitialization ?? null,
      currentPath: store?.currentPath?.() ?? null,
      bodyLoading: document.body?.hasAttribute('loading') ?? false,
      visibilityState: document.visibilityState,
      welcomeVisible: Boolean(welcomePage),
      fileManagerVisible: Boolean(fileManager),
    }
  })
}

async function setupLockedLocalVault(driver) {
  await tauriInvoke(driver, 'rpc_dispatch', {
    args: {
      v: 1,
      command: 'master:setup',
      data: {master_password: MASTER_PASSWORD},
    },
  })

  await tauriInvoke(driver, 'set_session_settings', {
    settings: BACKGROUND_LOCK_SETTINGS,
  })

  await driver.execute(() => {
    window.state.update({
      NeedUserInitialization: false,
      StorageOpened: false,
    })
  })
}

async function triggerWelcomeUnlock(driver, password) {
  await driver.execute((nextPassword) => {
    const dialogService = window.dialogService
    if (!dialogService || typeof dialogService.showInputDialog !== 'function') {
      throw new Error('dialogService.showInputDialog is unavailable')
    }

    dialogService.showInputDialog = async () => nextPassword

    const app = document.querySelector('chromvoid-app')
    const welcomePage = app?.shadowRoot?.querySelector('welcome-page')
    const layout =
      welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout')
      || welcomePage?.shadowRoot?.querySelector('welcome-page-desktop-layout')
    const onUnlock = layout?.model?.onUnlock

    if (typeof onUnlock !== 'function') {
      throw new Error('welcome onUnlock handler is unavailable')
    }

    void onUnlock.call(layout.model)
  }, password)
}

async function backgroundApp({driver, adb, serial, env}) {
  await driver.switchContext('NATIVE_APP')
  await runAdb(adb, serial, env, ['shell', 'input', 'keyevent', '3'])
}

async function foregroundApp({adb, serial, env, packageName, mainActivity}) {
  await runAdb(adb, serial, env, [
    'shell',
    'am',
    'start',
    '-W',
    '-n',
    `${packageName}/${mainActivity}`,
  ])
}

async function stabilizeAfterUnlock(driver, {seconds = 20} = {}) {
  const samples = []

  for (let second = 0; second < seconds; second += 1) {
    const state = await readRuntimeState(driver)
    samples.push({second, ...state})

    if (state.route !== 'dashboard' || state.storageOpened !== true) {
      throw new Error(`App left unlocked dashboard during stabilization: ${JSON.stringify(state)}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  return samples
}

export async function runBackgroundForegroundLockSmoke({
  driver,
  artifactRoot,
  adb,
  serial,
  env,
  packageName,
  mainActivity,
}) {
  await setupLockedLocalVault(driver)
  await waitForRoute(driver, 'welcome', {label: 'welcome after vault setup'})
  await captureSnapshot(driver, artifactRoot, '12-background-lock-welcome-before-first-unlock')
  await writeJson(
    artifactRoot,
    'background-lock-before-first-unlock.json',
    await readRuntimeState(driver),
  )

  await triggerWelcomeUnlock(driver, MASTER_PASSWORD)
  await waitForDashboardReady(driver)
  await captureSnapshot(driver, artifactRoot, '13-background-lock-dashboard-after-first-unlock')
  await writeJson(
    artifactRoot,
    'background-lock-after-first-unlock.json',
    await readRuntimeState(driver),
  )

  await backgroundApp({driver, adb, serial, env})
  await new Promise((resolve) => setTimeout(resolve, 2_000))
  await foregroundApp({adb, serial, env, packageName, mainActivity})

  await switchToFirstWebview(driver, {timeout: 120_000})
  await waitForRoute(driver, 'welcome', {timeout: 45_000, label: 'welcome after background lock'})
  await captureSnapshot(driver, artifactRoot, '14-background-lock-welcome-after-foreground')
  await writeJson(
    artifactRoot,
    'background-lock-after-foreground.json',
    await readRuntimeState(driver),
  )

  await triggerWelcomeUnlock(driver, MASTER_PASSWORD)
  await waitForDashboardReady(driver, {timeout: 60_000})
  await captureSnapshot(driver, artifactRoot, '15-background-lock-dashboard-after-second-unlock')
  await writeJson(
    artifactRoot,
    'background-lock-after-second-unlock.json',
    await readRuntimeState(driver),
  )

  const stabilizationSamples = await stabilizeAfterUnlock(driver, {seconds: 20})
  await writeJson(
    artifactRoot,
    'background-lock-stabilization.json',
    stabilizationSamples,
  )
  await captureSnapshot(driver, artifactRoot, '16-background-lock-stable-after-second-unlock')
}
