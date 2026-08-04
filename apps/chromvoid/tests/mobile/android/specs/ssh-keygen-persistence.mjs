import {spawn} from 'node:child_process'

import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'
import {switchToFirstWebview} from '../helpers/contexts.mjs'
import {
  rpc,
  setupAndUnlockTestVault,
  triggerWelcomeUnlock,
  waitForDashboardReady,
} from '../helpers/vault.mjs'

const KEY_NAME = 'Android release SSH key'
const KEY_COMMENT = 'android-release@chromvoid.test'
const MASTER_PASSWORD = 'android-ui-ssh-keygen-password'

function runCommand(cmd, args, {env} = {}) {
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
      if (code === 0) {
        resolvePromise({stdout, stderr})
        return
      }
      rejectPromise(new Error(`${cmd} ${args.join(' ')} exited with code ${code}\n${stderr || stdout}`))
    })
  })
}

async function runAdb(adb, serial, env, args) {
  return await runCommand(adb, ['-s', serial, ...args], {env})
}

async function openNavigationSurface(driver, iconName) {
  const drawerOpened = await driver.execute(() => {
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

    const drawer = deepFind(document, 'cv-drawer.mobile-nav-drawer')
    if (drawer?.open === true) return true

    const toolbar = deepFind(document, 'mobile-top-toolbar')
    const menuButton = toolbar?.shadowRoot?.querySelector('#app\\.navigation\\.menu')
    if (!(menuButton instanceof HTMLButtonElement)) return false
    menuButton.click()
    return true
  })

  if (!drawerOpened) {
    throw new Error('Mobile navigation menu is unavailable')
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

        return deepFind(document, 'cv-drawer.mobile-nav-drawer')?.open === true
      })
    },
    {
      timeout: 15_000,
      timeoutMsg: 'Mobile navigation drawer did not open',
      interval: 250,
    },
  )

  const navigation = await driver.execute((targetIcon) => {
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

    const rail = deepFind(document, 'navigation-rail.mobile-nav-rail')
    const actions = [...(rail?.shadowRoot?.querySelectorAll('cv-button.item') ?? [])]
    const action = actions.find((candidate) =>
      candidate.querySelector(`cv-icon[name="${targetIcon}"]`),
    )
    const button = action?.shadowRoot?.querySelector('button')
    if (!(button instanceof HTMLButtonElement)) {
      return {
        clicked: false,
        sshKeysEnabled: window.__CHROMVOID_SSH_KEYS_ENABLED__,
        icons: actions
          .map((candidate) => candidate.querySelector('cv-icon')?.getAttribute('name'))
          .filter(Boolean),
      }
    }
    button.click()
    return {clicked: true}
  }, iconName)

  if (!navigation.clicked) {
    throw new Error(
      `Navigation action for icon ${iconName} is unavailable: ${JSON.stringify(navigation)}`,
    )
  }
}

async function waitForSshKeysView(driver) {
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

        return Boolean(deepFind(document, 'pm-ssh-keys-view-mobile'))
      })
    },
    {
      timeout: 45_000,
      timeoutMsg: 'Mobile SSH keys view did not open',
      interval: 500,
    },
  )
}

async function openCreateSheet(driver) {
  const clicked = await driver.execute(() => {
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

    const toolbar = deepFind(document, 'mobile-top-toolbar')
    const action = toolbar?.shadowRoot?.querySelector('cv-button[data-action="pm-create-ssh-key"]')
    const button = action?.shadowRoot?.querySelector('button')
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })

  if (!clicked) {
    throw new Error('Mobile create SSH key toolbar action is unavailable')
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

        const view = deepFind(document, 'pm-ssh-keys-view-mobile')
        return view?.shadowRoot?.querySelector('cv-bottom-sheet')?.open === true
      })
    },
    {
      timeout: 15_000,
      timeoutMsg: 'Create SSH key bottom sheet did not open',
      interval: 250,
    },
  )
}

async function submitCreateForm(driver) {
  const prepared = await driver.execute(
    (name, comment) => {
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

      function setInputValue(host, value) {
        const input = host?.shadowRoot?.querySelector('input')
        if (!(input instanceof HTMLInputElement)) return false
        input.focus()
        input.value = value
        input.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            composed: true,
            data: value,
            inputType: 'insertText',
          }),
        )
        input.blur()
        return true
      }

      const view = deepFind(document, 'pm-ssh-keys-view-mobile')
      const form = view?.shadowRoot?.querySelector('pm-entry-ssh-create')
      const inputs = form?.shadowRoot?.querySelectorAll('cv-input') ?? []
      return {
        nameSet: setInputValue(inputs[0], name),
        commentSet: setInputValue(inputs[1], comment),
        formData: form?.model?.getFormData?.() ?? null,
      }
    },
    KEY_NAME,
    KEY_COMMENT,
  )

  if (
    !prepared.nameSet ||
    !prepared.commentSet ||
    prepared.formData?.name !== KEY_NAME ||
    prepared.formData?.comment !== KEY_COMMENT
  ) {
    throw new Error(`SSH create form was not prepared: ${JSON.stringify(prepared)}`)
  }

  const clicked = await driver.execute(() => {
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

    const view = deepFind(document, 'pm-ssh-keys-view-mobile')
    const action = view?.shadowRoot?.querySelector('cv-button.ssh-view__sheet-action')
    const button = action?.shadowRoot?.querySelector('button')
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  })

  if (!clicked) {
    throw new Error('Generate SSH key action is unavailable')
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

        const view = deepFind(document, 'pm-ssh-keys-view-mobile')
        const form = view?.shadowRoot?.querySelector('pm-entry-ssh-create')
        const result = form?.model?.result?.()
        return Boolean((result && !result.pending) || form?.model?.error?.())
      })
    },
    {
      timeout: 60_000,
      timeoutMsg: 'SSH key generation produced neither a result nor an error',
      interval: 250,
    },
  )

  const outcome = await driver.execute(() => {
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

    const view = deepFind(document, 'pm-ssh-keys-view-mobile')
    const form = view?.shadowRoot?.querySelector('pm-entry-ssh-create')
    return {
      result: form?.model?.result?.() ?? null,
      error: form?.model?.error?.() ?? '',
    }
  })

  if (outcome.error || !outcome.result?.keyId) {
    throw new Error(`SSH key generation failed: ${JSON.stringify(outcome)}`)
  }
  return outcome.result
}

async function restartAndUnlock({driver, adb, serial, env, packageName, mainActivity}) {
  await driver.switchContext('NATIVE_APP')
  await runAdb(adb, serial, env, ['shell', 'am', 'force-stop', packageName])
  await runAdb(adb, serial, env, ['shell', 'am', 'start', '-W', '-n', `${packageName}/${mainActivity}`])
  await switchToFirstWebview(driver, {timeout: 120_000})

  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        return Boolean(document.querySelector('chromvoid-app')?.shadowRoot?.querySelector('welcome-page'))
      })
    },
    {
      timeout: 60_000,
      timeoutMsg: 'Welcome screen did not appear after native app restart',
      interval: 500,
    },
  )

  await triggerWelcomeUnlock(driver, MASTER_PASSWORD)
  await waitForDashboardReady(driver)
}

async function assertPersistedKey(driver, expected) {
  const listed = await rpc(driver, 'passmanager:ssh:list')
  const key = listed?.sshKeys?.find((candidate) => candidate.id === expected.keyId)
  if (
    !key ||
    key.name !== KEY_NAME ||
    key.comment !== KEY_COMMENT ||
    key.type !== 'ed25519' ||
    key.fingerprint !== expected.fingerprint
  ) {
    throw new Error(`Persisted SSH metadata mismatch: ${JSON.stringify({expected, listed})}`)
  }

  const publicRead = await rpc(driver, 'passmanager:ssh:secret:read', {
    key_id: expected.keyId,
    secret_type: 'ssh_public_key',
  })
  if (publicRead?.value !== expected.publicKey) {
    throw new Error('Persisted SSH public key does not match the generated key')
  }

  return {key, publicKey: publicRead.value}
}

async function waitForPersistedRow(driver, keyId) {
  await openNavigationSurface(driver, 'terminal')
  await waitForSshKeysView(driver)
  await driver.waitUntil(
    async () => {
      return await driver.execute((expectedKeyId) => {
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

        const view = deepFind(document, 'pm-ssh-keys-view-mobile')
        return [...(view?.shadowRoot?.querySelectorAll('.ssh-row') ?? [])].some(
          (row) => row.dataset.keyId === expectedKeyId,
        )
      }, keyId)
    },
    {
      timeout: 45_000,
      timeoutMsg: 'Persisted SSH key did not reappear in the mobile inventory',
      interval: 500,
    },
  )
}

export async function runSshKeygenPersistenceSmoke({
  driver,
  artifactRoot,
  adb,
  serial,
  env,
  packageName,
  mainActivity,
}) {
  await setupAndUnlockTestVault(driver, MASTER_PASSWORD)
  await openNavigationSurface(driver, 'terminal')
  await waitForSshKeysView(driver)
  await openCreateSheet(driver)
  await captureSnapshot(driver, artifactRoot, '20-ssh-keygen-create-open')

  const generated = await submitCreateForm(driver)
  const beforeRestart = await assertPersistedKey(driver, generated)
  await writeJson(artifactRoot, 'ssh-keygen-before-restart.json', {
    generated,
    key: beforeRestart.key,
    publicKeyMatches: beforeRestart.publicKey === generated.publicKey,
  })
  await captureSnapshot(driver, artifactRoot, '21-ssh-keygen-created')

  await restartAndUnlock({driver, adb, serial, env, packageName, mainActivity})
  const afterRestart = await assertPersistedKey(driver, generated)
  await waitForPersistedRow(driver, generated.keyId)
  await writeJson(artifactRoot, 'ssh-keygen-after-restart.json', {
    generated,
    key: afterRestart.key,
    publicKeyMatches: afterRestart.publicKey === generated.publicKey,
  })
  await captureSnapshot(driver, artifactRoot, '22-ssh-keygen-persisted-after-restart')

  await openNavigationSurface(driver, 'folder')
  await waitForDashboardReady(driver)
}
