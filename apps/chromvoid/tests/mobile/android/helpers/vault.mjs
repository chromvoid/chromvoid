import {tauriInvoke} from './tauri.mjs'

export async function rpc(driver, command, data = {}) {
  const response = await tauriInvoke(driver, 'rpc_dispatch', {
    args: {v: 1, command, data},
  })
  if (response?.ok !== true) {
    throw new Error(`${command} failed: ${response.error || 'unknown RPC error'}`)
  }
  if (response.result?.command !== command) {
    throw new Error(`rpc_dispatch command mismatch: expected ${command}`)
  }
  return response.result.result
}

export async function waitForDashboardReady(driver, timeout = 60_000) {
  await driver.waitUntil(
    async () => {
      const status = await rpc(driver, 'vault:status').catch(() => null)
      const dashboardVisible = await driver.execute(() => {
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

        return (
          !document.body.hasAttribute('loading')
          && !deepFind(document, 'welcome-page')
          && Boolean(deepFind(document, 'chromvoid-file-manager'))
        )
      })
      return status?.is_unlocked === true && dashboardVisible
    },
    {
      timeout,
      timeoutMsg: 'Expected unlocked dashboard after test vault setup',
      interval: 500,
    },
  )
}

export async function triggerWelcomeUnlock(driver, masterPassword, timeout = 60_000) {
  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        const welcomePage = document.querySelector('chromvoid-app')?.shadowRoot?.querySelector('welcome-page')
        const layout =
          welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout')
          || welcomePage?.shadowRoot?.querySelector('welcome-page-desktop-layout')
        const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
        const root = setupSection?.shadowRoot
        return Boolean(
          root?.querySelector('[control-id="welcome.unlock-password"]')
          && root?.querySelector('#welcome\\.unlock-submit'),
        )
      })
    },
    {
      timeout,
      timeoutMsg: 'Welcome inline unlock form did not initialize',
      interval: 250,
    },
  )

  const submitted = await driver.execute((password) => {
    const welcomePage = document.querySelector('chromvoid-app')?.shadowRoot?.querySelector('welcome-page')
    const layout =
      welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout')
      || welcomePage?.shadowRoot?.querySelector('welcome-page-desktop-layout')
    const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
    const inputHost = setupSection?.shadowRoot?.querySelector(
      '[control-id="welcome.unlock-password"]',
    )
    const input = inputHost?.shadowRoot?.querySelector('input')
    const button = setupSection?.shadowRoot?.querySelector('#welcome\\.unlock-submit')
    if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) return false

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
    button.click()
    return true
  }, masterPassword)

  if (!submitted) {
    throw new Error('Welcome unlock form is unavailable')
  }
}

export async function setupAndUnlockTestVault(driver, masterPassword, {timeout = 60_000} = {}) {
  await rpc(driver, 'master:setup', {master_password: masterPassword})
  await driver.refresh()
  await triggerWelcomeUnlock(driver, masterPassword, timeout)
  await waitForDashboardReady(driver, timeout)
}
