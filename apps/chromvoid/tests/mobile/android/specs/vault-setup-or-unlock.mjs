import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'

export async function runVaultSetupOrUnlockSmoke({driver, artifactRoot}) {
  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        const route = window.router?.route?.()
        const welcome = Boolean(
          document.querySelector('chromvoid-app')?.shadowRoot?.querySelector('welcome-page'),
        )
        return route === 'welcome' && welcome
      })
    },
    {
      timeout: 60_000,
      timeoutMsg: 'Expected welcome route was not reached',
      interval: 1_000,
    },
  )

  const state = await driver.execute(() => {
    const route = window.router?.route?.()
    const loading = document.body?.hasAttribute('loading') ?? false
    return {
      route,
      loading,
      welcomeExists: Boolean(
        document.querySelector('chromvoid-app')?.shadowRoot?.querySelector('welcome-page'),
      ),
      chromvoidAppExists: Boolean(document.querySelector('chromvoid-app')),
      currentUrl: location.href,
    }
  })

  await writeJson(artifactRoot, 'welcome-state.json', state)
  await captureSnapshot(driver, artifactRoot, '04-welcome-route-ready')
}
