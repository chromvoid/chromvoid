import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {FileMediaInspectionFlow} from '../../src/features/file-manager/media-inspection-flow.model'
import type {AppContext} from '../../src/shared/services/app-context'
import type {FileListItem} from '../../src/shared/contracts/file-manager'

const mobileVisibleInspectionDelayMs = 3_000

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

function createItem(id: number): FileListItem {
  return {
    id,
    path: `/video-${id}.mp4`,
    name: `video-${id}.mp4`,
    isDir: false,
    size: 128,
    lastModified: 1,
    sourceRevision: 1,
    mimeType: 'video/mp4',
    mediaInfo: null,
    selected: false,
  }
}

function createFlow({
  lockPending = false,
  layout = 'desktop',
  inspectMediaInfo = vi.fn(),
}: {
  lockPending?: boolean
  layout?: 'desktop' | 'mobile'
  inspectMediaInfo?: ReturnType<typeof vi.fn>
} = {}) {
  const vaultLockPending = atom(lockPending)
  const layoutMode = atom(layout)
  const applyEvent = vi.fn()
  const ctx = {
    store: {
      vaultLockPending,
      layoutMode,
    },
    catalog: {
      api: {
        inspectMediaInfo,
      },
      catalog: {
        applyEvent,
      },
    },
  } as unknown as AppContext

  return {
    applyEvent,
    flow: new FileMediaInspectionFlow(ctx),
    inspectMediaInfo,
    vaultLockPending,
  }
}

describe('FileMediaInspectionFlow', () => {
  afterEach(() => {
    resetRuntimeCapabilities()
    runtimeModeModel.handleTransportDisconnect()
  })

  it('does not start visible inspections while a vault lock is pending', () => {
    const inspectMediaInfo = vi.fn()
    const {flow} = createFlow({lockPending: true, inspectMediaInfo})

    flow.queueVisible([createItem(1)])

    expect(inspectMediaInfo).not.toHaveBeenCalled()
  })

  it('skips Android visible inspections without scheduling a timer', () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({platform: 'android', mobile: true})
    const inspectMediaInfo = vi.fn()
    const {flow} = createFlow({inspectMediaInfo})

    try {
      flow.queueVisible([createItem(1), createItem(2)])

      expect(inspectMediaInfo).not.toHaveBeenCalled()
      expect(flow.getDebugSnapshot()).toMatchObject({
        deferredCount: 0,
        hasDeferredTimer: false,
        maxVisibleConcurrency: 1,
        pendingCount: 0,
      })

      vi.advanceTimersByTime(mobileVisibleInspectionDelayMs)
      expect(inspectMediaInfo).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores stale inspection results after cancellation', async () => {
    const inspect = deferred<{
      nodeId: number
      mediaInfo: {kind: 'video'; audioTracks: number; videoTracks: number}
      sourceRevision: number
      mediaInspectedRevision: number
    }>()
    const inspectMediaInfo = vi.fn(() => inspect.promise)
    const {applyEvent, flow} = createFlow({inspectMediaInfo})

    flow.queueVisible([createItem(1)])
    expect(inspectMediaInfo).toHaveBeenCalledWith(1)

    flow.cancelPending('vault-lock')
    inspect.resolve({
      nodeId: 1,
      mediaInfo: {kind: 'video', audioTracks: 0, videoTracks: 1},
      sourceRevision: 1,
      mediaInspectedRevision: 1,
    })
    await Promise.resolve()

    expect(applyEvent).not.toHaveBeenCalled()
  })

  it('defers visible inspections on mobile', () => {
    vi.useFakeTimers()
    const inspectMediaInfo = vi.fn(() => new Promise(() => {}))
    const {flow} = createFlow({layout: 'mobile', inspectMediaInfo})

    try {
      flow.queueVisible([createItem(1), createItem(2), createItem(3)])

      expect(inspectMediaInfo).not.toHaveBeenCalled()
      expect(flow.getDebugSnapshot()).toMatchObject({
        deferredCount: 3,
        hasDeferredTimer: true,
        maxVisibleConcurrency: 1,
      })

      vi.advanceTimersByTime(mobileVisibleInspectionDelayMs)

      expect(inspectMediaInfo).toHaveBeenCalledTimes(1)
      expect(inspectMediaInfo).toHaveBeenCalledWith(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels deferred mobile visible inspections before they start', () => {
    vi.useFakeTimers()
    const inspectMediaInfo = vi.fn()
    const {flow} = createFlow({layout: 'mobile', inspectMediaInfo})

    try {
      flow.queueVisible([createItem(1)])
      flow.cancelPending('vault-lock')
      vi.advanceTimersByTime(mobileVisibleInspectionDelayMs)

      expect(inspectMediaInfo).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('runs open-priority inspection on Android while visible inspections are optimized out', async () => {
    setRuntimeCapabilities({platform: 'android', mobile: true})
    const pending = deferred<{
      nodeId: number
      mediaInfo: {kind: 'video'; audioTracks: number; videoTracks: number}
      sourceRevision: number
      mediaInspectedRevision: number
    }>()
    const inspectMediaInfo = vi.fn(() => pending.promise)
    const {flow} = createFlow({inspectMediaInfo})
    const item = createItem(1)

    const opened = flow.ensureBeforeOpen(item, () => item)

    expect(inspectMediaInfo).toHaveBeenCalledTimes(1)
    expect(inspectMediaInfo).toHaveBeenCalledWith(1)
    expect(flow.getDebugSnapshot()).toMatchObject({
      hasDeferredTimer: false,
      pendingCount: 1,
    })

    pending.resolve({
      nodeId: 1,
      mediaInfo: {kind: 'video', audioTracks: 0, videoTracks: 1},
      sourceRevision: 1,
      mediaInspectedRevision: 1,
    })

    await expect(opened).resolves.toMatchObject({
      mediaInfo: {kind: 'video'},
    })
  })

  it('skips visible inspections for old remote cores without split capability', () => {
    runtimeModeModel.setCoreMode({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}})
    const inspectMediaInfo = vi.fn()
    const {flow} = createFlow({inspectMediaInfo})

    flow.queueVisible([createItem(1)])

    expect(inspectMediaInfo).not.toHaveBeenCalled()
    expect(flow.getDebugSnapshot()).toMatchObject({
      deferredCount: 0,
      hasDeferredTimer: false,
      pendingCount: 0,
    })
  })

  it('allows visible inspections for remote cores with split capability', () => {
    runtimeModeModel.setCoreMode(
      {remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}},
      ['remote_media_inspection_split_v1'],
    )
    const inspectMediaInfo = vi.fn(() => new Promise(() => {}))
    const {flow} = createFlow({inspectMediaInfo})

    flow.queueVisible([createItem(1)])

    expect(inspectMediaInfo).toHaveBeenCalledTimes(1)
    expect(inspectMediaInfo).toHaveBeenCalledWith(1)
  })

  it('skips Android visible inspections without canceling open-priority work', async () => {
    setRuntimeCapabilities({platform: 'android', mobile: true})
    const pending = deferred<{
      nodeId: number
      mediaInfo: {kind: 'video'; audioTracks: number; videoTracks: number}
      sourceRevision: number
      mediaInspectedRevision: number
    }>()
    const inspectMediaInfo = vi.fn(() => pending.promise)
    const {flow} = createFlow({inspectMediaInfo})
    const openItem = createItem(2)

    const opened = flow.ensureBeforeOpen(openItem, () => openItem)
    expect(inspectMediaInfo).toHaveBeenCalledTimes(1)
    expect(inspectMediaInfo).toHaveBeenCalledWith(2)

    flow.queueVisible([createItem(1)])

    expect(flow.getDebugSnapshot()).toMatchObject({
      deferredCount: 0,
      hasDeferredTimer: false,
      pendingCount: 1,
    })
    expect(inspectMediaInfo).toHaveBeenCalledTimes(1)

    pending.resolve({
      nodeId: 2,
      mediaInfo: {kind: 'video', audioTracks: 0, videoTracks: 1},
      sourceRevision: 1,
      mediaInspectedRevision: 1,
    })

    await expect(opened).resolves.toMatchObject({
      mediaInfo: {kind: 'video'},
    })
  })

  it('skips visible inspections already completed for the current source revision', () => {
    const inspectMediaInfo = vi.fn()
    const {flow} = createFlow({inspectMediaInfo})
    const item = createItem(1)

    flow.queueVisible([{...item, mediaInspectedRevision: item.sourceRevision}])

    expect(inspectMediaInfo).not.toHaveBeenCalled()
  })

  it('treats cleared inspected revisions as inspectable for ISO-BMFF candidates', () => {
    const inspectMediaInfo = vi.fn(() => new Promise(() => {}))
    const {flow} = createFlow({inspectMediaInfo})
    const item = createItem(1)

    flow.queueVisible([{...item, mediaInspectedRevision: 0}])

    expect(inspectMediaInfo).toHaveBeenCalledTimes(1)
    expect(inspectMediaInfo).toHaveBeenCalledWith(1)
  })

  it('coalesces duplicate visible inspections while the first call is in flight', () => {
    const inspectMediaInfo = vi.fn(() => new Promise(() => {}))
    const {flow} = createFlow({inspectMediaInfo})
    const item = createItem(1)

    flow.queueVisible([item])
    flow.queueVisible([item])

    expect(inspectMediaInfo).toHaveBeenCalledTimes(1)
    expect(flow.getDebugSnapshot()).toMatchObject({
      pendingCount: 1,
      inFlightCount: 1,
    })
  })

  it('starts open-priority inspection immediately on mobile without waiting for visible delay', async () => {
    vi.useFakeTimers()
    const pending = deferred<{
      nodeId: number
      mediaInfo: {kind: 'video'; audioTracks: number; videoTracks: number}
      sourceRevision: number
      mediaInspectedRevision: number
    }>()
    const inspectMediaInfo = vi.fn(() => pending.promise)
    const {flow} = createFlow({layout: 'mobile', inspectMediaInfo})
    const item = createItem(1)

    try {
      const opened = flow.ensureBeforeOpen(item, () => item)

      expect(inspectMediaInfo).toHaveBeenCalledTimes(1)
      expect(inspectMediaInfo).toHaveBeenCalledWith(1)
      expect(flow.getDebugSnapshot()).toMatchObject({
        hasDeferredTimer: false,
        pendingCount: 1,
      })

      pending.resolve({
        nodeId: 1,
        mediaInfo: {kind: 'video', audioTracks: 0, videoTracks: 1},
        sourceRevision: 1,
        mediaInspectedRevision: 1,
      })
      await expect(opened).resolves.toMatchObject({
        mediaInfo: {kind: 'video'},
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not cache a null result without a completed inspected revision', async () => {
    const inspectMediaInfo = vi.fn(() =>
      Promise.resolve({
        nodeId: 1,
        mediaInfo: null,
        sourceRevision: 1,
        mediaInspectedRevision: 0,
      }),
    )
    const {flow} = createFlow({inspectMediaInfo})
    const item = createItem(1)

    flow.queueVisible([item])
    await vi.waitFor(() => {
      expect(flow.getDebugSnapshot()).toMatchObject({pendingCount: 0, inFlightCount: 0})
    })
    flow.queueVisible([item])

    expect(inspectMediaInfo).toHaveBeenCalledTimes(2)
  })

  it('limits visible inspections to two at a time on desktop', () => {
    const inspectMediaInfo = vi.fn(() => new Promise(() => {}))
    const {flow} = createFlow({layout: 'desktop', inspectMediaInfo})

    flow.queueVisible([createItem(1), createItem(2), createItem(3)])

    expect(inspectMediaInfo).toHaveBeenCalledTimes(2)
    expect(inspectMediaInfo).toHaveBeenNthCalledWith(1, 1)
    expect(inspectMediaInfo).toHaveBeenNthCalledWith(2, 2)
    expect(flow.getDebugSnapshot()).toMatchObject({
      pendingCount: 2,
      inFlightCount: 2,
      maxVisibleConcurrency: 2,
    })
  })
})
