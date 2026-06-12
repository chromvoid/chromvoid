// @vitest-environment jsdom

import {afterEach, describe, expect, it, vi} from 'vitest'

import {ImportOrchestrator, type CatalogOperations} from '../mapper.js'
import type {ExistingEntryInfo, ImportProgress, ImportResult} from '../types.js'
import {ImportDialog} from './import-dialog.js'
import {ImportDialogModel} from './import-dialog.model.js'

const state = {
  catalogOps: null as CatalogOperations | null,
  existingEntriesMap: null as Map<string, ExistingEntryInfo> | null,
}

const onePasswordParserMock = vi.hoisted(() => vi.fn())

vi.mock('./import-dialog-state.js', () => {
  return {
    getImportCatalogOps: () => state.catalogOps,
    getExistingEntriesMap: () => state.existingEntriesMap,
    setImportCatalogOps: (ops: CatalogOperations) => {
      state.catalogOps = ops
    },
    setExistingEntriesMap: (map: Map<string, ExistingEntryInfo>) => {
      state.existingEntriesMap = map
    },
  }
})

vi.mock('../parsers/1password.js', () => {
  return {
    parse1Password1PUX: onePasswordParserMock,
  }
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

function createCatalogOps(): CatalogOperations {
  return {
    createDir: vi.fn(async () => ({nodeId: 1})),
    upload: vi.fn(async () => ({nodeId: 1})),
    setOTPSecret: vi.fn(async () => undefined),
    deleteNode: vi.fn(async () => undefined),
    putIcon: vi.fn(async () => ({iconRef: 'icon-ref'})),
    setGroupIcon: vi.fn(async () => undefined),
  }
}

function createImportResult(): ImportResult {
  return {
    entries: [{id: 'entry-1', name: 'Entry 1'} as any],
    folders: [],
    conflicts: [],
    warnings: [],
  }
}

function createJsonFile(data: unknown, name: string): File {
  const text = JSON.stringify(data)
  const file = new File([text], name, {type: 'application/json'})
  Object.defineProperty(file, 'text', {
    value: async () => text,
  })
  return file
}

function create1PuxFile(data: unknown, name = 'vault.1pux'): File {
  return {
    name,
    size: JSON.stringify(data).length,
    type: 'application/octet-stream',
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(data)).buffer,
  } as unknown as File
}

function createProgress(): ImportProgress {
  return {
    total: 1,
    imported: 1,
    updated: 0,
    skipped: 0,
    errors: 0,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  state.catalogOps = null
  state.existingEntriesMap = null
  onePasswordParserMock.mockReset()
  vi.restoreAllMocks()
})

describe('ImportDialogModel', () => {
  it('keeps instance state isolated', () => {
    const first = new ImportDialogModel()
    const second = new ImportDialogModel()

    first.step.set('preview')
    first.parseError.set('boom')
    first.progressState.set({
      total: 3,
      imported: 1,
      updated: 1,
      skipped: 0,
      errors: 1,
    })

    expect(second.step()).toBe('file-select')
    expect(second.parseError()).toBeNull()
    expect(second.progressState().total).toBe(0)
    expect(second.isImporting()).toBe(false)
  })

  it('dedupes concurrent import starts on the same instance', async () => {
    const model = new ImportDialogModel()
    state.catalogOps = createCatalogOps()
    model.parseResult.set(createImportResult())

    const executeDeferred = deferred<{
      success: boolean
      progress: ImportProgress
      errors: string[]
    }>()
    const executeSpy = vi
      .spyOn(ImportOrchestrator.prototype, 'execute')
      .mockReturnValue(executeDeferred.promise)

    const first = model.startImport()
    const second = model.startImport()

    expect(executeSpy).toHaveBeenCalledTimes(1)
    expect(await second).toBeNull()

    executeDeferred.resolve({
      success: true,
      progress: createProgress(),
      errors: [],
    })

    await expect(first).resolves.toEqual({
      success: true,
      progress: createProgress(),
    })
    expect(model.step()).toBe('complete')
    expect(model.isImporting()).toBe(false)
    expect(model.importErrors()).toEqual([])
  })

  it('parses and imports a Bitwarden JSON export through the dialog model', async () => {
    const createDir = vi.fn(async () => ({nodeId: 1}))
    const upload = vi.fn<CatalogOperations['upload']>(async () => ({nodeId: 1}))
    const setOTPSecret = vi.fn(async () => undefined)
    const deleteNode = vi.fn(async () => undefined)
    const catalogOps: CatalogOperations = {
      createDir,
      upload,
      setOTPSecret,
      deleteNode,
    }

    state.catalogOps = catalogOps

    const file = createJsonFile(
      {
        encrypted: false,
        folders: [{id: 'folder-1', name: 'Social'}],
        collections: [{id: 'collection-1', name: 'work'}],
        items: [
          {
            id: 'item-1',
            folderId: 'folder-1',
            collectionIds: ['collection-1'],
            type: 1,
            name: 'GitHub',
            login: {
              username: 'user@test.com',
              password: 'secret123',
              totp: 'JBSWY3DPEHPK3PXP',
              uris: [{uri: 'https://github.com'}],
            },
            notes: 'Imported from Bitwarden',
            fields: [{name: 'Recovery Key', value: 'abc-def'}],
          },
        ],
      },
      'bitwarden.json',
    )

    const model = new ImportDialogModel()
    await model.selectFile(file)

    expect(model.parseError()).toBeNull()
    expect(model.step()).toBe('preview')
    expect(model.parseResult()).toMatchObject({
      entries: [
        {
          id: 'item-1',
          type: 'login',
          name: 'GitHub',
          username: 'user@test.com',
          password: 'secret123',
          folder: 'Social',
          notes: 'Imported from Bitwarden',
          customFields: [{key: 'Recovery Key', value: 'abc-def'}],
          otp: {
            secret: 'JBSWY3DPEHPK3PXP',
            label: 'GitHub',
            type: 'TOTP',
          },
          tags: ['work'],
          urls: [{value: 'https://github.com', match: 'base_domain'}],
        },
      ],
      folders: [{id: 'folder-1', name: 'Social', path: 'Social'}],
    })

    const result = await model.startImport()

    expect(result).toMatchObject({
      success: true,
      progress: {
        total: 1,
        imported: 1,
        updated: 0,
        skipped: 0,
        errors: 0,
        currentItem: 'GitHub',
      },
    })
    expect(createDir).toHaveBeenCalledWith('Social', '/')
    expect(createDir).toHaveBeenCalledWith('GitHub', '/Social')
    expect(upload).toHaveBeenCalledWith('/Social/GitHub', 'meta.json', expect.any(Number), expect.anything(), expect.any(Number), 'application/json')
    const metaUploadCall = upload.mock.calls.find((call) => call[1] === 'meta.json')
    expect(metaUploadCall).toBeTruthy()
    expect(upload).toHaveBeenCalledWith('/Social/GitHub', '.password', expect.any(Number), expect.anything(), expect.any(Number), 'text/plain')
    expect(upload).toHaveBeenCalledWith('/Social/GitHub', '.fields.json', expect.any(Number), expect.anything(), expect.any(Number), 'application/json')
    expect(upload).toHaveBeenCalledWith('/Social/GitHub', '.note', expect.any(Number), expect.anything(), expect.any(Number), 'text/plain')
    expect(setOTPSecret).toHaveBeenCalledTimes(1)
    const metaPayload = new TextDecoder().decode((upload as any).mock.calls[0][3])
    expect(JSON.parse(metaPayload)).toMatchObject({tags: ['work']})
    expect(deleteNode).not.toHaveBeenCalled()
    expect(model.step()).toBe('complete')
    expect(model.importErrors()).toEqual([])
  })

  it('parses a 1Password 1PUX export and opens preview', async () => {
    const model = new ImportDialogModel()
    onePasswordParserMock.mockResolvedValueOnce({
      entries: [
        {
          id: 'item-1',
          type: 'login',
          name: 'GitHub',
          username: 'user@test.com',
          password: 'secret123',
          folder: 'Personal',
        },
      ],
      folders: [{id: 'vault-1', name: 'Personal', path: 'Personal'}],
      conflicts: [],
      warnings: [],
    })

    await model.selectFile(
      create1PuxFile({
        accounts: [
          {
            vaults: [
              {
                attrs: {uuid: 'vault-1', name: 'Personal'},
                items: [
                  {
                    uuid: 'item-1',
                    categoryUuid: '001',
                    details: {
                      loginFields: [
                        {designation: 'username', value: 'user@test.com'},
                        {designation: 'password', value: {concealed: 'secret123'}},
                      ],
                    },
                    overview: {title: 'GitHub'},
                  },
                ],
              },
            ],
          },
        ],
      }),
    )

    expect(model.parseError()).toBeNull()
    expect(model.step()).toBe('preview')
    expect(onePasswordParserMock).toHaveBeenCalledTimes(1)
    expect(model.parseResult()).toMatchObject({
      entries: [
        {
          id: 'item-1',
          type: 'login',
          name: 'GitHub',
          username: 'user@test.com',
          password: 'secret123',
          folder: 'Personal',
        },
      ],
      folders: [{id: 'vault-1', name: 'Personal', path: 'Personal'}],
    })
  })

  it('reports 1Password 1PIF exports as unsupported format', async () => {
    const model = new ImportDialogModel()

    await model.selectFile(new File(['{}'], 'vault.1pif', {type: 'application/octet-stream'}))

    expect(model.step()).toBe('file-select')
    expect(model.parseResult()).toBeNull()
    expect(model.parseError()).toBe(
      'Unsupported file format. Please select a .kdbx, .json, .csv, or .1pux file.',
    )
  })
})

describe('ImportDialog', () => {
  it('registers the custom element idempotently', () => {
    ImportDialog.define()
    expect(() => ImportDialog.define()).not.toThrow()
    expect(customElements.get('pm-import-dialog')).toBe(ImportDialog)
  })

  it('does not render import help inside the dialog', async () => {
    ImportDialog.define()
    const dialog = document.createElement('pm-import-dialog') as ImportDialog

    document.body.append(dialog)
    await dialog.updateComplete

    expect(dialog.shadowRoot?.querySelector('[data-action="import-help"]')).toBeNull()
  })
})
