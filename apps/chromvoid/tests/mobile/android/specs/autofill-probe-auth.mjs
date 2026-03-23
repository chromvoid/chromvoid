import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'
import {
  captureAutofillDiagnostics,
  clearAutofillDiagnostics,
  ensureChromvoidAutofillService,
  launchActivity,
  selectAutofillSuggestion,
} from '../helpers/autofill-device.mjs'
import {switchToMatchingWebview} from '../helpers/contexts.mjs'
import {seedPasswordEntry} from '../helpers/tauri.mjs'

const PROBE_URL = 'https://autofill.chromvoid.test/login'

export async function runAutofillProbeAuthSmoke({
  driver,
  artifactRoot,
  adb,
  serial,
  env,
  packageName,
}) {
  const username = 'probe-user@example.com'
  const password = 'probe-password-123'
  const entryId = 'autofill-probe-entry'

  await ensureChromvoidAutofillService({adb, serial, env})
  await seedPasswordEntry(driver, {
    entryId,
    title: 'Autofill Probe Entry',
    username,
    password,
    url: PROBE_URL,
  })

  await launchActivity({
    adb,
    serial,
    env,
    component: `${packageName}/.AutofillProbeActivity`,
  })
  await driver.switchContext('NATIVE_APP')

  const contextInfo = await switchToMatchingWebview(
    driver,
    (context) => context.url === PROBE_URL,
    {timeout: 60_000},
  )
  await writeJson(artifactRoot, 'probe-webview-context.json', contextInfo)

  await driver.waitUntil(
    async () =>
      await driver.execute(() => {
        return typeof window.readProbeState === 'function'
      }),
    {
      timeout: 30_000,
      timeoutMsg: 'Autofill probe page did not finish initializing',
      interval: 500,
    },
  )

  await captureSnapshot(driver, artifactRoot, '06-probe-webview-ready')
  await clearAutofillDiagnostics({adb, serial, env})

  await driver.execute(() => {
    const input = document.getElementById('login_field')
    input?.scrollIntoView({block: 'center'})
    input?.focus()
    input?.click()
  })

  await driver.switchContext('NATIVE_APP')
  await captureSnapshot(driver, artifactRoot, '07-probe-native-before-select')
  await selectAutofillSuggestion(driver, username)

  await switchToMatchingWebview(
    driver,
    (context) => context.url === PROBE_URL,
    {timeout: 30_000},
  )
  await driver.waitUntil(
    async () => {
      const state = await driver.execute(() => window.readProbeState())
      return state?.login === 'probe-user@example.com' && state?.password === 'probe-password-123'
    },
    {
      timeout: 20_000,
      timeoutMsg: 'Autofill probe form was not filled with the expected username and password',
      interval: 500,
    },
  )

  const probeState = await driver.execute(() => window.readProbeState())
  await writeJson(artifactRoot, 'probe-filled-state.json', probeState)
  await captureSnapshot(driver, artifactRoot, '08-probe-webview-filled')

  const diagnostics = await captureAutofillDiagnostics({
    adb,
    serial,
    env,
    artifactRoot,
    label: 'probe',
  })
  if (!diagnostics.hasDatasetOffered) {
    throw new Error(`Autofill probe never offered a ChromVoid dataset: ${JSON.stringify(diagnostics)}`)
  }
  if (!diagnostics.hasAuthStart) {
    throw new Error(`Autofill probe offered a dataset but never reached auth activity: ${JSON.stringify(diagnostics)}`)
  }
  if (!diagnostics.hasAuthSuccess) {
    throw new Error(`Autofill probe reached auth activity but did not complete successfully: ${JSON.stringify(diagnostics)}`)
  }
}
