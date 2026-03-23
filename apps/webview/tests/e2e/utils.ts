export async function waitForWSConnected(page: import('playwright').Page) {
  await page.waitForFunction(
    () => {
      const ws = (window as any).ws
      return !!ws && typeof ws.connected === 'function' && ws.connected()
    },
    undefined,
    {timeout: 10_000},
  )
}

export async function waitForAuthenticated(page: import('playwright').Page) {
  await page.waitForFunction(
    () => {
      const ws = (window as any).ws
      return !!ws && typeof ws.authenticated === 'function' && ws.authenticated()
    },
    undefined,
    {timeout: 10_000},
  )
}

export async function waitForRoute(page: import('playwright').Page, route: string) {
  await page.waitForFunction(
    (r) => {
      const router = (window as any).router
      return !!router && typeof router.route === 'function' && router.route() === r
    },
    route,
    {timeout: 10_000},
  )
}
