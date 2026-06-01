import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type {UiComponentWarmupTask} from '../../src/app/bootstrap/surface-component-loader'
import {getSurfaceComponentWarmupTasks} from '../../src/app/bootstrap/surface-component-loader'
import {
  getStartupUiComponentWarmupTasks,
  resetUiComponentIdleWarmupForTests,
  startUiComponentIdleWarmup,
} from '../../src/app/bootstrap/ui-component-idle-warmup'
import {SURFACE_IDS} from '../../src/app/navigation/navigation.types'
import {moduleAccessModel, type ModuleAccessState} from '../../src/core/pro/module-access.model'
import {
  resetRuntimeCapabilities,
  setRuntimeCapabilities,
} from '../../src/core/runtime/runtime-capabilities'
import {
  getPassmanagerExtendedWarmupTask,
  pmComponentLoaderModel,
} from '../../src/features/passmanager/models/pm-component-loader.model'

function createTask(key: string, run: () => Promise<void> = vi.fn().mockResolvedValue(undefined)): UiComponentWarmupTask {
  return {key, run}
}

function createScheduler() {
  const scheduled: Array<() => void> = []
  const schedule = vi.fn((task: () => void) => {
    scheduled.push(task)
    return vi.fn()
  })

  return {schedule, scheduled}
}

async function flushWarmupPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

const LOCKED_GATEWAY_STATE: ModuleAccessState = {
  feature_key: 'browser-extension',
  status: 'locked_pro',
  denial_code: 'PRO_REQUIRED',
}

const ENABLED_GATEWAY_STATE: ModuleAccessState = {
  feature_key: 'browser-extension',
  status: 'enabled',
  denial_code: null,
}

beforeEach(() => {
  resetUiComponentIdleWarmupForTests()
  moduleAccessModel.reset()
  resetRuntimeCapabilities()
})

afterEach(() => {
  resetUiComponentIdleWarmupForTests()
  moduleAccessModel.reset()
  resetRuntimeCapabilities()
  vi.restoreAllMocks()
})

describe('UI component idle warmup', () => {
  it('enumerates route, surface, overlay, document, and Password Manager warmup tasks', () => {
    const surfaceTaskKeys = getSurfaceComponentWarmupTasks().map((task) => task.key)
    const startupTaskKeys = getStartupUiComponentWarmupTasks().map((task) => task.key)

    expect(surfaceTaskKeys).toEqual([
      'route:welcome',
      'route:no-connection',
      ...SURFACE_IDS.map((surface) => `surface:${surface}`),
      'overlay:details',
      'overlay:gallery',
      'overlay:preview',
      'overlay:video',
      'document:markdown',
    ])
    expect(startupTaskKeys).toEqual([
      'route:welcome',
      'route:no-connection',
      'surface:files',
      'surface:notes',
      'surface:passwords',
      'surface:passkeys',
      'surface:settings',
      'surface:remote',
      'surface:gateway',
      'surface:remote-storage',
      'overlay:details',
      'overlay:gallery',
      'overlay:preview',
      'overlay:video',
      'document:markdown',
      'passmanager:extended',
    ])
  })

  it('runs one task per idle turn in stable order', async () => {
    const {schedule, scheduled} = createScheduler()
    const calls: string[] = []
    const tasks = [
      createTask('one', async () => {
        calls.push('one')
      }),
      createTask('two', async () => {
        calls.push('two')
      }),
    ]

    startUiComponentIdleWarmup({tasks, schedule})

    expect(schedule).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([])

    scheduled.shift()?.()
    await flushWarmupPromises()

    expect(calls).toEqual(['one'])
    expect(schedule).toHaveBeenCalledTimes(2)

    scheduled.shift()?.()
    await flushWarmupPromises()

    expect(calls).toEqual(['one', 'two'])
    expect(schedule).toHaveBeenCalledTimes(2)
  })

  it('continues after a warmup task rejects', async () => {
    const {schedule, scheduled} = createScheduler()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls: string[] = []
    const tasks = [
      createTask('rejects', async () => {
        calls.push('rejects')
        throw new Error('boom')
      }),
      createTask('after-reject', async () => {
        calls.push('after-reject')
      }),
    ]

    startUiComponentIdleWarmup({tasks, schedule})
    scheduled.shift()?.()
    await flushWarmupPromises()

    expect(calls).toEqual(['rejects'])
    expect(warnSpy).toHaveBeenCalledWith(
      '[dashboard] idle component warmup failed:',
      expect.objectContaining({task: 'rejects'}),
    )
    expect(schedule).toHaveBeenCalledTimes(2)

    scheduled.shift()?.()
    await flushWarmupPromises()

    expect(calls).toEqual(['rejects', 'after-reject'])
  })

  it('does not duplicate queued work when started twice', async () => {
    const {schedule, scheduled} = createScheduler()
    const run = vi.fn().mockResolvedValue(undefined)
    const tasks = [createTask('once', run)]

    startUiComponentIdleWarmup({tasks, schedule})
    startUiComponentIdleWarmup({tasks, schedule})

    expect(schedule).toHaveBeenCalledTimes(1)

    scheduled.shift()?.()
    await flushWarmupPromises()

    expect(run).toHaveBeenCalledTimes(1)
    expect(schedule).toHaveBeenCalledTimes(1)
  })

  it('defers locked gated surfaces and retries them after access becomes enabled', async () => {
    const {schedule, scheduled} = createScheduler()
    const run = vi.fn().mockResolvedValue(undefined)
    const tasks = [createTask('surface:gateway', run)]

    setRuntimeCapabilities({supports_gateway: true})
    moduleAccessModel.rawStates.set([LOCKED_GATEWAY_STATE])

    startUiComponentIdleWarmup({tasks, schedule})

    expect(schedule).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()

    moduleAccessModel.rawStates.set([ENABLED_GATEWAY_STATE])
    await flushWarmupPromises()

    expect(schedule).toHaveBeenCalledTimes(1)

    scheduled.shift()?.()
    await flushWarmupPromises()

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('exposes Password Manager extended components as an idle warmup task', async () => {
    const ensureSpy = vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockResolvedValue(undefined)

    await getPassmanagerExtendedWarmupTask().run()

    expect(ensureSpy).toHaveBeenCalledTimes(1)
  })
})
