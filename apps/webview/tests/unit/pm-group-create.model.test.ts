import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMGroupCreateModel} from '../../src/features/passmanager/components/group/group-create/group-create.model'
import {groupPresetIconService} from '../../src/features/passmanager/components/group/group-create/group-icon-presets'
import {passmanagerNavigationController} from '../../src/features/passmanager/passmanager-navigation.controller'
import {pmIconStore} from '../../src/features/passmanager/models/pm-icon-store'

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
    expect(model.nameError()).toContain('already exists in Parent')
    expect(model.canSubmit()).toBe(false)
  })

  it('validates separators and duplicate paths before submit', () => {
    window.passmanager = {
      createGroup: vi.fn(),
      entriesList: () => [{name: 'Parent/Ops'}],
    } as unknown as typeof window.passmanager
    const model = new PMGroupCreateModel()
    model.targetGroupPath.set('Parent')

    model.setName('Nested/Group')
    expect(model.nameError()).toContain('slash')
    expect(model.canSubmit()).toBe(false)

    model.setName('ops')
    expect(model.nameError()).toContain('already exists in Parent')
    expect(model.canSubmit()).toBe(false)
  })

  it('uploads a selected preset and stores its icon ref on the group', async () => {
    const createGroup = vi.fn()
    window.passmanager = {
      createGroup,
      entriesList: () => [],
    } as unknown as typeof window.passmanager
    const upload = vi.spyOn(groupPresetIconService, 'upload').mockResolvedValue('sha256:preset')
    const model = new PMGroupCreateModel()
    model.setName('Ops')
    model.setPresetIcon('shield')
    model.setPresetColor('amber')

    await expect(model.submit()).resolves.toBe(true)

    expect(upload).toHaveBeenCalledWith({icon: 'shield', color: 'amber'})
    expect(createGroup).toHaveBeenCalledWith({
      name: 'Ops',
      description: '',
      iconRef: 'sha256:preset',
      entries: [],
    }, {presentation: 'defer'})
  })

  it('turns the selected preset into an SVG icon-store upload', async () => {
    document.documentElement.style.setProperty('--cv-color-accent', 'currentColor')
    document.documentElement.style.setProperty('--cv-color-accent-contrast', 'currentColor')
    const uploadIcon = vi.spyOn(pmIconStore, 'uploadIcon').mockImplementation(async (file) => {
      expect(file.name).toBe('group-folder-violet.svg')
      expect(file.type).toBe('image/svg+xml')
      expect(file.size).toBeGreaterThan(0)
      return 'sha256:generated-preset'
    })

    try {
      await expect(groupPresetIconService.upload({icon: 'folder', color: 'violet'})).resolves.toBe(
        'sha256:generated-preset',
      )
      expect(uploadIcon).toHaveBeenCalledTimes(1)
    } finally {
      document.documentElement.style.removeProperty('--cv-color-accent')
      document.documentElement.style.removeProperty('--cv-color-accent-contrast')
    }
  })
})
