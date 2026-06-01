import {
  createChromVoidWebMcpTools,
  WEBMCP_TOOL_NAMES,
  type WebMcpTool,
} from './webmcp-agent-tools'

type WebMcpRegisterOptions = {
  signal?: AbortSignal
  exposedTo?: string[]
}

type ModelContext = EventTarget & {
  registerTool(tool: WebMcpTool, options?: WebMcpRegisterOptions): void
}

type WebMcpDebugStatus = {
  enabled: boolean
  available: boolean
  registered: boolean
  registeredTools: string[]
}

declare global {
  interface Navigator {
    modelContext?: ModelContext
  }

  interface Window {
    __chromvoidWebMcpDebug?: WebMcpDebugStatus
  }
}

let registeredModelContext: ModelContext | undefined

export function registerChromVoidWebMcpDebugTools(): WebMcpDebugStatus {
  const enabled = isWebMcpDebugEnabled()
  const modelContext = typeof navigator !== 'undefined' ? navigator.modelContext : undefined
  const available = Boolean(modelContext)

  if (!enabled || !modelContext) {
    return publishStatus({enabled, available, registered: false})
  }

  if (registeredModelContext === modelContext) {
    return publishStatus({enabled, available, registered: true})
  }

  for (const tool of createChromVoidWebMcpTools()) {
    modelContext.registerTool(tool)
  }
  registeredModelContext = modelContext

  return publishStatus({enabled, available, registered: true})
}

function isWebMcpDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const host = window.location.hostname
  return window.env === 'dev' || host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')
}

function publishStatus(status: Omit<WebMcpDebugStatus, 'registeredTools'>): WebMcpDebugStatus {
  const next = {
    ...status,
    registeredTools: status.registered ? [...WEBMCP_TOOL_NAMES] : [],
  }
  if (typeof window !== 'undefined') {
    window.__chromvoidWebMcpDebug = next
  }
  return next
}

registerChromVoidWebMcpDebugTools()
