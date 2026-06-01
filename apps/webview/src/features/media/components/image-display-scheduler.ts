export type ImageDisplaySchedulerJobType =
  | 'current-preview'
  | 'adjacent-preview'
  | 'thumbnail'
  | 'prepared-source'
  | 'prewarm'

export type ImageDisplaySchedulerDebugSnapshot = {
  activeCount: number
  queuedCount: number
  activeByType: Record<ImageDisplaySchedulerJobType, number>
  queuedByType: Record<ImageDisplaySchedulerJobType, number>
  queuedByPriority: Record<string, number>
  maxActiveByType: Record<ImageDisplaySchedulerJobType, number>
  cancelledCount: number
  completedCount: number
}

export type ScheduleImageDisplayJobOptions<T> = {
  jobType: ImageDisplaySchedulerJobType
  priority?: number
  intentId: string
  signal?: AbortSignal
  releaseResult?: (value: T) => void | Promise<void>
}

type ScheduledJob = {
  id: number
  jobType: ImageDisplaySchedulerJobType
  priority: number
  intentId: string
  sequence: number
  controller: AbortController
  task: (signal: AbortSignal) => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  releaseResult?: (value: unknown) => void | Promise<void>
  releaseExternalAbort: () => void
  cancelled: boolean
  running: boolean
  slotReleased: boolean
}

const JOB_LIMITS: Record<ImageDisplaySchedulerJobType, number> = {
  'current-preview': 1,
  'adjacent-preview': 1,
  thumbnail: 2,
  'prepared-source': 2,
  prewarm: 1,
}

const JOB_PRIORITIES: Record<ImageDisplaySchedulerJobType, number> = {
  'current-preview': 500,
  thumbnail: 400,
  'adjacent-preview': 300,
  prewarm: 100,
  'prepared-source': 0,
}

const JOB_TYPES = Object.keys(JOB_LIMITS) as ImageDisplaySchedulerJobType[]
const BACKGROUND_JOB_TYPES = new Set<ImageDisplaySchedulerJobType>([
  'adjacent-preview',
  'thumbnail',
  'prepared-source',
  'prewarm',
])
const HEAVY_BACKGROUND_JOB_TYPES = new Set<ImageDisplaySchedulerJobType>(['prepared-source', 'prewarm'])
const MAX_ACTIVE_BACKGROUND_JOBS = 2

function createAbortError() {
  return new DOMException('Aborted', 'AbortError')
}

function emptyCounterRecord(): Record<ImageDisplaySchedulerJobType, number> {
  return {
    'current-preview': 0,
    'adjacent-preview': 0,
    thumbnail: 0,
    'prepared-source': 0,
    prewarm: 0,
  }
}

class ImageDisplayScheduler {
  private readonly queues = new Map<ImageDisplaySchedulerJobType, ScheduledJob[]>()
  private readonly activeCounts = new Map<ImageDisplaySchedulerJobType, number>()
  private readonly maxActiveByType = emptyCounterRecord()
  private readonly activeJobs = new Set<ScheduledJob>()
  private nextJobId = 0
  private nextSequence = 0
  private cancelledCount = 0
  private completedCount = 0

  schedule<T>(
    options: ScheduleImageDisplayJobOptions<T>,
    task: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (options.signal?.aborted) {
      return Promise.reject(createAbortError())
    }

    const controller = new AbortController()
    let job: ScheduledJob

    const promise = new Promise<T>((resolve, reject) => {
      job = {
        id: ++this.nextJobId,
        jobType: options.jobType,
        priority: options.priority ?? JOB_PRIORITIES[options.jobType],
        intentId: options.intentId,
        sequence: ++this.nextSequence,
        controller,
        task: task as (signal: AbortSignal) => Promise<unknown>,
        resolve: (value) => resolve(value as T),
        reject,
        releaseResult: options.releaseResult
          ? (value) => options.releaseResult?.(value as T)
          : undefined,
        releaseExternalAbort: () => {},
        cancelled: false,
        running: false,
        slotReleased: false,
      }

      if (options.signal) {
        const handleAbort = () => this.cancelJob(job)
        options.signal.addEventListener('abort', handleAbort, {once: true})
        job.releaseExternalAbort = () => options.signal?.removeEventListener('abort', handleAbort)
      }

      this.enqueue(job)
      this.drainAll()
    })

    return promise
  }

  cancelAll(): void {
    for (const queue of this.queues.values()) {
      for (const job of [...queue]) {
        this.cancelJob(job)
      }
    }

    for (const job of [...this.activeJobs]) {
      this.cancelJob(job)
    }
  }

  getDebugSnapshot(): ImageDisplaySchedulerDebugSnapshot {
    const activeByType = emptyCounterRecord()
    const queuedByType = emptyCounterRecord()
    const queuedByPriority: Record<string, number> = {}

    for (const jobType of JOB_TYPES) {
      activeByType[jobType] = this.activeCounts.get(jobType) ?? 0
      const queue = this.queues.get(jobType) ?? []
      queuedByType[jobType] = queue.length
      for (const job of queue) {
        const priority = String(job.priority)
        queuedByPriority[priority] = (queuedByPriority[priority] ?? 0) + 1
      }
    }

    return {
      activeCount: Object.values(activeByType).reduce((total, count) => total + count, 0),
      queuedCount: Object.values(queuedByType).reduce((total, count) => total + count, 0),
      activeByType,
      queuedByType,
      queuedByPriority,
      maxActiveByType: {...this.maxActiveByType},
      cancelledCount: this.cancelledCount,
      completedCount: this.completedCount,
    }
  }

  resetForTests(): void {
    this.cancelAll()
    this.queues.clear()
    this.activeCounts.clear()
    this.activeJobs.clear()
    for (const jobType of JOB_TYPES) {
      this.maxActiveByType[jobType] = 0
    }
    this.nextJobId = 0
    this.nextSequence = 0
    this.cancelledCount = 0
    this.completedCount = 0
  }

  private enqueue(job: ScheduledJob): void {
    const queue = this.queues.get(job.jobType) ?? []
    queue.push(job)
    queue.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence)
    this.queues.set(job.jobType, queue)
  }

  private drainAll(): void {
    while (true) {
      const job = this.takeNextStartableJob()
      if (!job) return
      this.start(job)
    }
  }

  private takeNextStartableJob(): ScheduledJob | null {
    let selected: ScheduledJob | null = null
    let selectedQueue: ScheduledJob[] | null = null

    for (const jobType of JOB_TYPES) {
      const queue = this.queues.get(jobType)
      if (!queue) continue

      while (queue[0]?.cancelled || queue[0]?.controller.signal.aborted) {
        queue.shift()
      }

      const candidate = queue[0]
      if (!candidate || !this.canStart(candidate)) {
        continue
      }

      if (
        !selected ||
        candidate.priority > selected.priority ||
        (candidate.priority === selected.priority && candidate.sequence < selected.sequence)
      ) {
        selected = candidate
        selectedQueue = queue
      }
    }

    if (!selected || !selectedQueue) {
      return null
    }

    selectedQueue.shift()
    return selected
  }

  private canStart(job: ScheduledJob): boolean {
    const isCurrentMaterialization = this.isCurrentCriticalMaterialization(job)

    if (
      !isCurrentMaterialization &&
      (this.activeCounts.get(job.jobType) ?? 0) >= JOB_LIMITS[job.jobType]
    ) {
      return false
    }

    if (!BACKGROUND_JOB_TYPES.has(job.jobType)) {
      return true
    }

    if (isCurrentMaterialization) {
      return this.activeCurrentCriticalMaterializationCount() === 0
    }

    if (this.hasCurrentPreviewPressure()) {
      return false
    }

    return this.activeBackgroundCount() < MAX_ACTIVE_BACKGROUND_JOBS
  }

  private isCurrentCriticalMaterialization(job: ScheduledJob): boolean {
    return job.jobType === 'prepared-source' && job.priority >= JOB_PRIORITIES['current-preview']
  }

  private activeCurrentCriticalMaterializationCount(): number {
    let count = 0
    for (const job of this.activeJobs) {
      if (this.isCurrentCriticalMaterialization(job)) {
        count += 1
      }
    }
    return count
  }

  private hasCurrentPreviewPressure(): boolean {
    return (
      (this.activeCounts.get('current-preview') ?? 0) > 0 ||
      (this.queues.get('current-preview')?.some((job) => !job.cancelled && !job.controller.signal.aborted) ??
        false)
    )
  }

  private activeBackgroundCount(): number {
    let count = 0
    for (const jobType of HEAVY_BACKGROUND_JOB_TYPES) {
      count += this.activeCounts.get(jobType) ?? 0
    }
    return count
  }

  private start(job: ScheduledJob): void {
    job.running = true
    const activeCount = (this.activeCounts.get(job.jobType) ?? 0) + 1
    this.activeCounts.set(job.jobType, activeCount)
    this.maxActiveByType[job.jobType] = Math.max(this.maxActiveByType[job.jobType], activeCount)
    this.activeJobs.add(job)

    let taskPromise: Promise<unknown>
    try {
      taskPromise = job.task(job.controller.signal)
    } catch (error) {
      taskPromise = Promise.reject(error)
    }

    taskPromise
      .then(
        async (value) => {
          if (job.cancelled || job.controller.signal.aborted) {
            await this.releaseResult(job, value)
            job.reject(createAbortError())
            return
          }

          this.completedCount += 1
          job.resolve(value)
        },
        (error) => {
          job.reject(error)
        },
      )
      .finally(() => {
        this.finish(job)
      })
  }

  private cancelJob(job: ScheduledJob): void {
    if (job.cancelled) {
      return
    }

    job.cancelled = true
    this.cancelledCount += 1
    job.controller.abort()
    job.releaseExternalAbort()

    if (!job.running) {
      const queue = this.queues.get(job.jobType)
      if (queue) {
        const index = queue.indexOf(job)
        if (index >= 0) {
          queue.splice(index, 1)
        }
      }
    }

    job.reject(createAbortError())
  }

  private finish(job: ScheduledJob): void {
    job.releaseExternalAbort()
    this.activeJobs.delete(job)

    this.releaseSlot(job)

    this.drainAll()
  }

  private releaseSlot(job: ScheduledJob): void {
    if (!job.running || job.slotReleased) {
      return
    }

    job.slotReleased = true
    const activeCount = this.activeCounts.get(job.jobType) ?? 0
    if (activeCount <= 1) {
      this.activeCounts.delete(job.jobType)
    } else {
      this.activeCounts.set(job.jobType, activeCount - 1)
    }
  }

  private async releaseResult(job: ScheduledJob, value: unknown): Promise<void> {
    try {
      await job.releaseResult?.(value)
    } catch (error) {
      console.warn('[image-display-scheduler] failed to release canceled result', error)
    }
  }
}

const imageDisplayScheduler = new ImageDisplayScheduler()

export function getDefaultImageDisplayJobPriority(jobType: ImageDisplaySchedulerJobType): number {
  return JOB_PRIORITIES[jobType]
}

export function scheduleImageDisplayJob<T>(
  options: ScheduleImageDisplayJobOptions<T>,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return imageDisplayScheduler.schedule(options, task)
}

export function cancelImageDisplaySchedulerJobs(): void {
  imageDisplayScheduler.cancelAll()
}

export function getImageDisplaySchedulerDebugSnapshot(): ImageDisplaySchedulerDebugSnapshot {
  return imageDisplayScheduler.getDebugSnapshot()
}

export function resetImageDisplaySchedulerForTests(): void {
  imageDisplayScheduler.resetForTests()
}
