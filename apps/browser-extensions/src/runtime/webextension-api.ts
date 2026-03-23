export type ExtensionTab = chrome.tabs.Tab

type RuntimeMessageListener = (message: unknown, sender: chrome.runtime.MessageSender) => void

type ChromeNamespace = {
  runtime: {
    lastError?: {message?: string}
    onInstalled: {addListener(listener: () => void): void}
    onStartup: {addListener(listener: () => void): void}
    onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => void,
      ): void
    }
    sendMessage(message: unknown, callback?: (response: unknown) => void): void
  }
  tabs: {
    query(queryInfo: chrome.tabs.QueryInfo, callback: (tabs: ExtensionTab[]) => void): void
    sendMessage(tabId: number, message: unknown, callback?: (response: unknown) => void): void
  }
  action?: {
    setBadgeText(details: chrome.action.BadgeTextDetails, callback?: () => void): void
  }
}

type BrowserNamespace = {
  runtime: {
    onInstalled: {addListener(listener: () => void): void}
    onStartup: {addListener(listener: () => void): void}
    onMessage: {addListener(listener: (message: unknown, sender: chrome.runtime.MessageSender) => void): void}
    sendMessage(message: unknown): Promise<unknown>
  }
  tabs: {
    query(queryInfo: chrome.tabs.QueryInfo): Promise<ExtensionTab[]>
    sendMessage(tabId: number, message: unknown): Promise<unknown>
  }
  action?: {
    setBadgeText(details: chrome.action.BadgeTextDetails): Promise<void> | void
  }
}

type ExtensionGlobal = typeof globalThis & {
  browser?: BrowserNamespace
  chrome?: ChromeNamespace
}

type BrowserResolved = {
  kind: 'browser'
  api: BrowserNamespace
}

type ChromeResolved = {
  kind: 'chrome'
  api: ChromeNamespace
}

const extensionGlobal = globalThis as ExtensionGlobal

const resolveApi = (): BrowserResolved | ChromeResolved => {
  if (extensionGlobal.browser) {
    return {kind: 'browser', api: extensionGlobal.browser}
  }

  if (extensionGlobal.chrome) {
    return {kind: 'chrome', api: extensionGlobal.chrome}
  }

  throw new Error('WebExtension runtime API is unavailable')
}

const chromeLastError = (api: ChromeNamespace): string | undefined => {
  return api.runtime.lastError?.message
}

export const addOnInstalledListener = (listener: () => void): void => {
  const resolved = resolveApi()
  resolved.api.runtime.onInstalled.addListener(listener)
}

export const addOnStartupListener = (listener: () => void): void => {
  const resolved = resolveApi()
  resolved.api.runtime.onStartup.addListener(listener)
}

export const addOnRuntimeMessageListener = (listener: RuntimeMessageListener): void => {
  const resolved = resolveApi()
  if (resolved.kind === 'browser') {
    resolved.api.runtime.onMessage.addListener((message, sender) => {
      listener(message, sender)
    })
    return
  }

  resolved.api.runtime.onMessage.addListener((message, sender, _sendResponse) => {
    listener(message, sender)
  })
}

export const sendRuntimeMessage = async (message: unknown): Promise<unknown> => {
  const resolved = resolveApi()
  if (resolved.kind === 'browser') {
    return resolved.api.runtime.sendMessage(message)
  }

  return new Promise((resolve, reject) => {
    resolved.api.runtime.sendMessage(message, (response) => {
      const error = chromeLastError(resolved.api)
      if (error) {
        reject(new Error(error))
        return
      }

      resolve(response)
    })
  })
}

export const queryActiveTab = async (): Promise<ExtensionTab | undefined> => {
  const resolved = resolveApi()
  if (resolved.kind === 'browser') {
    const tabs = await resolved.api.tabs.query({active: true, currentWindow: true})
    return tabs[0]
  }

  return new Promise((resolve, reject) => {
    resolved.api.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const error = chromeLastError(resolved.api)
      if (error) {
        reject(new Error(error))
        return
      }

      resolve(tabs[0])
    })
  })
}

export const sendTabMessage = async (tabId: number, message: unknown): Promise<unknown> => {
  const resolved = resolveApi()
  if (resolved.kind === 'browser') {
    return resolved.api.tabs.sendMessage(tabId, message)
  }

  return new Promise((resolve, reject) => {
    resolved.api.tabs.sendMessage(tabId, message, (response) => {
      const error = chromeLastError(resolved.api)
      if (error) {
        reject(new Error(error))
        return
      }

      resolve(response)
    })
  })
}

export const setActionBadgeText = async (text: string): Promise<void> => {
  const resolved = resolveApi()
  if (!resolved.api.action) {
    return
  }

  const details: chrome.action.BadgeTextDetails = {text}
  if (resolved.kind === 'browser') {
    await resolved.api.action.setBadgeText(details)
    return
  }

  await new Promise<void>((resolve, reject) => {
    resolved.api.action?.setBadgeText(details, () => {
      const error = chromeLastError(resolved.api)
      if (error) {
        reject(new Error(error))
        return
      }

      resolve()
    })
  })
}
