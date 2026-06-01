import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  MobilePointerDndModel,
  type MobilePointerDndAdapter,
  type MobilePointerDndPayload,
} from '../../src/shared/services/mobile-pointer-dnd'

type TestPayload = MobilePointerDndPayload & {
  domain: 'files'
  kind: 'item'
  id: string
}

function setRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = vi.fn(
    () =>
      ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...rect,
      }) as DOMRect,
  )
}

function createModel(adapter: Partial<MobilePointerDndAdapter<TestPayload>> = {}) {
  const drop = adapter.drop ?? vi.fn(async () => true)
  const canDrop = adapter.canDrop ?? vi.fn(() => true)
  const onCancel = adapter.onCancel ?? vi.fn()
  const onAfterDrop = adapter.onAfterDrop ?? vi.fn()
  const model = new MobilePointerDndModel<TestPayload>(
    {
      canDrop,
      drop,
      getGhostLabel: adapter.getGhostLabel ?? ((payload) => payload.id),
      onCancel,
      onAfterDrop,
    },
    {namespace: `test.mobileDnd.${Math.random()}`},
  )

  return {model, drop, canDrop, onCancel, onAfterDrop}
}

function createTarget(id: string, rect: Partial<DOMRect> = {}): HTMLElement {
  const target = document.createElement('div')
  target.setAttribute('data-mobile-dnd-target-id', id)
  setRect(target, {
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    ...rect,
  })
  document.body.append(target)
  return target
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return {promise, resolve}
}

describe('MobilePointerDndModel', () => {
  const payload: TestPayload = {domain: 'files', kind: 'item', id: 'source'}

  afterEach(() => {
    document.body.innerHTML = ''
    document.body.style.userSelect = ''
    ;(document.body.style as CSSStyleDeclaration & {webkitUserSelect?: string}).webkitUserSelect = ''
    vi.restoreAllMocks()
  })

  it('activates only after the movement threshold and commits to a valid target', async () => {
    const {model, drop, onAfterDrop} = createModel()
    createTarget('target')
    model.registerDropZoneRoot(document)

    model.begin(payload, {x: 10, y: 10})
    expect(model.active()).toBe(false)
    expect(model.move({x: 14, y: 10})).toBe(false)
    expect(model.active()).toBe(false)

    expect(model.move({x: 19, y: 10})).toBe(true)
    expect(model.active()).toBe(true)
    expect(model.dropTargetId()).toBe('target')
    expect(document.body.style.userSelect).toBe('none')

    await expect(model.commit({x: 19, y: 10})).resolves.toBe(true)
    expect(drop).toHaveBeenCalledWith('target', payload)
    expect(onAfterDrop).toHaveBeenCalledWith('target', payload, true)
    expect(model.active()).toBe(false)
    expect(model.payload()).toBeNull()
    expect(document.body.style.userSelect).toBe('')
  })

  it('chooses the smallest containing target', () => {
    const {model} = createModel()
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    outer.setAttribute('data-mobile-dnd-target-id', 'outer')
    inner.setAttribute('data-mobile-dnd-target-id', 'inner')
    setRect(outer, {left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100})
    setRect(inner, {left: 10, top: 10, right: 40, bottom: 40, width: 30, height: 30})
    outer.append(inner)
    document.body.append(outer)
    model.registerDropZoneRoot(document)
    model.begin(payload, {x: 12, y: 12})

    expect(model.hitTestTarget(20, 20)?.id).toBe('inner')
  })

  it('cancels without dropping when no valid target is under the pointer', async () => {
    const {model, drop, onCancel} = createModel({canDrop: () => false})
    createTarget('target')
    model.registerDropZoneRoot(document)

    model.begin(payload, {x: 0, y: 0})
    model.move({x: 20, y: 20})

    await expect(model.commit({x: 20, y: 20})).resolves.toBe(false)
    expect(drop).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledWith(payload)
    expect(model.dropTargetId()).toBeNull()
  })

  it('restores existing body user-select values after cancel', () => {
    const {model, onCancel} = createModel()
    const bodyStyle = document.body.style as CSSStyleDeclaration & {webkitUserSelect?: string}
    bodyStyle.userSelect = 'text'
    bodyStyle.webkitUserSelect = 'text'

    model.begin(payload, {x: 0, y: 0})
    model.move({x: 20, y: 0})

    expect(model.active()).toBe(true)
    expect(bodyStyle.userSelect).toBe('none')
    expect(bodyStyle.webkitUserSelect).toBe('none')

    model.cancel()

    expect(onCancel).toHaveBeenCalledWith(payload)
    expect(model.active()).toBe(false)
    expect(model.payload()).toBeNull()
    expect(bodyStyle.userSelect).toBe('text')
    expect(bodyStyle.webkitUserSelect).toBe('text')
  })

  it('clears the selected target when the pointer leaves valid drop zones', () => {
    const {model} = createModel()
    createTarget('target', {right: 40, bottom: 40, width: 40, height: 40})
    model.registerDropZoneRoot(document)

    model.begin(payload, {x: 4, y: 4})
    model.move({x: 24, y: 24})

    expect(model.dropTargetId()).toBe('target')
    expect(model.liveMessage()).toBe('Drop target selected')

    model.move({x: 80, y: 80})

    expect(model.dropTargetId()).toBeNull()
    expect(model.liveMessage()).toBe('')
  })

  it('ignores targets from roots after unregistering the root', () => {
    const {model} = createModel()
    createTarget('target')

    model.registerDropZoneRoot(document)
    model.begin(payload, {x: 0, y: 0})

    expect(model.hitTestTarget(20, 20)?.id).toBe('target')

    model.unregisterDropZoneRoot(document)

    expect(model.hitTestTarget(20, 20)).toBeNull()
  })

  it('cancels the previous payload when a new drag begins', () => {
    const {model, onCancel} = createModel()
    const nextPayload: TestPayload = {domain: 'files', kind: 'item', id: 'next'}

    model.begin(payload, {x: 0, y: 0})
    model.move({x: 20, y: 0})

    model.begin(nextPayload, {x: 5, y: 5})

    expect(onCancel).toHaveBeenCalledWith(payload)
    expect(model.active()).toBe(false)
    expect(model.payload()).toBe(nextPayload)
    expect(model.point()).toEqual({x: 5, y: 5})
    expect(document.body.style.userSelect).toBe('')
  })

  it('reports failed drops through onAfterDrop and still cleans up', async () => {
    const {model, drop, onAfterDrop, onCancel} = createModel({
      drop: vi.fn(async () => false),
    })
    createTarget('target')
    model.registerDropZoneRoot(document)

    model.begin(payload, {x: 0, y: 0})
    model.move({x: 20, y: 20})

    await expect(model.commit({x: 20, y: 20})).resolves.toBe(false)

    expect(drop).toHaveBeenCalledWith('target', payload)
    expect(onAfterDrop).toHaveBeenCalledWith('target', payload, false)
    expect(onCancel).not.toHaveBeenCalled()
    expect(model.active()).toBe(false)
    expect(model.payload()).toBeNull()
    expect(document.body.style.userSelect).toBe('')
  })

  it('waits for delayed drop completion before reporting after-drop state', async () => {
    const delayed = createDeferred<boolean>()
    const {model, drop, onAfterDrop} = createModel({
      drop: vi.fn(() => delayed.promise),
    })
    createTarget('target')
    model.registerDropZoneRoot(document)

    model.begin(payload, {x: 0, y: 0})
    model.move({x: 20, y: 20})
    const commit = model.commit({x: 20, y: 20})

    expect(model.active()).toBe(false)
    expect(model.payload()).toBeNull()
    expect(drop).toHaveBeenCalledWith('target', payload)
    expect(onAfterDrop).not.toHaveBeenCalled()

    delayed.resolve(true)
    await expect(commit).resolves.toBe(true)
    expect(onAfterDrop).toHaveBeenCalledWith('target', payload, true)
  })
})
