import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ToastManagerModel} from '../../src/shared/services/toast-manager.model'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ToastManagerModel mobile policy', () => {
  it('keeps one toast and updates a matching key in place', () => {
    const model = new ToastManagerModel(() => true)
    const first = model.show({
      key: 'delete:group-1',
      message: 'Deleting…',
      variant: 'loading',
    })
    const second = model.show({
      key: 'delete:group-1',
      message: 'Deleted',
      variant: 'success',
    })

    const items = model.controllers.get('bottom-center')!.model.state.items()
    expect(second.id).toBe(first.id)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({id: first.id, message: 'Deleted', level: 'success'})
  })

  it('creates a fresh keyed toast after the previous timer expires', () => {
    const model = new ToastManagerModel(() => true)
    const first = model.show({key: 'sync', message: 'First', variant: 'success'})
    vi.advanceTimersByTime(5000)

    const second = model.show({key: 'sync', message: 'Second', variant: 'success'})

    expect(second.id).not.toBe(first.id)
    expect(model.controllers.get('bottom-center')!.model.state.items()).toHaveLength(1)
  })

  it('drops transient feedback while loading or critical feedback is active', () => {
    const model = new ToastManagerModel(() => true)
    const loading = model.show({message: 'Loading', variant: 'loading'})
    const droppedSuccess = model.show({message: 'Done', variant: 'success'})

    expect(droppedSuccess.id).toBe('')
    expect(model.controllers.get('bottom-center')!.model.state.items()).toHaveLength(1)

    loading.update({message: 'Failed', variant: 'error'})
    const droppedInfo = model.show({message: 'FYI', variant: 'info'})
    expect(droppedInfo.id).toBe('')
    expect(model.controllers.get('bottom-center')!.model.state.items()[0]?.level).toBe('error')
  })

  it('lets warning replace loading and loading replace transient feedback', () => {
    const model = new ToastManagerModel(() => true)
    model.show({message: 'Saved', variant: 'success'})
    model.show({message: 'Working', variant: 'loading'})

    expect(model.controllers.get('bottom-center')!.model.state.items()[0]?.level).toBe('loading')

    model.show({message: 'Check this', variant: 'warning'})
    const items = model.controllers.get('bottom-center')!.model.state.items()
    expect(items).toHaveLength(1)
    expect(items[0]?.level).toBe('warning')
  })

  it('exposes only the first action and respects dismissOnClick', () => {
    const model = new ToastManagerModel(() => true)
    const retry = vi.fn()
    const open = vi.fn()
    const handle = model.show({
      message: 'Failed',
      variant: 'error',
      actions: [
        {label: 'Retry', onClick: retry, dismissOnClick: false},
        {label: 'Open', onClick: open},
      ],
    })

    const item = model.controllers.get('bottom-center')!.model.state.items()[0]
    expect(item?.actions).toHaveLength(1)
    item?.actions?.[0]?.onClick?.()
    expect(retry).toHaveBeenCalledOnce()
    expect(open).not.toHaveBeenCalled()
    expect(model.controllers.get('bottom-center')!.model.state.items()).toHaveLength(1)
    expect(handle.id).not.toBe('')
  })

  it('preserves desktop positions, four visible items and all actions', () => {
    const model = new ToastManagerModel(() => false)
    const actions = [
      {label: 'Undo', onClick: vi.fn(), dismissOnClick: false},
      {label: 'Open', onClick: vi.fn(), dismissOnClick: false},
    ]
    model.show({message: 'Moved', position: 'top-left', actions})
    for (const message of ['1', '2', '3', '4']) {
      model.show({message, position: 'bottom-right'})
    }

    expect(model.controllers.get('top-left')!.model.state.items()[0]?.actions).toHaveLength(2)
    expect(model.controllers.get('bottom-right')!.model.state.visibleItems()).toHaveLength(4)
  })

  it('clears desktop backlog when entering mobile mode', () => {
    let mobile = false
    const model = new ToastManagerModel(() => mobile)
    model.show({message: 'Desktop 1'})
    model.show({message: 'Desktop 2'})

    mobile = true
    model.show({message: 'Mobile'})

    expect(model.controllers.get('bottom-right')!.model.state.items()).toEqual([])
    expect(model.controllers.get('bottom-center')!.model.state.items()).toHaveLength(1)
  })
})
