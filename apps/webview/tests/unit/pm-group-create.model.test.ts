import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMGroupCreateModel} from '../../src/features/passmanager/components/group/group-create/group-create.model'
import {passmanagerNavigationController} from '../../src/features/passmanager/passmanager-navigation.controller'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

describe('PMGroupCreateModel', () => {
  const previousPassmanager = window.passmanager

  afterEach(() => {
    window.passmanager = previousPassmanager
    passmanagerNavigationController.reset()
    vi.restoreAllMocks()
  })

  it('dedupes repeated submit while group creation is in flight', async () => {
    const created = deferred<void>()
    const createGroup = vi.fn(async () => {
      await created.promise
    })
    window.passmanager = {
      createGroup,
      entriesList: () => [],
    } as unknown as typeof window.passmanager
    const model = new PMGroupCreateModel()
    model.setName('Ops')

    const first = model.submit()
    const second = model.submit()

    expect(createGroup).toHaveBeenCalledTimes(1)
    await expect(second).resolves.toBe(false)

    created.resolve()
    await expect(first).resolves.toBe(true)
  })

  it('blocks duplicate group paths before calling createGroup', async () => {
    const createGroup = vi.fn()
    window.passmanager = {
      createGroup,
      entriesList: () => [{name: 'Parent/Ops'}],
    } as unknown as typeof window.passmanager
    const model = new PMGroupCreateModel()
    model.targetGroupPath.set('Parent')
    model.setName('Ops')

    await expect(model.submit()).resolves.toBe(false)

    expect(createGroup).not.toHaveBeenCalled()
    expect(model.nameError()).toContain('already')
  })
})
