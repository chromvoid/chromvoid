import {Entry, Group, ManagerRoot} from '@project/passmanager/core'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {SURFACE_IDS, type HistoryMode, type SurfaceId} from 'root/app/navigation/navigation.types'
import {
  getPassmanagerRoot,
  getPassmanagerShowElement,
  isPassmanagerLoading,
  isPassmanagerReadOnlyOrMissing,
  type PMRootShowElement,
} from 'root/features/passmanager/models/pm-root.adapter'
import {validateCssTokens} from 'root/utils/validate-css-tokens'

type JsonObject = Record<string, unknown>

export type WebMcpTool = {
  name: WebMcpToolName
  description: string
  inputSchema: JsonObject
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
  execute(input?: JsonObject): Promise<string> | string
}

export const WEBMCP_TOOL_NAMES = [
  'chromvoid_get_app_state',
  'chromvoid_run_ui_diagnostics',
  'chromvoid_open_surface',
  'chromvoid_get_overlay_state',
  'chromvoid_close_overlay',
  'chromvoid_wait_for_idle',
] as const

export type WebMcpToolName = (typeof WEBMCP_TOOL_NAMES)[number]

class WebMcpInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function createChromVoidWebMcpTools(): WebMcpTool[] {
  return [
    {
      name: 'chromvoid_get_app_state',
      description:
        'Returns ChromVoid debug state for the current page, including route, overlay, runtime, and password manager status without secret values.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
      execute: () => serializeSafely(() => buildAppState()),
    },
    {
      name: 'chromvoid_run_ui_diagnostics',
      description:
        'Runs lightweight ChromVoid UI diagnostics and returns CSS token, custom element, shadow DOM, and document readiness checks.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
      execute: () => serializeSafely(() => runUiDiagnostics()),
    },
    {
      name: 'chromvoid_open_surface',
      description:
        'Navigates ChromVoid to a top-level app surface such as files, notes, passwords, settings, or remote.',
      inputSchema: {
        type: 'object',
        properties: {
          surface: {
            type: 'string',
            enum: [...SURFACE_IDS],
            description: 'Top-level ChromVoid surface to open.',
          },
          historyMode: {
            type: 'string',
            enum: ['push', 'replace'],
            description: 'Browser history behavior for this navigation. Defaults to push.',
          },
        },
        required: ['surface'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false,
      },
      execute: (input = {}) =>
        serializeSafely(() => {
          const surface = readSurface(input['surface'])
          const historyMode = readHistoryMode(input['historyMode'])
          navigationModel.navigateToSurface(surface, historyMode)
          return {ok: true, state: buildAppState()}
        }),
    },
    {
      name: 'chromvoid_get_overlay_state',
      description:
        'Returns sanitized navigation overlay and document state for agent navigation.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
      execute: () => serializeSafely(() => buildOverlayState()),
    },
    {
      name: 'chromvoid_close_overlay',
      description:
        'Closes navigation overlays and documents through ChromVoid models without traversing Shadow DOM.',
      inputSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['any', 'navigation'],
            description: 'Overlay target to close. Defaults to any.',
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false,
      },
      execute: (input = {}) => serializeSafely(() => closeOverlay(input)),
    },
    {
      name: 'chromvoid_wait_for_idle',
      description:
        'Waits until the document, custom elements, and route snapshot are stable for agent execution.',
      inputSchema: {
        type: 'object',
        properties: {
          timeoutMs: {
            type: 'number',
            minimum: 0,
            maximum: 10000,
            description: 'Maximum wait time in milliseconds. Defaults to 1000.',
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
      execute: (input = {}) => serializeSafelyAsync(() => waitForIdle(input)),
    },
  ]
}

export function buildAppState() {
  return {
    location: {
      href: window.location.href,
      origin: window.location.origin,
      pathname: window.location.pathname,
    },
    runtime: {
      env: window.env,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    },
    webMcp: window.__chromvoidWebMcpDebug,
    navigation: {
      connected: navigationModel.isConnected(),
      snapshot: navigationModel.snapshot(),
      currentSurface: navigationModel.currentSurface(),
      activeMobileTab: navigationModel.activeMobileTab(),
      resolvedOverlay: navigationModel.resolvedOverlay(),
      resolvedDocument: navigationModel.resolvedDocument(),
    },
    agent: {shadowDom: collectShadowDomStats()},
    passmanager: buildPassmanagerState(),
  }
}

function buildPassmanagerState() {
  const root = getPassmanagerRoot()
  const entries = root?.entriesList() ?? []
  const groups = entries.filter((item) => item instanceof Group)
  const topLevelEntries = entries.filter((item) => item instanceof Entry)
  const nestedEntryCount = groups.reduce((count, group) => count + group.entriesList().length, 0)

  return {
    attached: Boolean(root),
    loading: isPassmanagerLoading(),
    readOnlyOrMissing: isPassmanagerReadOnlyOrMissing(),
    topLevelEntryCount: topLevelEntries.length,
    topLevelGroupCount: groups.length,
    nestedEntryCount,
    showElement: describeShowElement(getPassmanagerShowElement()),
  }
}

function describeShowElement(showElement: PMRootShowElement) {
  if (showElement instanceof Entry) {
    return {
      kind: 'entry',
      id: showElement.id,
      entryType: showElement.entryType,
    }
  }

  if (showElement instanceof Group) {
    return {
      kind: 'group',
      id: showElement.id,
    }
  }

  if (showElement instanceof ManagerRoot) {
    return {
      kind: 'root',
      id: showElement.id,
    }
  }

  if (showElement === undefined) {
    return {kind: 'none'}
  }

  return {kind: String(showElement)}
}

function runUiDiagnostics() {
  const tokenReports = validateCssTokens()
  const missingTokenCount = tokenReports.reduce((count, report) => count + report.missing.length, 0)
  const missingCustomElements = requiredCustomElements().filter((tag) => !customElements.get(tag))
  return {
    ok: missingTokenCount === 0 && missingCustomElements.length === 0,
    document: {
      readyState: document.readyState,
      appElementPresent: document.querySelector('chromvoid-app') !== null,
    },
    cssTokens: {
      missingCount: missingTokenCount,
      reports: tokenReports,
    },
    customElements: {
      missing: missingCustomElements,
    },
    shadowDom: collectShadowDomStats(),
    state: buildAppState(),
  }
}

function buildOverlayState() {
  return {
    ok: true,
    navigation: {
      snapshotOverlay: navigationModel.snapshot().overlay ?? {kind: 'none'},
      resolvedOverlay: navigationModel.resolvedOverlay(),
      resolvedDocument: navigationModel.resolvedDocument(),
    },
  }
}

function closeOverlay(input: JsonObject) {
  const target = readOverlayTarget(input['target'])
  const closed = {
    navigation: false,
    document: false,
  }

  if (target === 'any' || target === 'navigation') {
    if ((navigationModel.snapshot().overlay ?? {kind: 'none'}).kind !== 'none') {
      navigationModel.closeOverlay('replace')
      closed.navigation = true
    }

    if (navigationModel.snapshot().files?.document) {
      navigationModel.closeFilesDocument('replace')
      closed.document = true
    }
  }

  return {
    ok: true,
    closed,
    state: buildOverlayState(),
  }
}

function collectShadowDomStats() {
  const hostCounts = new Map<string, number>()
  const depthHistogram = new Map<number, number>()
  const deepestPaths: Array<{depth: number; path: string}> = []
  let openShadowRootCount = 0
  let maxShadowDepth = 0

  const visitChildren = (root: ParentNode, depth: number, path: string[]) => {
    for (const child of Array.from(root.children)) {
      visitElement(child, depth, path)
    }
  }

  const visitElement = (element: Element, depth: number, path: string[]) => {
    const shadowRoot = (element as HTMLElement).shadowRoot
    if (shadowRoot) {
      const tag = element.localName
      const nextDepth = depth + 1
      const nextPath = [...path, tag]
      openShadowRootCount += 1
      maxShadowDepth = Math.max(maxShadowDepth, nextDepth)
      hostCounts.set(tag, (hostCounts.get(tag) ?? 0) + 1)
      depthHistogram.set(nextDepth, (depthHistogram.get(nextDepth) ?? 0) + 1)
      deepestPaths.push({depth: nextDepth, path: nextPath.join(' > ')})
      visitChildren(shadowRoot, nextDepth, nextPath)
    }

    visitChildren(element, depth, path)
  }

  visitChildren(document, 0, [])

  return {
    openShadowRootCount,
    maxShadowDepth,
    depthHistogram: Object.fromEntries([...depthHistogram.entries()].map(([depth, count]) => [String(depth), count])),
    topShadowHosts: [...hostCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 20)
      .map(([tag, count]) => ({tag, count})),
    deepestPaths: deepestPaths.filter((item) => item.depth === maxShadowDepth).slice(0, 12),
  }
}

async function waitForIdle(input: JsonObject) {
  const timeoutMs = readTimeoutMs(input['timeoutMs'])
  const start = Date.now()

  while (Date.now() - start <= timeoutMs) {
    const before = stableSnapshot()
    await waitFrame()
    await waitFrame()
    const after = stableSnapshot()
    const ready =
      document.readyState === 'complete' &&
      requiredCustomElements().every((tag) => customElements.get(tag)) &&
      before === after

    if (ready) {
      return {
        ok: true,
        elapsedMs: Date.now() - start,
        state: buildAppState(),
      }
    }

    await waitTimeout(25)
  }

  return {
    ok: false,
    error: {
      code: 'idle_timeout',
      message: `ChromVoid did not become idle within ${timeoutMs}ms`,
    },
    state: buildAppState(),
  }
}

function stableSnapshot(): string {
  return JSON.stringify({
    readyState: document.readyState,
    navigation: navigationModel.snapshot(),
  })
}

function waitFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }

    setTimeout(resolve, 0)
  })
}

function waitTimeout(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function requiredCustomElements(): string[] {
  return ['chromvoid-app', 'cv-button', 'cv-dialog', 'cv-drawer', 'cv-input', 'cv-tabs', 'cv-toolbar']
}

function readSurface(value: unknown): SurfaceId {
  if (typeof value !== 'string' || !SURFACE_IDS.includes(value as SurfaceId)) {
    throw new WebMcpInputError('invalid_surface', `surface must be one of: ${SURFACE_IDS.join(', ')}`)
  }

  return value as SurfaceId
}

function readHistoryMode(value: unknown): Exclude<HistoryMode, 'none'> {
  if (value === undefined || value === null) {
    return 'push'
  }

  if (value === 'push' || value === 'replace') {
    return value
  }

  throw new WebMcpInputError('invalid_history_mode', 'historyMode must be "push" or "replace"')
}

function readOverlayTarget(value: unknown): 'any' | 'navigation' {
  if (value === undefined || value === null) {
    return 'any'
  }

  if (value === 'any' || value === 'navigation') {
    return value
  }

  throw new WebMcpInputError('invalid_overlay_target', 'target must be "any" or "navigation"')
}

function readTimeoutMs(value: unknown): number {
  if (value === undefined || value === null) {
    return 1000
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000) {
    throw new WebMcpInputError('invalid_timeout', 'timeoutMs must be a number between 0 and 10000')
  }

  return value
}

function serializeSafely(factory: () => unknown): string {
  try {
    return serialize(factory())
  } catch (error) {
    return serializeError(error)
  }
}

async function serializeSafelyAsync(factory: () => Promise<unknown>): Promise<string> {
  try {
    return serialize(await factory())
  } catch (error) {
    return serializeError(error)
  }
}

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function serializeError(error: unknown): string {
  const code = error instanceof WebMcpInputError ? error.code : 'tool_execution_failed'
  const message = error instanceof Error ? error.message : 'Tool execution failed'
  return serialize({
    ok: false,
    error: {code, message},
  })
}
