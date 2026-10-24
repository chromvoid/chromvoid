import {afterEach, describe, expect, it, vi} from 'vitest'

import {dialogService} from '../../src/shared/services/dialog-service'
import {showSharePartialImportDialog} from '../../src/features/file-manager/services/share-partial-import-dialog'
import type {SharePartialImportDecision} from '../../src/features/file-manager/models/share-import.model'

function decision(): SharePartialImportDecision {
  return {
    uploadId: 'share-upload-1',
    completed: [
      {fileId: 'shared-1', nodeId: 41, name: 'first.bin'},
      {fileId: 'shared-2', nodeId: 42, name: 'second.bin'},
      {fileId: 'shared-3', nodeId: 43, name: 'third.bin'},
      {fileId: 'shared-4', nodeId: 44, name: 'fourth.bin'},
    ],
    failedCount: 2,
    failedMessage: 'permission denied',
    failedCode: 'SHARE_PERMISSION_DENIED',
  }
}

describe('Share partial import dialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns keep from the primary decision action', async () => {
    const showCustomDialog = vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (options, attach) => {
      let result: 'keep' | 'delete' | null = null
      const dialog = document.createElement('div')
      dialog.innerHTML = `
        <button data-share-partial-action="delete"></button>
        <button data-share-partial-action="keep"></button>
      `
      attach(dialog, (value) => {
        result = value
      })
      dialog
        .querySelector('[data-share-partial-action="keep"]')
        ?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
      expect(options).toMatchObject({
        title: 'Shared Files Partially Imported',
        variant: 'warning',
        closable: false,
        dialogClass: 'share-partial-import-dialog',
      })
      return result
    })

    await expect(showSharePartialImportDialog(decision())).resolves.toBe('keep')
    expect(showCustomDialog).toHaveBeenCalledTimes(1)
  })

  it('returns delete from the destructive decision action', async () => {
    vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (_options, attach) => {
      let result: 'keep' | 'delete' | null = null
      const dialog = document.createElement('div')
      dialog.innerHTML = `<button data-share-partial-action="delete"></button>`
      attach(dialog, (value) => {
        result = value
      })
      dialog
        .querySelector('[data-share-partial-action="delete"]')
        ?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
      return result
    })

    await expect(showSharePartialImportDialog(decision())).resolves.toBe('delete')
  })
})
