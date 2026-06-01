import {beforeEach, describe, expect, it, vi} from 'vitest'

import type {AppContext} from '../../src/shared/services/app-context'
import type {FileItemData, SearchFilters} from '../../src/shared/contracts/file-manager'
import type {FileDownloadFlow} from '../../src/features/file-manager/download-flow.model'
import type {FileMediaInspectionFlow} from '../../src/features/file-manager/media-inspection-flow.model'
import type {FileListModel} from '../../src/features/file-manager/models/file-list.model'
import type {FileListViewportModel} from '../../src/features/file-manager/models/file-list-viewport.model'
import {FileActionsModel} from '../../src/features/file-manager/models/file-actions.model'
import {DEFAULT_SESSION_SETTINGS} from '../../src/core/session/session-settings'

const mocks = vi.hoisted(() => ({
  loadSessionSettings: vi.fn(),
  showCreateFolderDialog: vi.fn(),
  showCreateMarkdownNoteDialog: vi.fn(),
  showDeleteConfirmDialog: vi.fn(),
}))

vi.mock('root/core/session/session-settings', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/session/session-settings')>(
    '../../src/core/session/session-settings',
  )

  return {
    ...actual,
    loadSessionSettings: mocks.loadSessionSettings,
  }
})

vi.mock('root/shared/services/dialog', () => ({
  dialogService: {
    showCreateFolderDialog: mocks.showCreateFolderDialog,
    showCreateMarkdownNoteDialog: mocks.showCreateMarkdownNoteDialog,
    showDeleteConfirmDialog: mocks.showDeleteConfirmDialog,
  },
}))

const item: FileItemData = {
  id: 42,
  path: '/note.md',
  name: 'note.md',
  isDir: false,
}

const searchFilters: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

function createModel() {
  const deleteNode = vi.fn().mockResolvedValue(undefined)
  const createDir = vi.fn().mockResolvedValue(undefined)
  const upload = vi.fn().mockResolvedValue({nodeId: 77})
  const refresh = vi.fn().mockResolvedValue(undefined)
  const setSelectedItems = vi.fn()
  const pushNotification = vi.fn()
  const isLoading = {set: vi.fn()}
  const prepareDocumentReturn = vi.fn()
  const markPending = vi.fn()
  const clearPending = vi.fn()

  const ctx = {
    catalog: {
      api: {
        createDir,
        delete: deleteNode,
        upload,
      },
      refresh,
    },
    store: {
      currentPath: () => '/',
      searchFilters: () => searchFilters,
      selectedNodeIds: () => [item.id],
      setSelectedItems,
      pushNotification,
    },
  } as unknown as AppContext

  const model = new FileActionsModel(ctx, {
    isLoading,
    fileList: {
      fileItems: () => [item],
    } as unknown as FileListModel,
    viewport: {
      prepareDocumentReturn,
    } as unknown as FileListViewportModel,
    mediaInspection: {} as FileMediaInspectionFlow,
    download: {} as FileDownloadFlow,
    deletionMotion: {
      markPending,
      clearPending,
    },
  })

  return {
    clearPending,
    createDir,
    deleteNode,
    isLoading,
    markPending,
    model,
    prepareDocumentReturn,
    pushNotification,
    refresh,
    upload,
  }
}

describe('FileActionsModel delete confirmation setting', () => {
  beforeEach(() => {
    mocks.loadSessionSettings.mockReset()
    mocks.showCreateFolderDialog.mockReset()
    mocks.showCreateMarkdownNoteDialog.mockReset()
    mocks.showDeleteConfirmDialog.mockReset()
  })

  it('deletes without opening confirmation when the setting is disabled', async () => {
    mocks.loadSessionSettings.mockResolvedValue({
      ...DEFAULT_SESSION_SETTINGS,
      confirm_file_deletion: false,
    })
    const {deleteNode, model} = createModel()

    await model.handleDelete(item)

    expect(mocks.showDeleteConfirmDialog).not.toHaveBeenCalled()
    expect(deleteNode).toHaveBeenCalledWith(item.id)
  })

  it('keeps confirmation as a blocking step when the setting is enabled', async () => {
    mocks.loadSessionSettings.mockResolvedValue(DEFAULT_SESSION_SETTINGS)
    mocks.showDeleteConfirmDialog.mockResolvedValue(false)
    const {deleteNode, model} = createModel()

    await model.handleDelete(item)

    expect(mocks.showDeleteConfirmDialog).toHaveBeenCalledWith([item.name], false)
    expect(deleteNode).not.toHaveBeenCalled()
  })

  it('creates folders through the catalog API and refreshes before notifying', async () => {
    mocks.showCreateFolderDialog.mockResolvedValue('Docs')
    const {createDir, model, pushNotification, refresh} = createModel()

    await model.handleCreateDir()

    expect(createDir).toHaveBeenCalledWith('Docs', undefined)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(pushNotification).toHaveBeenCalledWith('success', 'Folder "Docs" created')
  })

  it('creates markdown notes, refreshes, and prepares the document viewport', async () => {
    mocks.showCreateMarkdownNoteDialog.mockResolvedValue('Draft')
    const {model, prepareDocumentReturn, refresh, upload} = createModel()

    await model.handleCreateMarkdownNote()

    expect(upload).toHaveBeenCalledWith(
      {parentPath: undefined, name: 'Draft.md'},
      0,
      expect.any(Object),
      {name: 'Draft.md', type: 'text/markdown'},
    )
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(prepareDocumentReturn).toHaveBeenCalledWith(77, '/', 'list')
  })
})
