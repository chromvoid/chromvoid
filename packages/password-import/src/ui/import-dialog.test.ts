// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'
import {CredentialImportService, type ImportReview} from '../credential-import-service.js'
import {ImportDialog} from './import-dialog.js'
import {ImportDialogModel} from './import-dialog.model.js'
import {setCredentialImportService} from './import-dialog-state.js'

const preview: ImportReview = {
  revision: 'review',
  mode: 'merge',
  entry_count: 3,
  created_entry_count: 2,
  updated_entry_count: 1,
  folder_count: 1,
  ssh_key_count: 0,
  warnings: [{code: 'attachments_omitted', count: 2}],
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return {promise, resolve}
}
function harness() {
  const service = new CredentialImportService(async () => {
    throw new Error('Unexpected RPC')
  })
  const review = vi.spyOn(service, 'review').mockResolvedValue(preview)
  const commit = vi.spyOn(service, 'commit').mockResolvedValue(undefined)
  const cancel = vi.spyOn(service, 'cancel').mockResolvedValue(undefined)
  setCredentialImportService(service)
  return {model: new ImportDialogModel(), service, review, commit, cancel}
}

afterEach(() => {
  document.body.replaceChildren()
  setCredentialImportService(null)
  vi.restoreAllMocks()
})

describe('ImportDialogModel', () => {
  it.each(['json', 'csv', '1pux'])(
    'reviews %s through Core and confirms the authoritative counts once',
    async (extension) => {
      const h = harness()
      await h.model.selectFile(new File(['synthetic'], `export.${extension}`))
      expect(h.model.step()).toBe('preview')
      expect(h.model.review()).toEqual(preview)
      expect(h.model.selectedFile()).toBeNull()
      expect(h.commit).not.toHaveBeenCalled()
      const saving = deferred<void>()
      h.commit.mockReturnValue(saving.promise)
      const first = h.model.startImport()
      const second = h.model.startImport()
      expect(h.commit).toHaveBeenCalledTimes(1)
      saving.resolve(undefined)
      const completed = await first
      await second.catch(() => undefined)
      expect(completed).toEqual({
        success: true,
        progress: {total: 3, imported: 2, updated: 1, skipped: 0, errors: 0},
      })
      expect(h.model.step()).toBe('complete')
      expect(h.model.review()).toBeNull()
    },
  )

  it('accepts an empty KeePass password and allows retry after an incorrect password', async () => {
    const h = harness()
    const file = new File(['encrypted'], 'export.kdbx')
    await h.model.selectFile(file)
    expect(h.model.step()).toBe('password')
    expect(h.review).not.toHaveBeenCalled()
    h.review.mockRejectedValueOnce(new Error('Incorrect database password'))
    await h.model.decrypt('wrong')
    expect(h.model.step()).toBe('password')
    expect(h.model.parseError()).toBe('Incorrect database password')
    await h.model.decrypt('')
    expect(h.review.mock.calls[1]?.slice(0, 2)).toEqual([file, ''])
    expect(h.model.step()).toBe('preview')
    expect(h.model.parseError()).toBeNull()
  })

  it('discards late previews after reset and keeps model instances isolated', async () => {
    const h = harness(),
      reply = deferred<ImportReview>()
    h.review.mockReturnValue(reply.promise)
    const pending = h.model.selectFile(new File(['synthetic'], 'export.json'))
    const settled = pending.catch(() => undefined)
    const reviewSignal = h.review.mock.calls[0]?.[2]
    h.model.reset()
    reply.resolve(preview)
    await settled
    expect(reviewSignal?.aborted).toBe(true)
    expect(h.cancel).toHaveBeenCalled()
    expect(h.model.step()).toBe('file-select')
    expect(h.model.review()).toBeNull()
    expect(new ImportDialogModel().review()).toBeNull()
  })

  it('requires a new review after commit failure and does not claim partial success', async () => {
    const h = harness()
    await h.model.selectFile(new File(['synthetic'], 'export.json'))
    h.commit.mockRejectedValueOnce(new Error('Credentials changed; review again'))
    const result = await h.model.startImport()
    expect(result?.success).toBe(false)
    expect(h.model.importErrors()).toEqual(['Credentials changed; review again'])
    expect(h.model.progressState().imported).toBe(0)
    expect(await h.model.startImport()).toBeNull()
    expect(h.commit).toHaveBeenCalledTimes(1)
  })

  it('explains unsupported old hosts without loading a local parser', async () => {
    const h = harness()
    h.review.mockRejectedValueOnce(Object.assign(new Error('Unknown command'), {code: 'UNKNOWN_COMMAND'}))
    await h.model.selectFile(new File(['synthetic'], 'export.json'))
    expect(h.model.parseError()).toBe('Update ChromVoid on the connected host to import this file.')
    expect(h.model.review()).toBeNull()
    expect(h.commit).not.toHaveBeenCalled()
  })
})

describe('ImportDialog', () => {
  it('registers idempotently and resets the active import when detached', async () => {
    const h = harness()
    ImportDialog.define()
    expect(() => ImportDialog.define()).not.toThrow()
    const dialog = document.createElement('pm-import-dialog')
    document.body.append(dialog)
    // Exercise the public file-picker event rather than setting private model state.
    const element = dialog as ImportDialog
    await element.updateComplete
    const input = element.shadowRoot?.querySelector<HTMLInputElement>('input[type=file]')
    expect(input).not.toBeNull()
    Object.defineProperty(input, 'files', {value: [new File(['synthetic'], 'export.json')]})
    input?.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(h.review).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(element.shadowRoot?.textContent).toContain('Attachments omitted: 2'))
    dialog.remove()
    expect(h.cancel).toHaveBeenCalled()
  })
})
