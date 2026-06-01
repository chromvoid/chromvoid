import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  cancelImageDisplaySchedulerJobs,
  getImageDisplaySchedulerDebugSnapshot,
  resetImageDisplaySchedulerForTests,
  scheduleImageDisplayJob,
} from '../../src/features/media/components/image-display-scheduler'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

describe('image display scheduler', () => {
  afterEach(() => {
    resetImageDisplaySchedulerForTests()
  })

  it('caps concurrent thumbnail and current preview jobs', async () => {
    const thumbnailPending = new Map<number, ReturnType<typeof deferred<string>>>()
    const currentPending = new Map<number, ReturnType<typeof deferred<string>>>()
    let activeThumbnails = 0
    let activeCurrent = 0
    let maxThumbnails = 0
    let maxCurrent = 0

    const thumbnailLoads = Array.from({length: 6}, (_, index) =>
      scheduleImageDisplayJob(
        {jobType: 'thumbnail', intentId: `thumbnail:${index}`},
        async () => {
          activeThumbnails += 1
          maxThumbnails = Math.max(maxThumbnails, activeThumbnails)
          const pending = deferred<string>()
          thumbnailPending.set(index, pending)
          const value = await pending.promise
          activeThumbnails -= 1
          return value
        },
      ),
    )
    const currentLoads = Array.from({length: 3}, (_, index) =>
      scheduleImageDisplayJob(
        {jobType: 'current-preview', intentId: `current:${index}`},
        async () => {
          activeCurrent += 1
          maxCurrent = Math.max(maxCurrent, activeCurrent)
          const pending = deferred<string>()
          currentPending.set(index, pending)
          const value = await pending.promise
          activeCurrent -= 1
          return value
        },
      ),
    )

    await vi.waitFor(() => {
      expect(thumbnailPending.size).toBe(2)
      expect(currentPending.size).toBe(1)
    })
    expect(getImageDisplaySchedulerDebugSnapshot()).toMatchObject({
      activeByType: {
        'current-preview': 1,
        thumbnail: 2,
      },
      queuedByType: {
        'current-preview': 2,
        thumbnail: 4,
      },
      queuedByPriority: {
        '500': 2,
        '400': 4,
      },
    })

    thumbnailPending.get(0)?.resolve('thumbnail:0')
    currentPending.get(0)?.resolve('current:0')

    await vi.waitFor(() => {
      expect(thumbnailPending.size).toBe(2)
      expect(currentPending.size).toBe(2)
    })

    for (const pending of thumbnailPending.values()) {
      pending.resolve('thumbnail')
    }
    for (const pending of currentPending.values()) {
      pending.resolve('current')
    }

    await vi.waitFor(() => {
      expect(currentPending.size).toBe(3)
    })
    for (const pending of currentPending.values()) {
      pending.resolve('current')
    }

    await vi.waitFor(() => {
      expect(thumbnailPending.size).toBe(4)
    })
    for (const pending of thumbnailPending.values()) {
      pending.resolve('thumbnail')
    }

    await vi.waitFor(() => {
      expect(thumbnailPending.size).toBe(6)
    })
    for (const pending of thumbnailPending.values()) {
      pending.resolve('thumbnail')
    }

    await Promise.all([...thumbnailLoads, ...currentLoads])

    expect(maxThumbnails).toBe(2)
    expect(maxCurrent).toBe(1)
    expect(getImageDisplaySchedulerDebugSnapshot().maxActiveByType).toMatchObject({
      'current-preview': 1,
      thumbnail: 2,
    })
  })

  it('cancels queued jobs and releases late active results', async () => {
    const activePending = deferred<{release: () => void}>()
    const release = vi.fn()
    const active = scheduleImageDisplayJob(
      {
        jobType: 'current-preview',
        intentId: 'current:active',
        releaseResult: (value) => value.release(),
      },
      () => activePending.promise,
    )
    const queued = scheduleImageDisplayJob(
      {
        jobType: 'current-preview',
        intentId: 'current:queued',
        releaseResult: (value: {release: () => void}) => value.release(),
      },
      async () => ({release: vi.fn()}),
    )

    await vi.waitFor(() => {
      expect(getImageDisplaySchedulerDebugSnapshot()).toMatchObject({
        activeByType: {'current-preview': 1},
        queuedByType: {'current-preview': 1},
      })
    })

    cancelImageDisplaySchedulerJobs()

    await expect(queued).rejects.toMatchObject({name: 'AbortError'})
    activePending.resolve({release})
    await expect(active).rejects.toMatchObject({name: 'AbortError'})
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('keeps canceled active jobs counted until non-cooperative work settles', async () => {
    const firstPending = deferred<string>()
    const secondPending = deferred<string>()
    const started: number[] = []
    const controller = new AbortController()

    const first = scheduleImageDisplayJob(
      {
        jobType: 'current-preview',
        intentId: 'current:first',
        signal: controller.signal,
      },
      async () => {
        started.push(1)
        return await firstPending.promise
      },
    )
    const second = scheduleImageDisplayJob(
      {jobType: 'current-preview', intentId: 'current:second'},
      async () => {
        started.push(2)
        return await secondPending.promise
      },
    )

    await vi.waitFor(() => {
      expect(started).toEqual([1])
    })

    controller.abort()
    await expect(first).rejects.toMatchObject({name: 'AbortError'})
    expect(started).toEqual([1])
    expect(getImageDisplaySchedulerDebugSnapshot()).toMatchObject({
      activeByType: {'current-preview': 1},
      queuedByType: {'current-preview': 1},
    })

    firstPending.resolve('late-first')

    await vi.waitFor(() => {
      expect(started).toEqual([1, 2])
    })
    secondPending.resolve('second')
    await expect(second).resolves.toBe('second')
  })

  it('runs current materialization without waiting behind lower-priority work', async () => {
    const firstPending = deferred<string>()
    const secondPending = deferred<string>()
    const started: string[] = []

    const first = scheduleImageDisplayJob(
      {jobType: 'prepared-source', intentId: 'thumbnail:first', priority: 100},
      async () => {
        started.push('thumbnail:first')
        return await firstPending.promise
      },
    )
    const second = scheduleImageDisplayJob(
      {jobType: 'prepared-source', intentId: 'thumbnail:second', priority: 100},
      async () => {
        started.push('thumbnail:second')
        return await secondPending.promise
      },
    )
    const third = scheduleImageDisplayJob(
      {jobType: 'prepared-source', intentId: 'thumbnail:third', priority: 100},
      async () => {
        started.push('thumbnail:third')
        return 'third'
      },
    )
    const current = scheduleImageDisplayJob(
      {jobType: 'prepared-source', intentId: 'current', priority: 500},
      async () => {
        started.push('current')
        return 'current'
      },
    )

    await vi.waitFor(() => {
      expect(started).toEqual(['thumbnail:first', 'thumbnail:second', 'current'])
    })

    await expect(current).resolves.toBe('current')

    firstPending.resolve('first')
    await vi.waitFor(() => {
      expect(started).toEqual(['thumbnail:first', 'thumbnail:second', 'current', 'thumbnail:third'])
    })

    secondPending.resolve('second')
    await Promise.all([first, second, third])
  })

  it('caps heavy background prepared-source and prewarm jobs together', async () => {
    const firstPending = deferred<string>()
    const secondPending = deferred<string>()
    const started: string[] = []

    const first = scheduleImageDisplayJob(
      {jobType: 'prepared-source', intentId: 'prepared:first', priority: 100},
      async () => {
        started.push('prepared:first')
        return await firstPending.promise
      },
    )
    const second = scheduleImageDisplayJob(
      {jobType: 'prewarm', intentId: 'prewarm:first', priority: 100},
      async () => {
        started.push('prewarm:first')
        return await secondPending.promise
      },
    )
    const third = scheduleImageDisplayJob(
      {jobType: 'prepared-source', intentId: 'prepared:second', priority: 100},
      async () => {
        started.push('prepared:second')
        return 'prepared:second'
      },
    )

    await vi.waitFor(() => {
      expect(started).toEqual(['prepared:first', 'prewarm:first'])
    })
    expect(getImageDisplaySchedulerDebugSnapshot()).toMatchObject({
      activeByType: {
        'prepared-source': 1,
        prewarm: 1,
      },
      queuedByType: {
        'prepared-source': 1,
      },
    })

    firstPending.resolve('prepared:first')
    await vi.waitFor(() => {
      expect(started).toEqual(['prepared:first', 'prewarm:first', 'prepared:second'])
    })
    secondPending.resolve('prewarm:first')
    await Promise.all([first, second, third])
  })
})
