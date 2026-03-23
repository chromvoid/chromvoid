import {writeJson, writeText} from './artifacts.mjs'

const AUTOFILL_COMPONENT = 'com.chromvoid.app/com.chromvoid.app.ChromVoidAutofillService'

export async function clearAutofillDiagnostics({adb, serial, env}) {
  await runAdb(adb, serial, ['logcat', '-c'], env, {allowFailure: true})
  await runAdb(adb, serial, ['shell', 'cmd', 'autofill', 'destroy', 'sessions'], env, {
    allowFailure: true,
  })
}

export async function ensureChromvoidAutofillService({adb, serial, env}) {
  await runAdb(
    adb,
    serial,
    ['shell', 'settings', 'put', 'secure', 'autofill_service', AUTOFILL_COMPONENT],
    env,
  )
}

export async function launchActivity({adb, serial, env, component, extras = []}) {
  return await runAdb(adb, serial, ['shell', 'am', 'start', '-W', '-n', component, ...extras], env)
}

export async function openChromeUrl({adb, serial, env, url}) {
  return await runAdb(
    adb,
    serial,
    [
      'shell',
      'am',
      'start',
      '-W',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      url,
      'com.android.chrome',
    ],
    env,
  )
}

export async function captureAutofillDiagnostics({adb, serial, env, artifactRoot, label}) {
  const logcat = await runAdb(adb, serial, ['logcat', '-d', '-v', 'time', '-s', 'ChromVoidAutofill'], env, {
    allowFailure: true,
  })
  const dumpsys = await runAdb(adb, serial, ['shell', 'dumpsys', 'autofill'], env, {
    allowFailure: true,
    maxOutputBytes: 512_000,
  })

  await writeText(
    artifactRoot,
    `${label}-autofill-logcat.txt`,
    [logcat.stdout, logcat.stderr].filter(Boolean).join('\n'),
  )
  await writeText(
    artifactRoot,
    `${label}-autofill-dumpsys.txt`,
    [dumpsys.stdout, dumpsys.stderr].filter(Boolean).join('\n'),
  )

  const text = `${logcat.stdout || ''}\n${logcat.stderr || ''}`
  const dump = `${dumpsys.stdout || ''}\n${dumpsys.stderr || ''}`
  const summary = {
    hasOnFillRequest: text.includes('event=onFillRequest'),
    hasDatasetOffered: text.includes('event=datasetOffered'),
    hasOtpDatasetOffered: text.includes('event=otpDatasetOffered'),
    hasOtpSelectorShown: text.includes('event=otpSelectorShown'),
    selectedOtpIds: [...text.matchAll(/event=otpSelected otpId=([^\s]+)/g)].map((match) => match[1]),
    hasAuthStart: text.includes('event=authStart'),
    hasAuthSuccess: text.includes('event=authSuccess'),
    authCancelReasons: [...text.matchAll(/event=authCancel reason=([^\s]+)/g)].map((match) => match[1]),
    selectedDatasetIds: dump.match(/mSelectedDatasetIds:\s*(.+)/)?.[1]?.trim() ?? null,
    numDatasets: Number(dump.match(/NUM_DATASETS=(\d+)/)?.[1] ?? 0),
    serviceSeen: dump.includes('SERVICE=com.chromvoid.app'),
  }
  await writeJson(artifactRoot, `${label}-autofill-summary.json`, summary)
  return summary
}

export async function selectAutofillSuggestion(driver, text, {timeout = 15_000} = {}) {
  await driver.switchContext('NATIVE_APP')

  const selectors = [
    `android=new UiSelector().textContains("${escapeUiSelector(text)}")`,
    `android=new UiSelector().descriptionContains("${escapeUiSelector(text)}")`,
  ]

  for (const selector of selectors) {
    const element = await driver.$(selector)
    const exists = await element.waitForExist({timeout, reverse: false}).catch(() => false)
    if (!exists) {
      continue
    }
    await element.click()
    return
  }

  throw new Error(`Autofill suggestion with text "${text}" was not found in native UI`)
}

function escapeUiSelector(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function runAdb(adb, serial, args, env, {allowFailure = false, maxOutputBytes = 256_000} = {}) {
  const {spawn} = await import('node:child_process')

  return await new Promise((resolve, reject) => {
    const child = spawn(adb, ['-s', serial, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      if (stdout.length > maxOutputBytes) {
        stdout = stdout.slice(-maxOutputBytes)
      }
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > maxOutputBytes) {
        stderr = stderr.slice(-maxOutputBytes)
      }
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0 || allowFailure) {
        resolve({code: code ?? 1, stdout, stderr})
      } else {
        reject(
          new Error(
            `${adb} ${args.join(' ')} exited with code ${code}\n${stderr || stdout || 'No output captured.'}`,
          ),
        )
      }
    })
  })
}
