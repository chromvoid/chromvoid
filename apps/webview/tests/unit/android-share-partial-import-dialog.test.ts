import {afterEach, describe, expect, it, vi} from 'vitest'

import {dialogService} from '../../src/shared/services/dialog-service'
import {showAndroidSharePartialImportDialog} from '../../src/features/file-manager/services/android-share-partial-import-dialog'
import type {AndroidSharePartialImportDecision} from '../../src/features/file-manager/models/android-share-import.model'

function decision(): AndroidSharePartialImportDecision {
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
    failedCode: 'ANDROID_SHARE_PERMISSION_DENIED',
  }
}

describe('Android share partial import dialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns keep from the primary decision action', async () => {
    const showCustomDialog = vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (options, attach) => {
      let result: 'keep' | 'delete' | null = null
      const dialog = document.createElement('div')
      dialog.innerHTML = `
        <button data-android-share-partial-action="delete"></button>
        <button data-android-share-partial-action="keep"></button>
      `
      attach(dialog, (value) => {
        result = value
      })
      dialog
        .querySelector('[data-android-share-partial-action="keep"]')
        ?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
      expect(options).toMatchObject({
        title: 'Shared Files Partially Imported',
        variant: 'warning',
        closable: false,
        dialogClass: 'android-share-partial-import-dialog',
      })
      return result
    })

    await expect(showAndroidSharePartialImportDialog(decision())).resolves.toBe('keep')
    expect(showCustomDialog).toHaveBeenCalledTimes(1)
  })

  it('returns delete from the destructive decision action', async () => {
    vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(async (_options, attach) => {
      let result: 'keep' | 'delete' | null = null
      const dialog = document.createElement('div')
      dialog.innerHTML = `<button data-android-share-partial-action="delete"></button>`
      attach(dialog, (value) => {
        result = value
      })
      dialog
        .querySelector('[data-android-share-partial-action="delete"]')
        ?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
      return result
    })

    await expect(showAndroidSharePartialImportDialog(decision())).resolves.toBe('delete')
  })
})
