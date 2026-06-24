import {writeJson, writeText} from './artifacts.mjs'

const LOGCAT_TAGS = [
  'ChromVoid/MobileUsb',
  'ChromVoid/UsbNative',
  'ChromVoid/ConnectionFg',
  'ChromVoid/NativeRuntime',
]

export async function clearMobileUsbAccessoryLogs({adb, serial, env}) {
  await runAdb(adb, serial, ['logcat', '-c'], env, {allowFailure: true})
}

export async function captureMobileUsbAccessoryEndpointDiagnostics({
  adb,
  serial,
  env,
  artifactRoot,
  label,
}) {
  const logcat = await runAdb(
    adb,
    serial,
    ['logcat', '-d', '-v', 'time', '-s', ...LOGCAT_TAGS],
    env,
    {allowFailure: true, maxOutputBytes: 512_000},
  )
  const services = await runAdb(
    adb,
    serial,
    ['shell', 'dumpsys', 'activity', 'services', 'com.chromvoid.app/.ConnectionForegroundService'],
    env,
    {allowFailure: true, maxOutputBytes: 256_000},
  )

  const logText = [logcat.stdout, logcat.stderr].filter(Boolean).join('\n')
  const serviceText = [services.stdout, services.stderr].filter(Boolean).join('\n')

  await writeText(artifactRoot, `${label}-mobile-usb-accessory-logcat.txt`, logText)
  await writeText(artifactRoot, `${label}-connection-service-dumpsys.txt`, serviceText)

  const summary = {
    hasAttachEvent: logText.includes('accessory_event=attached'),
    hasPermissionResult: logText.includes('accessory_event=permission_result'),
    hasOpenResult: logText.includes('result=opened'),
    hasDetachEvent: logText.includes('accessory_event=detached'),
    hasDisconnectResult: logText.includes('accessory_disconnect result=disconnected'),
    hasForegroundServiceLog: logText.includes('ChromVoid/ConnectionFg'),
    hasNativeRuntimeFailure: logText.includes('Native runtime unavailable'),
    serviceMentioned: serviceText.includes('ConnectionForegroundService'),
  }
  await writeJson(artifactRoot, `${label}-mobile-usb-accessory-summary.json`, summary)
  return summary
}

async function runAdb(
  adb,
  serial,
  args,
  env,
  {allowFailure = false, maxOutputBytes = 256_000} = {},
) {
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
        child.kill('SIGTERM')
      }
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > maxOutputBytes) {
        child.kill('SIGTERM')
      }
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0 || allowFailure || signal === 'SIGTERM') {
        resolve({code: code ?? 1, stdout, stderr, signal})
        return
      }
      reject(new Error(`${adb} ${args.join(' ')} exited with code ${code}\n${stderr || stdout}`))
    })
  })
}
