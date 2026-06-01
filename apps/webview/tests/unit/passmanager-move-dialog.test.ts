import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMEntryMoveSheet} from '../../src/features/passmanager/components/card/pm-entry-move'
import {pmComponentLoaderModel} from '../../src/features/passmanager/models/pm-component-loader.model'
import {openPassmanagerMoveDialog} from '../../src/features/passmanager/service/passmanager-move-dialog'
import {dialogService} from '../../src/shared/services/dialog-service'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return {promise, resolve}
}

describe('openPassmanagerMoveDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('confirms entry move with the latest picker selection', async () => {
    vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockResolvedValue(undefined)
    const onConfirm = vi.fn(async (targetId: string) => targetId === 'target-group')

    vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (_options, attach) => {
      const dialog = document.createElement('div')
      const picker = document.createElement('pm-entry-move') as HTMLElement & {selectedId?: string}
      picker.selectedId = 'source-group'
      const confirmBtn = document.createElement('button')
      confirmBtn.id = 'move-confirm-btn'
      const cancelBtn = document.createElement('button')
      cancelBtn.id = 'move-cancel-btn'
      dialog.append(picker, confirmBtn, cancelBtn)

      return new Promise<string | null>((resolve) => {
        attach(dialog, resolve)
        picker.selectedId = 'target-group'
        picker.dispatchEvent(
          new CustomEvent('move-selected', {
            detail: {id: 'target-group'},
            bubbles: true,
            composed: true,
          }),
        )
        confirmBtn.click()
      })
    })

    await expect(
      openPassmanagerMoveDialog({
        entryId: 'entry-1',
        onConfirm,
        selectedId: 'source-group',
        useMobilePicker: false,
      }),
    ).resolves.toBe('target-group')

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith('target-group')
  })

  it('returns null when the move dialog is cancelled for a group move', async () => {
    vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockResolvedValue(undefined)
    const onConfirm = vi.fn(() => true)

    vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (_options, attach) => {
      const dialog = document.createElement('div')
      const picker = document.createElement('pm-entry-move') as HTMLElement & {selectedId?: string}
      picker.selectedId = 'group-source'
      const confirmBtn = document.createElement('button')
      confirmBtn.id = 'move-confirm-btn'
      const cancelBtn = document.createElement('button')
      cancelBtn.id = 'move-cancel-btn'
      dialog.append(picker, confirmBtn, cancelBtn)

      return new Promise<string | null>((resolve) => {
        attach(dialog, resolve)
        cancelBtn.click()
      })
    })

    await expect(
      openPassmanagerMoveDialog({
        onConfirm,
        selectedId: 'group-source',
        useMobilePicker: false,
      }),
    ).resolves.toBeNull()

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('ignores duplicate desktop confirms while confirmation is pending', async () => {
    vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockResolvedValue(undefined)
    const deferred = createDeferred<boolean>()
    const onConfirm = vi.fn(() => deferred.promise)

    vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (_options, attach) => {
      const dialog = document.createElement('div')
      const picker = document.createElement('pm-entry-move') as HTMLElement & {selectedId?: string}
      picker.selectedId = 'target-group'
      const confirmBtn = document.createElement('button')
      confirmBtn.id = 'move-confirm-btn'
      const cancelBtn = document.createElement('button')
      cancelBtn.id = 'move-cancel-btn'
      dialog.append(picker, confirmBtn, cancelBtn)

      return new Promise<string | null>((resolve) => {
        attach(dialog, resolve)
        confirmBtn.click()
        confirmBtn.click()
        deferred.resolve(true)
      })
    })

    await expect(
      openPassmanagerMoveDialog({
        onConfirm,
        selectedId: 'target-group',
        useMobilePicker: false,
      }),
    ).resolves.toBe('target-group')

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('confirms bulk move through the dedicated mobile move sheet', async () => {
    vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockImplementation(async () => {
      PMEntryMoveSheet.define()
    })
    const onConfirm = vi.fn(async () => true)

    const promise = openPassmanagerMoveDialog({
      disabledIds: ['forbidden'],
      onConfirm,
      selectedId: 'bulk-target',
      useMobilePicker: true,
    })

    await Promise.resolve()
    const sheet = document.querySelector('pm-entry-move-sheet') as PMEntryMoveSheet | null
    expect(sheet).not.toBeNull()
    expect(sheet?.disabledIds).toEqual(['forbidden'])

    sheet?.dispatchEvent(
      new CustomEvent('pm-entry-move-sheet-confirm', {
        detail: {targetId: 'bulk-target'},
        bubbles: true,
        composed: true,
      }),
    )

    await expect(promise).resolves.toBe('bulk-target')

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith('bulk-target')
    expect(document.querySelector('pm-entry-move-sheet')).toBeNull()
  })

  it('returns null when the dedicated mobile move sheet is cancelled', async () => {
    vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockImplementation(async () => {
      PMEntryMoveSheet.define()
    })
    const onConfirm = vi.fn(() => true)

    const promise = openPassmanagerMoveDialog({
      onConfirm,
      selectedId: 'source-group',
      useMobilePicker: true,
    })

    await Promise.resolve()
    document.querySelector('pm-entry-move-sheet')?.dispatchEvent(
      new CustomEvent('pm-entry-move-sheet-cancel', {
        bubbles: true,
        composed: true,
      }),
    )

    await expect(promise).resolves.toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps the dedicated mobile move sheet open when confirmation fails', async () => {
    vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockImplementation(async () => {
      PMEntryMoveSheet.define()
    })
    const onConfirm = vi.fn(() => false)
    let settled = false

    const promise = openPassmanagerMoveDialog({
      onConfirm,
      selectedId: 'source-group',
      useMobilePicker: true,
    }).then((value) => {
      settled = true
      return value
    })

    await Promise.resolve()
    const sheet = document.querySelector('pm-entry-move-sheet') as PMEntryMoveSheet | null
    expect(sheet).not.toBeNull()

    sheet?.dispatchEvent(
      new CustomEvent('pm-entry-move-sheet-confirm', {
        detail: {targetId: 'blocked-target'},
        bubbles: true,
        composed: true,
      }),
    )

    await Promise.resolve()
    await Promise.resolve()

    expect(onConfirm).toHaveBeenCalledWith('blocked-target')
    expect(settled).toBe(false)
    expect(document.querySelector('pm-entry-move-sheet')).toBe(sheet)

    sheet?.dispatchEvent(new CustomEvent('pm-entry-move-sheet-cancel', {bubbles: true, composed: true}))
    await expect(promise).resolves.toBeNull()
  })

  it('ignores a stale mobile confirmation after the sheet is cancelled', async () => {
    vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockImplementation(async () => {
      PMEntryMoveSheet.define()
    })
    const deferred = createDeferred<boolean>()
    const onConfirm = vi.fn(() => deferred.promise)

    const promise = openPassmanagerMoveDialog({
      onConfirm,
      selectedId: 'source-group',
      useMobilePicker: true,
    })

    await Promise.resolve()
    const sheet = document.querySelector('pm-entry-move-sheet') as PMEntryMoveSheet | null
    expect(sheet).not.toBeNull()

    sheet?.dispatchEvent(
      new CustomEvent('pm-entry-move-sheet-confirm', {
        detail: {targetId: 'target-group'},
        bubbles: true,
        composed: true,
      }),
    )
    sheet?.dispatchEvent(new CustomEvent('pm-entry-move-sheet-cancel', {bubbles: true, composed: true}))

    await expect(promise).resolves.toBeNull()
    deferred.resolve(true)
    await Promise.resolve()

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(document.querySelector('pm-entry-move-sheet')).toBeNull()
  })

  it('ignores duplicate mobile confirms while confirmation is pending', async () => {
    vi.spyOn(pmComponentLoaderModel, 'ensureExtendedComponents').mockImplementation(async () => {
      PMEntryMoveSheet.define()
    })
    const deferred = createDeferred<boolean>()
    const onConfirm = vi.fn(() => deferred.promise)

    const promise = openPassmanagerMoveDialog({
      onConfirm,
      selectedId: 'target-group',
      useMobilePicker: true,
    })

    await Promise.resolve()
    const sheet = document.querySelector('pm-entry-move-sheet') as PMEntryMoveSheet | null
    expect(sheet).not.toBeNull()

    const event = () =>
      new CustomEvent('pm-entry-move-sheet-confirm', {
        detail: {targetId: 'target-group'},
        bubbles: true,
        composed: true,
      })
    sheet?.dispatchEvent(event())
    sheet?.dispatchEvent(event())
    deferred.resolve(true)

    await expect(promise).resolves.toBe('target-group')
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
