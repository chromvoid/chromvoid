import {
  getSurfaceComponentWarmupTasks,
  type UiComponentWarmupTask,
} from 'root/app/bootstrap/surface-component-loader'
import {SURFACE_IDS, type SurfaceId} from 'root/app/navigation/navigation.types'
import {moduleAccessModel} from 'root/core/pro/module-access.model'
import {getPassmanagerExtendedWarmupTask} from 'root/features/passmanager/models/pm-component-loader.model'
import {subscribeAfterInitial} from 'root/shared/services/subscribed-signal'

import {scheduleAfterFirstPaintIdle} from './idle-scheduler'

const WARMUP_IDLE_TIMEOUT_MS = 1_500

const COMMON_SURFACE_ORDER: SurfaceId[] = ['files', 'notes', 'passwords', 'passkeys', 'settings']
const GATED_SURFACE_ORDER: SurfaceId[] = ['remote', 'gateway', 'remote-storage']

type WarmupScheduler = typeof scheduleAfterFirstPaintIdle

type StartUiComponentIdleWarmupOptions = {
  tasks?: UiComponentWarmupTask[]
  schedule?: WarmupScheduler
}

let started = false
let running = false
let scheduler: WarmupScheduler = scheduleAfterFirstPaintIdle
let cancelScheduledTask: (() => void) | null = null
let unsubscribeAccessChanges: (() => void) | null = null

const completedTaskKeys = new Set<string>()
const queuedTaskKeys = new Set<string>()
const deferredTasks = new Map<string, UiComponentWarmupTask>()
let queue: UiComponentWarmupTask[] = []

function getTaskSurface(task: UiComponentWarmupTask): SurfaceId | null {
  if (!task.key.startsWith('surface:')) return null
  const surface = task.key.slice('surface:'.length)
  return (SURFACE_IDS as readonly string[]).includes(surface) ? (surface as SurfaceId) : null
}

function shouldDeferTask(task: UiComponentWarmupTask): boolean {
  const surface = getTaskSurface(task)
  if (!surface) return false

  const access = moduleAccessModel.surfaceAccess(surface)
  return Boolean(access && access.status !== 'enabled')
}

function enqueueTask(task: UiComponentWarmupTask): void {
  if (
    completedTaskKeys.has(task.key) ||
    queuedTaskKeys.has(task.key) ||
    deferredTasks.has(task.key)
  ) {
    return
  }

  queuedTaskKeys.add(task.key)
  queue.push(task)
}

function enqueueTasks(tasks: UiComponentWarmupTask[]): void {
  for (const task of tasks) {
    enqueueTask(task)
  }
}

function scheduleNextTask(): void {
  if (!started || running || cancelScheduledTask) {
    return
  }

  while (queue.length > 0) {
    const task = queue.shift()!
    queuedTaskKeys.delete(task.key)

    if (completedTaskKeys.has(task.key)) {
      continue
    }

    if (shouldDeferTask(task)) {
      deferredTasks.set(task.key, task)
      continue
    }

    running = true
    cancelScheduledTask = scheduler(
      () => {
        cancelScheduledTask = null
        void task
          .run()
          .then(() => {
            completedTaskKeys.add(task.key)
          })
          .catch((error) => {
            console.warn('[dashboard] idle component warmup failed:', {
              task: task.key,
              error,
            })
          })
          .finally(() => {
            running = false
            scheduleNextTask()
          })
      },
      {timeoutMs: WARMUP_IDLE_TIMEOUT_MS},
    )
    return
  }
}

function requeueEnabledDeferredTasks(): void {
  for (const [key, task] of Array.from(deferredTasks)) {
    if (shouldDeferTask(task)) {
      continue
    }

    deferredTasks.delete(key)
    enqueueTask(task)
  }

  scheduleNextTask()
}

function ensureAccessSubscription(): void {
  if (unsubscribeAccessChanges) {
    return
  }

  unsubscribeAccessChanges = subscribeAfterInitial(moduleAccessModel.states, requeueEnabledDeferredTasks)
}

export function getStartupUiComponentWarmupTasks(): UiComponentWarmupTask[] {
  const surfaceTasks = new Map(getSurfaceComponentWarmupTasks().map((task) => [task.key, task]))
  const orderedKeys = [
    'route:welcome',
    'route:no-connection',
    ...COMMON_SURFACE_ORDER.map((surface) => `surface:${surface}`),
    ...GATED_SURFACE_ORDER.map((surface) => `surface:${surface}`),
    'overlay:details',
    'overlay:gallery',
    'overlay:preview',
    'overlay:video',
    'document:markdown',
  ]
  const tasks: UiComponentWarmupTask[] = []

  for (const key of orderedKeys) {
    const task = surfaceTasks.get(key)
    if (task) {
      tasks.push(task)
    }
  }

  tasks.push(getPassmanagerExtendedWarmupTask())
  return tasks
}

export function startUiComponentIdleWarmup(
  options: StartUiComponentIdleWarmupOptions = {},
): () => void {
  if (started) {
    return stopUiComponentIdleWarmup
  }

  started = true
  scheduler = options.schedule ?? scheduleAfterFirstPaintIdle
  ensureAccessSubscription()
  enqueueTasks(options.tasks ?? getStartupUiComponentWarmupTasks())
  scheduleNextTask()

  return stopUiComponentIdleWarmup
}

export function stopUiComponentIdleWarmup(): void {
  started = false
  running = false
  queue = []
  queuedTaskKeys.clear()
  deferredTasks.clear()
  cancelScheduledTask?.()
  cancelScheduledTask = null
  unsubscribeAccessChanges?.()
  unsubscribeAccessChanges = null
  scheduler = scheduleAfterFirstPaintIdle
}

export function resetUiComponentIdleWarmupForTests(): void {
  stopUiComponentIdleWarmup()
  completedTaskKeys.clear()
}
