import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {registerChromVoidWebMcpDebugTools} from '../../src/app/debug/webmcp-debug'
import {WEBMCP_TOOL_NAMES} from '../../src/app/debug/webmcp-agent-tools'
import {CommandBar} from '../../src/features/file-manager/components/command-bar'
import {commandBarModel} from '../../src/features/file-manager/models/command-bar.model'
import {clearAppContext, createMockAppContext, initAppContext, tryGetAppContext} from '../../src/shared/services/app-context'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'
import type {Store} from '../../src/app/state/store'

CommandBar.define()

type RegisteredTool = {
  name: string
  inputSchema: Record<string, unknown>
  annotations?: Record<string, unknown>
  execute(input?: Record<string, unknown>): Promise<string> | string
}

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

function setEnv(value: 'dev' | 'prod') {
  Object.defineProperty(window, 'env', {
    configurable: true,
    writable: true,
    value,
  })
}

function createModelContext() {
  const tools: RegisteredTool[] = []
  return {
    tools,
    modelContext: {
      registerTool(tool: RegisteredTool) {
        tools.push(tool)
      },
      async getTools() {
        return tools
      },
      async executeTool(tool: RegisteredTool, inputJson = '{}') {
        const input = JSON.parse(inputJson) as Record<string, unknown>
        return tool.execute(input)
      },
    },
  }
}

function setModelContext(modelContext: unknown) {
  Object.defineProperty(navigator, 'modelContext', {
    configurable: true,
    value: modelContext,
  })
}

function setupAppContext() {
  const searchFilters = atom<SearchFilters>({...DEFAULT_FILTERS})
  const store = {
    layoutMode: atom<'mobile' | 'desktop'>('desktop'),
    searchFilters,
    setSearchFilters(next: SearchFilters | ((prev: SearchFilters) => SearchFilters)) {
      searchFilters.set(typeof next === 'function' ? next(searchFilters()) : next)
    },
    remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
  }

  initAppContext(
    createMockAppContext({
      store: store as unknown as Store,
    }),
  )
  navigationModel.disconnect()
  navigationModel.reset()

  return {store}
}

function ensureNavigationResetContext() {
  if (tryGetAppContext()) {
    return
  }

  initAppContext(createMockAppContext())
}

async function executeTool<T>(tool: RegisteredTool, input: Record<string, unknown> = {}): Promise<T> {
  return JSON.parse(await tool.execute(input)) as T
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

function findTool(tools: RegisteredTool[], name: string): RegisteredTool {
  const tool = tools.find((item) => item.name === name)
  expect(tool).toBeTruthy()
  return tool!
}

describe('WebMCP debug tools', () => {
  afterEach(() => {
    commandBarModel.close()
    ensureNavigationResetContext()
    navigationModel.disconnect()
    navigationModel.reset()
    clearAppContext()
    document.querySelectorAll('command-bar').forEach((element) => element.remove())
    Reflect.deleteProperty(navigator, 'modelContext')
    Reflect.deleteProperty(window, '__chromvoidWebMcpDebug')
    vi.restoreAllMocks()
  })

  it('registers ChromVoid agent tools when modelContext is available in dev', async () => {
    const {tools, modelContext} = createModelContext()
    setEnv('dev')
    setModelContext(modelContext)

    registerChromVoidWebMcpDebugTools()

    expect(tools.map((tool) => tool.name)).toEqual([...WEBMCP_TOOL_NAMES])
    expect(window.__chromvoidWebMcpDebug).toMatchObject({
      enabled: true,
      available: true,
      registered: true,
      registeredTools: [...WEBMCP_TOOL_NAMES],
    })
  })

  it('supports Chrome 150 style getTools and executeTool fallback execution', async () => {
    const {modelContext} = createModelContext()
    setEnv('dev')
    setModelContext(modelContext)
    setupAppContext()

    registerChromVoidWebMcpDebugTools()

    const tools = await modelContext.getTools()
    const tool = findTool(tools, 'chromvoid_get_app_state')
    const state = JSON.parse(await modelContext.executeTool(tool, '{}')) as {
      navigation: {currentSurface: string}
      agent: {commandPalette: {available: boolean}}
    }

    expect(state.navigation.currentSurface).toBe('files')
    expect(state.agent.commandPalette.available).toBe(true)
  })

  it('returns app state without secret payloads', async () => {
    const {tools, modelContext} = createModelContext()
    setEnv('dev')
    setModelContext(modelContext)

    registerChromVoidWebMcpDebugTools()
    const state = await executeTool<{
      navigation: {currentSurface: string}
      passmanager: {attached: boolean; readOnlyOrMissing: boolean}
    }>(findTool(tools, 'chromvoid_get_app_state'))

    expect(state).toMatchObject({
      navigation: {
        currentSurface: 'files',
      },
      passmanager: {
        attached: false,
        readOnlyOrMissing: true,
      },
    })
    expect(JSON.stringify(state)).not.toMatch(/secret|otpSecret|privateKey|cardPan|cvv/i)
  })

  it('does not register tools when modelContext is missing', async () => {
    setEnv('prod')

    registerChromVoidWebMcpDebugTools()

    expect(window.__chromvoidWebMcpDebug).toMatchObject({
      available: false,
      registered: false,
      registeredTools: [],
    })
  })

  it('changes route through open_surface and closes the command palette model', async () => {
    const {tools, modelContext} = createModelContext()
    setEnv('dev')
    setModelContext(modelContext)
    setupAppContext()
    commandBarModel.open()

    registerChromVoidWebMcpDebugTools()
    const result = await executeTool<{
      ok: boolean
      state: {navigation: {currentSurface: string}; agent: {commandPalette: {isOpen: boolean}}}
    }>(findTool(tools, 'chromvoid_open_surface'), {surface: 'notes', historyMode: 'replace'})

    expect(result.ok).toBe(true)
    expect(result.state.navigation.currentSurface).toBe('notes')
    expect(result.state.agent.commandPalette.isOpen).toBe(false)
  })

  it('keeps the command palette dialog hidden when the shared model is closed', async () => {
    setupAppContext()
    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    commandBarModel.open()
    await flush()
    await bar.updateComplete
    const dialog = bar.shadowRoot?.querySelector<HTMLElement>('.dialog')
    expect(dialog?.hidden).toBe(false)
    expect(dialog?.getAttribute('aria-modal')).toBe('true')

    commandBarModel.close()
    await flush()
    await bar.updateComplete

    expect(dialog?.hidden).toBe(true)
    expect(dialog?.getAttribute('aria-modal')).toBe('false')
  })

  it('rejects invalid mutating tool input as structured errors', async () => {
    const {tools, modelContext} = createModelContext()
    setEnv('dev')
    setModelContext(modelContext)

    registerChromVoidWebMcpDebugTools()

    await expect(
      executeTool<{ok: false; error: {code: string}}>(findTool(tools, 'chromvoid_open_surface'), {
        surface: 'unknown',
      }),
    ).resolves.toMatchObject({ok: false, error: {code: 'invalid_surface'}})
    await expect(
      executeTool<{ok: false; error: {code: string}}>(findTool(tools, 'chromvoid_close_overlay'), {
        target: 'everything',
      }),
    ).resolves.toMatchObject({ok: false, error: {code: 'invalid_overlay_target'}})
    await expect(
      executeTool<{ok: false; error: {code: string}}>(findTool(tools, 'chromvoid_execute_action'), {
        id: '',
      }),
    ).resolves.toMatchObject({ok: false, error: {code: 'invalid_input'}})
  })

  it('lists sanitized actions and executes only safe command categories', async () => {
    const {tools, modelContext} = createModelContext()
    setEnv('dev')
    setModelContext(modelContext)
    setupAppContext()

    registerChromVoidWebMcpDebugTools()

    const actions = await executeTool<{
      ok: true
      actions: Array<{id: string; category: string; executableViaWebMcp: boolean; action?: unknown}>
    }>(findTool(tools, 'chromvoid_list_actions'))
    expect(actions.actions.some((action) => action.id === 'nav-notes')).toBe(true)
    expect(actions.actions.every((action) => !('action' in action))).toBe(true)

    const nav = await executeTool<{ok: true; state: {navigation: {currentSurface: string}}}>(
      findTool(tools, 'chromvoid_execute_action'),
      {id: 'nav-notes'},
    )
    expect(nav.ok).toBe(true)
    expect(nav.state.navigation.currentSurface).toBe('notes')

    navigationModel.navigateToSurface('files', 'replace')
    const unsafe = await executeTool<{ok: false; error: {code: string}}>(
      findTool(tools, 'chromvoid_execute_action'),
      {id: 'action-upload'},
    )
    expect(unsafe).toMatchObject({ok: false, error: {code: 'command_not_allowed'}})
  })

  it('closes command palette through close_overlay separately from navigation state', async () => {
    const {tools, modelContext} = createModelContext()
    setEnv('dev')
    setModelContext(modelContext)
    setupAppContext()
    commandBarModel.open()

    registerChromVoidWebMcpDebugTools()
    const closed = await executeTool<{
      ok: true
      closed: {commandPalette: boolean; navigation: boolean}
      state: {commandPalette: {isOpen: boolean}}
    }>(findTool(tools, 'chromvoid_close_overlay'), {target: 'commandPalette'})

    expect(closed.closed.commandPalette).toBe(true)
    expect(closed.closed.navigation).toBe(false)
    expect(closed.state.commandPalette.isOpen).toBe(false)
  })

  it('returns diagnostics with shadow DOM and command palette state', async () => {
    const {tools, modelContext} = createModelContext()
    setEnv('dev')
    setModelContext(modelContext)
    setupAppContext()

    registerChromVoidWebMcpDebugTools()
    const diagnostics = await executeTool<{
      shadowDom: {openShadowRootCount: number; maxShadowDepth: number}
      commandPalette: {model: {isOpen: boolean}; activeDialogCount: number; mismatch: boolean}
    }>(findTool(tools, 'chromvoid_run_ui_diagnostics'))

    expect(diagnostics.shadowDom.openShadowRootCount).toBeGreaterThanOrEqual(0)
    expect(diagnostics.shadowDom.maxShadowDepth).toBeGreaterThanOrEqual(0)
    expect(diagnostics.commandPalette.model.isOpen).toBe(false)
    expect(diagnostics.commandPalette.activeDialogCount).toBe(0)
    expect(diagnostics.commandPalette.mismatch).toBe(false)
  })
})
