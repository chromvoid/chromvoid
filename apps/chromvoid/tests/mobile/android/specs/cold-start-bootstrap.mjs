import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'
import {switchToFirstWebview} from '../helpers/contexts.mjs'

export async function runColdStartBootstrapSmoke({driver, artifactRoot}) {
  const nativeWebview = await driver.$('android=new UiSelector().className("android.webkit.WebView")')
  await nativeWebview.waitForExist({timeout: 90_000})
  await captureSnapshot(driver, artifactRoot, '01-native-webview-visible')

  const contextInfo = await switchToFirstWebview(driver, {timeout: 120_000})
  await writeJson(artifactRoot, 'webview-context.json', contextInfo)
  await captureSnapshot(driver, artifactRoot, '02-switched-to-webview')

  await driver.waitUntil(
    async () => {
      const readyState = await driver.execute(() => document.readyState)
      return readyState === 'interactive' || readyState === 'complete'
    },
    {
      timeout: 60_000,
      timeoutMsg: 'WebView document did not become interactive/complete',
      interval: 1_000,
    },
  )

  const state = await driver.execute(() => {
    const text = document.body?.innerText ?? ''
    return {
      readyState: document.readyState,
      currentUrl: location.href,
      route: window.router?.route?.() ?? null,
      wsKind: window.ws?.kind ?? null,
      bodyExists: Boolean(document.body),
      appRootExists: Boolean(document.querySelector('chromvoid-app')),
      welcomeExists: Boolean(document.querySelector('welcome-page')),
      failureHostMarker: text.includes('Failed to request http://localhost:4400/'),
      failureText: text.slice(0, 400),
    }
  })

  await writeJson(artifactRoot, 'dom-state.json', state)

  const allowedUrl =
    state.currentUrl.startsWith('http://localhost:4400/')
    || state.currentUrl.startsWith('http://tauri.localhost/')
    || state.currentUrl.startsWith('https://tauri.localhost/')

  if (!allowedUrl) {
    throw new Error(`Unexpected WebView URL: ${state.currentUrl}`)
  }
  if (!state.bodyExists) {
    throw new Error('WebView document has no body')
  }
  if (state.failureHostMarker) {
    throw new Error(`WebView host bootstrap failed: ${state.failureText}`)
  }
  if (!state.appRootExists) {
    throw new Error(`chromvoid-app not found in DOM after bootstrap: ${JSON.stringify(state)}`)
  }

  await captureSnapshot(driver, artifactRoot, '03-webview-app-root-ready')
}
