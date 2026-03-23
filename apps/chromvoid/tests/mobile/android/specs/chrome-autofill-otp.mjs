import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'
import {
  captureAutofillDiagnostics,
  clearAutofillDiagnostics,
  ensureChromvoidAutofillService,
  openChromeUrl,
  selectAutofillSuggestion,
} from '../helpers/autofill-device.mjs'
import {switchToMatchingWebview} from '../helpers/contexts.mjs'
import {seedOtpEntry} from '../helpers/tauri.mjs'

const CHROME_OTP_URL = 'http://localhost:4400/otp-probe.html'

export async function runChromeAutofillOtpSmoke({
  driver,
  artifactRoot,
  adb,
  serial,
  env,
}) {
  await ensureChromvoidAutofillService({adb, serial, env})
  await seedOtpEntry(driver, {
    entryId: 'chrome-otp-entry',
    title: 'Chrome OTP Entry',
    username: 'chrome-otp@example.com',
    url: CHROME_OTP_URL,
    otpOptions: [
      {
        id: 'otp-main',
        label: 'Main',
        type: 'TOTP',
        secret: 'JBSWY3DPEHPK3PXP',
      },
    ],
  })

  await openChromeUrl({adb, serial, env, url: CHROME_OTP_URL})
  await driver.switchContext('NATIVE_APP')

  const contextInfo = await switchToMatchingWebview(
    driver,
    (context) => String(context.url || '').startsWith(CHROME_OTP_URL),
    {timeout: 90_000},
  )
  await writeJson(artifactRoot, 'chrome-otp-webview-context.json', contextInfo)

  await driver.waitUntil(
    async () =>
      await driver.execute(() => typeof window.readChromeOtpProbeState === 'function'),
    {
      timeout: 30_000,
      timeoutMsg: 'Chrome OTP probe page did not initialize',
      interval: 500,
    },
  )

  await captureSnapshot(driver, artifactRoot, '18-chrome-otp-webview-ready')
  await clearAutofillDiagnostics({adb, serial, env})

  await driver.execute(() => {
    const input = document.getElementById('otp_field')
    input?.scrollIntoView({block: 'center'})
    input?.focus()
    input?.click()
  })

  await driver.switchContext('NATIVE_APP')
  await captureSnapshot(driver, artifactRoot, '19-chrome-otp-native-before-select')
  await selectAutofillSuggestion(driver, 'chrome-otp@example.com')

  await switchToMatchingWebview(
    driver,
    (context) => String(context.url || '').startsWith(CHROME_OTP_URL),
    {timeout: 30_000},
  )
  await driver.waitUntil(
    async () => {
      const state = await driver.execute(() => window.readChromeOtpProbeState())
      return typeof state?.otp === 'string' && state.otp.length > 0
    },
    {
      timeout: 20_000,
      timeoutMsg: 'Chrome OTP field was not filled',
      interval: 500,
    },
  )

  const chromeState = await driver.execute(() => window.readChromeOtpProbeState())
  await writeJson(artifactRoot, 'chrome-otp-filled-state.json', chromeState)
  await captureSnapshot(driver, artifactRoot, '20-chrome-otp-webview-filled')

  const diagnostics = await captureAutofillDiagnostics({
    adb,
    serial,
    env,
    artifactRoot,
    label: 'chrome-otp',
  })
  if (!diagnostics.hasOtpDatasetOffered) {
    throw new Error(`Chrome OTP never offered a ChromVoid OTP dataset: ${JSON.stringify(diagnostics)}`)
  }
  if (!diagnostics.hasAuthStart) {
    throw new Error(`Chrome OTP offered a dataset but never reached auth activity: ${JSON.stringify(diagnostics)}`)
  }
  if (!diagnostics.hasAuthSuccess) {
    throw new Error(`Chrome OTP reached auth activity but did not complete successfully: ${JSON.stringify(diagnostics)}`)
  }
}
