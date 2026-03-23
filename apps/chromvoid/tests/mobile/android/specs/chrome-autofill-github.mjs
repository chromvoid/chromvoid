import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'
import {
  captureAutofillDiagnostics,
  clearAutofillDiagnostics,
  ensureChromvoidAutofillService,
  openChromeUrl,
  selectAutofillSuggestion,
} from '../helpers/autofill-device.mjs'
import {switchToMatchingWebview} from '../helpers/contexts.mjs'
import {seedPasswordEntry} from '../helpers/tauri.mjs'

const GITHUB_URL = 'https://github.com/login'

export async function runChromeAutofillGithubSmoke({
  driver,
  artifactRoot,
  adb,
  serial,
  env,
}) {
  const username = 'chromvoid-github@example.com'
  const password = 'github-probe-password'
  const entryId = 'github-autofill-entry'

  await ensureChromvoidAutofillService({adb, serial, env})
  await seedPasswordEntry(driver, {
    entryId,
    title: 'GitHub Probe Entry',
    username,
    password,
    url: GITHUB_URL,
  })

  await openChromeUrl({adb, serial, env, url: GITHUB_URL})
  await driver.switchContext('NATIVE_APP')

  const contextInfo = await switchToMatchingWebview(
    driver,
    (context) => String(context.url || '').startsWith(GITHUB_URL),
    {timeout: 90_000},
  )
  await writeJson(artifactRoot, 'chrome-webview-context.json', contextInfo)

  await driver.waitUntil(
    async () =>
      await driver.execute(() => {
        return (
          document.getElementById('login_field') instanceof HTMLInputElement
          && document.getElementById('password') instanceof HTMLInputElement
        )
      }),
    {
      timeout: 30_000,
      timeoutMsg: 'GitHub login form did not become available in Chrome WebView',
      interval: 500,
    },
  )

  await captureSnapshot(driver, artifactRoot, '09-github-webview-ready')
  await clearAutofillDiagnostics({adb, serial, env})

  await driver.execute(() => {
    const input = document.getElementById('login_field')
    input?.scrollIntoView({block: 'center'})
    input?.focus()
    input?.click()
  })

  await driver.switchContext('NATIVE_APP')
  await captureSnapshot(driver, artifactRoot, '10-github-native-before-select')
  await selectAutofillSuggestion(driver, username)

  await switchToMatchingWebview(
    driver,
    (context) => String(context.url || '').startsWith(GITHUB_URL),
    {timeout: 30_000},
  )
  await driver.waitUntil(
    async () =>
      await driver.execute(() => {
        const login = document.getElementById('login_field')
        const password = document.getElementById('password')
        return {
          login: login instanceof HTMLInputElement ? login.value : '',
          password: password instanceof HTMLInputElement ? password.value : '',
        }
      }).then((state) => state.login === 'chromvoid-github@example.com' && state.password === 'github-probe-password'),
    {
      timeout: 20_000,
      timeoutMsg: 'GitHub login form was not filled with the expected ChromVoid credential',
      interval: 500,
    },
  )

  const githubState = await driver.execute(() => {
    const login = document.getElementById('login_field')
    const password = document.getElementById('password')
    return {
      href: location.href,
      login: login instanceof HTMLInputElement ? login.value : '',
      password: password instanceof HTMLInputElement ? password.value : '',
    }
  })
  await writeJson(artifactRoot, 'github-filled-state.json', githubState)
  await captureSnapshot(driver, artifactRoot, '11-github-webview-filled')

  const diagnostics = await captureAutofillDiagnostics({
    adb,
    serial,
    env,
    artifactRoot,
    label: 'github',
  })
  if (!diagnostics.hasDatasetOffered) {
    throw new Error(`GitHub Autofill never offered a ChromVoid dataset: ${JSON.stringify(diagnostics)}`)
  }
  if (!diagnostics.hasAuthStart) {
    throw new Error(`GitHub Autofill offered a dataset but never reached auth activity: ${JSON.stringify(diagnostics)}`)
  }
  if (!diagnostics.hasAuthSuccess) {
    throw new Error(`GitHub Autofill reached auth activity but did not complete successfully: ${JSON.stringify(diagnostics)}`)
  }
}
