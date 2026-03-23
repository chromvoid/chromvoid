import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'
import {
  captureAutofillDiagnostics,
  clearAutofillDiagnostics,
  ensureChromvoidAutofillService,
  launchActivity,
  selectAutofillSuggestion,
} from '../helpers/autofill-device.mjs'
import {switchToMatchingWebview} from '../helpers/contexts.mjs'
import {seedOtpEntry} from '../helpers/tauri.mjs'

const OTP_PROBE_URL = 'https://autofill.chromvoid.test/otp'

export async function runAutofillOtpProbeAuthSmoke({
  driver,
  artifactRoot,
  adb,
  serial,
  env,
  packageName,
}) {
  const otpOptions = [
    {
      id: 'otp-main',
      label: 'Main',
      type: 'TOTP',
      secret: 'JBSWY3DPEHPK3PXP',
    },
  ]

  await ensureChromvoidAutofillService({adb, serial, env})
  await seedOtpEntry(driver, {
    entryId: 'otp-probe-entry',
    title: 'OTP Probe Entry',
    username: 'otp-probe@example.com',
    url: OTP_PROBE_URL,
    otpOptions,
  })

  await launchActivity({
    adb,
    serial,
    env,
    component: `${packageName}/.AutofillProbeActivity`,
    extras: ['--es', 'probe_mode', 'otp'],
  })

  await driver.switchContext('NATIVE_APP')
  await switchToMatchingWebview(
    driver,
    (context) => context.url === OTP_PROBE_URL,
    {timeout: 60_000},
  )

  await driver.waitUntil(
    async () =>
      await driver.execute(() => typeof window.readOtpProbeState === 'function'),
    {
      timeout: 30_000,
      timeoutMsg: 'OTP probe page did not initialize',
      interval: 500,
    },
  )

  await captureSnapshot(driver, artifactRoot, '12-otp-probe-webview-ready')
  await clearAutofillDiagnostics({adb, serial, env})

  await driver.execute(() => {
    const input = document.getElementById('otp_field')
    input?.scrollIntoView({block: 'center'})
    input?.focus()
    input?.click()
  })

  await driver.switchContext('NATIVE_APP')
  await captureSnapshot(driver, artifactRoot, '13-otp-probe-native-before-select')
  await selectAutofillSuggestion(driver, 'otp-probe@example.com')

  await switchToMatchingWebview(
    driver,
    (context) => context.url === OTP_PROBE_URL,
    {timeout: 30_000},
  )
  await driver.waitUntil(
    async () => {
      const state = await driver.execute(() => window.readOtpProbeState())
      return typeof state?.otp === 'string' && state.otp.length > 0
    },
    {
      timeout: 20_000,
      timeoutMsg: 'OTP probe field was not filled',
      interval: 500,
    },
  )

  const probeState = await driver.execute(() => window.readOtpProbeState())
  await writeJson(artifactRoot, 'otp-probe-filled-state.json', probeState)
  await captureSnapshot(driver, artifactRoot, '14-otp-probe-webview-filled')

  const diagnostics = await captureAutofillDiagnostics({
    adb,
    serial,
    env,
    artifactRoot,
    label: 'otp-probe',
  })
  if (!diagnostics.hasOtpDatasetOffered) {
    throw new Error(`OTP probe never offered a ChromVoid OTP dataset: ${JSON.stringify(diagnostics)}`)
  }
  if (!diagnostics.hasAuthStart) {
    throw new Error(`OTP probe offered a dataset but never reached auth activity: ${JSON.stringify(diagnostics)}`)
  }
  if (!diagnostics.hasAuthSuccess) {
    throw new Error(`OTP probe reached auth activity but did not complete successfully: ${JSON.stringify(diagnostics)}`)
  }
}
