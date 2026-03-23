import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'

async function tauriInvoke(driver, cmd, args = {}) {
  const result = await driver.executeAsync(
    (command, payload, done) => {
      const internals = globalThis.__TAURI_INTERNALS__
      if (!internals || typeof internals.invoke !== 'function') {
        done({ok: false, error: 'Tauri internals are unavailable'})
        return
      }

      internals
        .invoke(command, payload)
        .then((value) => done({ok: true, value}))
        .catch((error) => done({ok: false, error: String(error)}))
    },
    cmd,
    args,
  )

  if (!result?.ok) {
    throw new Error(`tauri invoke failed for ${cmd}: ${result?.error || 'unknown error'}`)
  }

  return result.value
}

export async function runPasswordSaveReviewSmoke({driver, artifactRoot}) {
  const suffix = Date.now()
  const entryTitle = `github-smoke-${suffix}`
  const username = 'alice@example.com'
  const password = 'pw-123'
  const url = 'https://github.com/login'

  await tauriInvoke(driver, 'rpc_dispatch', {
    args: {
      v: 1,
      command: 'master:setup',
      data: {master_password: 'smoke-master-password'},
    },
  })
  await driver.execute(() => {
    window.state.update({NeedUserInitialization: false})
  })

  await tauriInvoke(driver, 'rpc_dispatch', {
    args: {
      v: 1,
      command: 'vault:unlock',
      data: {password: 'smoke-master-password'},
    },
  })
  await driver.execute(() => {
    window.state.update({StorageOpened: true})
    window.store.passManagerToggle()
  })

  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        return (
          window.router?.route?.() === 'dashboard'
          && window.passmanager?.showElement?.() === window.passmanager
        )
      })
    },
    {
      timeout: 30_000,
      timeoutMsg: 'Expected password manager root surface was not reached',
      interval: 1_000,
    },
  )

  await driver.execute((payload) => {
    window.__chromvoidPendingAndroidPasswordSave = payload
    window.dispatchEvent(new CustomEvent('chromvoid:android-password-save-request'))
  }, {token: `ui-smoke-${suffix}`, title: entryTitle, username, password, urls: url})

  await driver.waitUntil(
    async () => {
      return await driver.execute(() => window.passmanager?.showElement?.() === 'createEntry')
    },
    {
      timeout: 30_000,
      timeoutMsg: 'Expected Android password save review create-entry route was not opened',
      interval: 1_000,
    },
  )

  const prefill = await driver.execute(() => {
    const app = document.querySelector('chromvoid-app')
    const manager = app?.shadowRoot?.querySelector('password-manager')
    const layout = manager?.shadowRoot?.querySelector('password-manager-mobile-layout')
    const create = layout?.shadowRoot?.querySelector('pm-entry-create-mobile')
    const createRoot = create?.shadowRoot
    const form = createRoot?.querySelector('form')
    const submit =
      createRoot?.querySelector('cv-button[type="submit"]')
      ?? createRoot?.querySelector('.create-footer cv-button')
      ?? createRoot?.querySelector('cv-button.submit')
    const titleInput = createRoot?.querySelector('[name="title"]')?.shadowRoot?.querySelector('input')
    const usernameInput =
      createRoot?.querySelector('[name="username"]')?.shadowRoot?.querySelector('input')
    const passwordInput =
      createRoot?.querySelector('[name="password"]')?.shadowRoot?.querySelector('input')
    const urlsInput = createRoot?.querySelector('[name="urls"]')?.shadowRoot?.querySelector('input')
    return {
      title: titleInput?.value ?? '',
      username: usernameInput?.value ?? '',
      password: passwordInput?.value ?? '',
      urls: urlsInput?.value ?? '',
      formExists: Boolean(form),
      submitExists: Boolean(submit),
    }
  })
  await writeJson(artifactRoot, 'password-save-prefill.json', prefill)
  await captureSnapshot(driver, artifactRoot, '05-password-save-prefill')

  if (!prefill.submitExists) {
    throw new Error('Password save review submit button is missing')
  }
  if (!prefill.formExists) {
    throw new Error('Password save review form is missing')
  }
  if (prefill.title !== entryTitle || prefill.username !== username || prefill.password !== password || prefill.urls !== url) {
    throw new Error(`Unexpected password save prefill: ${JSON.stringify(prefill)}`)
  }

  await driver.execute(() => {
    const app = document.querySelector('chromvoid-app')
    const manager = app?.shadowRoot?.querySelector('password-manager')
    const layout = manager?.shadowRoot?.querySelector('password-manager-mobile-layout')
    const create = layout?.shadowRoot?.querySelector('pm-entry-create-mobile')
    const createRoot = create?.shadowRoot
    const form = createRoot?.querySelector('form')
    const submit =
      createRoot?.querySelector('cv-button[type="submit"]')
      ?? createRoot?.querySelector('.create-footer cv-button')
      ?? createRoot?.querySelector('cv-button.submit')
    if (form instanceof HTMLFormElement) {
      form.requestSubmit()
      return
    }
    if (submit && typeof submit.click === 'function') {
      submit.click()
      return
    }
    form?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
  })

  await driver.waitUntil(
    async () => {
      return await driver.execute((expectedTitle) => {
        const entries = window.passmanager?.allEntries ?? []
        return Array.isArray(entries) && entries.some((entry) => entry?.title === expectedTitle)
      }, entryTitle)
    },
    {
      timeout: 30_000,
      timeoutMsg: 'Expected saved password entry was not persisted in passmanager',
      interval: 1_000,
    },
  )

  const state = await driver.execute((expectedTitle) => {
    const entries = window.passmanager?.allEntries ?? []
    return {
      route: window.router?.route?.() ?? null,
      showElement: window.passmanager?.showElement?.() ?? null,
      hasEntry: Array.isArray(entries) && entries.some((entry) => entry?.title === expectedTitle),
    }
  }, entryTitle)
  await writeJson(artifactRoot, 'password-save-result.json', state)
  await captureSnapshot(driver, artifactRoot, '06-password-save-finished')

  if (!state.hasEntry) {
    throw new Error(`Expected persisted password entry is missing: ${JSON.stringify(state)}`)
  }
}
