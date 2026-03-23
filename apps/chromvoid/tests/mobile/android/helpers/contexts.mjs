function normalizeContexts(raw) {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.map((item) => {
    if (typeof item === 'string') {
      return {id: item}
    }
    return {
      id: item.id || item.name || item.context || '',
      title: item.title || null,
      url: item.url || null,
      packageName: item.packageName || null,
      webviewPageId: item.webviewPageId || null,
    }
  })
}

export async function listContexts(driver) {
  try {
    return normalizeContexts(
      await driver.getContexts({returnDetailedContexts: true, filterByCurrentAndroidApp: true}),
    )
  } catch {
    return normalizeContexts(await driver.getContexts())
  }
}

export async function waitForWebviewContext(driver, {timeout = 90_000, interval = 1_000} = {}) {
  return await waitForMatchingWebviewContext(
    driver,
    (context) => context.id && String(context.id).startsWith('WEBVIEW'),
    {timeout, interval},
  )
}

export async function waitForMatchingWebviewContext(
  driver,
  matcher,
  {timeout = 90_000, interval = 1_000} = {},
) {
  const startedAt = Date.now()
  let lastContexts = []

  while (Date.now() - startedAt < timeout) {
    lastContexts = await listContexts(driver)
    const webview = lastContexts.find((context) => matcher(context))
    if (webview) {
      return {contextId: webview.id, contexts: lastContexts}
    }

    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  throw new Error(
    `Timed out waiting for WEBVIEW context. Last seen contexts: ${JSON.stringify(lastContexts)}`,
  )
}

export async function switchToFirstWebview(driver, options = {}) {
  const {contextId, contexts} = await waitForWebviewContext(driver, options)
  await driver.switchContext(contextId)
  return {contextId, contexts}
}

export async function switchToMatchingWebview(driver, matcher, options = {}) {
  const {contextId, contexts} = await waitForMatchingWebviewContext(driver, matcher, options)
  await driver.switchContext(contextId)
  return {contextId, contexts}
}
