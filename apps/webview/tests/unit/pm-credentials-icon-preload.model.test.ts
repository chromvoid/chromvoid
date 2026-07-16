import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {filterValue, quickFilters, selectedCredentialTagFilters} from '@project/passmanager/select'
import {pmCredentialsIconPreloadModel} from '../../src/features/passmanager/models/pm-credentials-icon-preload.model'
import {pmIconStore} from '../../src/features/passmanager/models/pm-icon-store'
import {clearPassmanagerRoot, setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {pmModel} from '../../src/features/passmanager/password-manager.model'
import {groupBy, sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls'

function createRoot(): ManagerRoot {
  return new ManagerRoot({} as never)
}

function createEntry(parent: Group | ManagerRoot, index: number, prefix = 'Entry'): Entry {
  return new Entry(parent, {
    id: `entry-${index}`,
    title: `${prefix} ${String(index).padStart(2, '0')}`,
    urls: [],
    username: '',
    iconRef: `sha256:${index.toString(16).padStart(64, '0')}`,
    createdTs: index,
    updatedTs: index,
    otps: [],
  } as never)
}

function createGroup(root: ManagerRoot, id: string, name: string, iconSeed: string): Group {
  return new Group({
    id,
    name,
    entries: [],
    iconRef: `sha256:${iconSeed.repeat(64)}`,
    createdTs: 1,
    updatedTs: 1,
  } as never)
}

afterEach(() => {
  pmCredentialsIconPreloadModel.disconnect()
  pmModel.sessionStatus.set('inactive')
  clearPassmanagerRoot()
  filterValue.set('')
  quickFilters.set([])
  selectedCredentialTagFilters.set([])
  sortField.set('name')
  sortDirection.set('asc')
  groupBy.set('none')
  vi.restoreAllMocks()
})

describe('PMCredentialsIconPreloadModel', () => {
  it('collects custom icon refs from the first 40 projected root rows', () => {
    const root = createRoot()
    const entries = Array.from({length: 45}, (_, index) => createEntry(root, index))
    root.entries.set(entries)
    setPassmanagerRoot(root)

    const refs = pmCredentialsIconPreloadModel.collectTargetIconRefs(root, root)

    expect(refs).toHaveLength(40)
    expect(refs[0]).toBe(entries[0]?.iconRef)
    expect(refs[39]).toBe(entries[39]?.iconRef)
    expect(refs).not.toContain(entries[40]?.iconRef)
  })

  it('uses the shared filtered and sorted group projection and includes the group header icon', () => {
    const root = createRoot()
    const group = createGroup(root, 'group-work', 'Work', 'a')
    const entries = [
      createEntry(group, 1, 'Alpha'),
      createEntry(group, 2, 'Needle'),
      createEntry(group, 3, 'Needle'),
    ]
    group.entries.set(entries)
    root.entries.set([group])
    setPassmanagerRoot(root)
    filterValue.set('Needle')
    sortDirection.set('desc')

    const refs = pmCredentialsIconPreloadModel.collectTargetIconRefs(root, group)

    expect(refs).toEqual([group.iconRef, entries[2]?.iconRef, entries[1]?.iconRef])
  })

  it('preloads only an entry header icon and skips non-icon passmanager views', () => {
    const root = createRoot()
    const entry = createEntry(root, 7)
    root.entries.set([entry])

    expect(pmCredentialsIconPreloadModel.collectTargetIconRefs(root, entry)).toEqual([entry.iconRef])
    expect(pmCredentialsIconPreloadModel.collectTargetIconRefs(root, 'otpView')).toEqual([])
    expect(pmCredentialsIconPreloadModel.collectTargetIconRefs(root, 'sshView')).toEqual([])
  })

  it('deduplicates concurrent preparation for the same session projection', async () => {
    const root = createRoot()
    const entry = createEntry(root, 9)
    root.entries.set([entry])
    root.showElement.set(root)
    setPassmanagerRoot(root)
    pmModel.sessionStatus.set('ready')

    let resolvePreload!: () => void
    const preload = new Promise<void>((resolve) => {
      resolvePreload = resolve
    })
    const preloadSpy = vi.spyOn(pmIconStore, 'preloadIconUrls').mockReturnValue(preload)

    const first = pmCredentialsIconPreloadModel.prepareCurrentSurface()
    const second = pmCredentialsIconPreloadModel.prepareCurrentSurface()

    expect(preloadSpy).toHaveBeenCalledTimes(1)
    resolvePreload()
    await Promise.all([first, second])
  })
})
