import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  MarkdownDocumentRenameModel,
  type MarkdownDocumentRenameModelDeps,
  type MarkdownDocumentRenameTarget,
} from '../../src/features/file-manager/models/markdown-document-rename.model'
import type {
  MarkdownPreviewReadyState,
  MarkdownPreviewState,
} from '../../src/features/file-manager/models/markdown-preview.model'

const TARGET: MarkdownDocumentRenameTarget = {
  fileId: 7,
  fileName: 'notes.md',
}

function readyState(overrides: Partial<MarkdownPreviewReadyState> = {}): MarkdownPreviewReadyState {
  const source = overrides.source ?? '# Notes'
  const baseline = overrides.baseline ?? source
  return {
    kind: 'ready',
    fileId: 7,
    fileName: 'notes.md',
    size: 7,
    mimeType: 'text/markdown',
    lastModified: 123,
    source,
    baseline,
    sourceRevision: 11,
    baselineSourceRevision: 11,
    mode: 'preview',
    dirty: source !== baseline,
    saving: false,
    formatting: false,
    stale: false,
    renderedHtml: '<h1>Notes</h1>',
    errorKey: null,
    readOnlyReasonKey: null,
    lastSavedAt: null,
    autosavePending: false,
    lastAutosaveAttemptAt: null,
    ...overrides,
  }
}

function createHarness(options: {dirty?: boolean; saveResult?: boolean; renameResult?: string | null} = {}) {
  const state = atom<MarkdownPreviewState>(
    readyState(
      options.dirty
        ? {
            source: '# Changed',
            baseline: '# Notes',
            dirty: true,
          }
        : {},
    ),
  )
  const save = vi.fn(async () => {
    if (options.saveResult === false) {
      return false
    }

    const current = state()
    if (current.kind === 'ready') {
      state.set({...current, baseline: current.source, dirty: false})
    }
    return true
  })
  const applyFileRename = vi.fn((fileId: number, fileName: string) => {
    const current = state()
    if (current.kind === 'ready' && current.fileId === fileId) {
      state.set({...current, fileName})
    }
  })
  const renameFileById = vi.fn(async () => options.renameResult ?? 'renamed.md')
  const showRenameFileDialog = vi.fn(async () => options.renameResult ?? 'renamed.md')
  const previewModel: NonNullable<MarkdownDocumentRenameModelDeps['previewModel']> = {
    state,
    dirty: () => {
      const current = state()
      return current.kind === 'ready' && current.dirty
    },
    saving: () => {
      const current = state()
      return current.kind === 'ready' && current.saving
    },
    formatting: () => {
      const current = state()
      return current.kind === 'ready' && current.formatting
    },
    save,
    applyFileRename,
  }
  const fileManagerModel: ReturnType<NonNullable<MarkdownDocumentRenameModelDeps['getFileManagerModel']>> = {
    renameFileById,
  }
  const model = new MarkdownDocumentRenameModel({
    previewModel,
    getFileManagerModel: () => fileManagerModel,
    showRenameFileDialog,
    getCurrentPath: () => '/Docs/',
  })

  return {model, state, save, applyFileRename, renameFileById, showRenameFileDialog}
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MarkdownDocumentRenameModel', () => {
  it('renames a clean note from inline editing and updates the preview filename', async () => {
    const {model, state, save, applyFileRename, renameFileById} = createHarness()

    expect(model.startInlineRename(TARGET.fileName)).toBe(true)
    model.updateDraftName('renamed.md')
    await expect(model.commitInlineRename(TARGET)).resolves.toBe(true)

    expect(save).not.toHaveBeenCalled()
    expect(renameFileById).toHaveBeenCalledWith({
      fileId: 7,
      fileName: 'notes.md',
      newName: 'renamed.md',
      currentPath: '/Docs/',
    })
    expect(applyFileRename).toHaveBeenCalledWith(7, 'renamed.md')
    expect((state() as MarkdownPreviewReadyState).fileName).toBe('renamed.md')
    expect(model.state.editing()).toBe(false)
  })

  it('saves a dirty note before catalog rename', async () => {
    const {model, save, renameFileById, showRenameFileDialog} = createHarness({dirty: true})

    await expect(model.openRenameDialog(TARGET)).resolves.toBe(true)

    expect(showRenameFileDialog).toHaveBeenCalledWith('notes.md', '/Docs/')
    expect(save).toHaveBeenCalledTimes(1)
    expect(renameFileById).toHaveBeenCalledTimes(1)
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(renameFileById.mock.invocationCallOrder[0])
  })

  it('aborts rename when saving dirty content fails', async () => {
    const {model, save, applyFileRename, renameFileById} = createHarness({
      dirty: true,
      saveResult: false,
    })

    expect(model.startInlineRename(TARGET.fileName)).toBe(true)
    model.updateDraftName('renamed.md')
    await expect(model.commitInlineRename(TARGET)).resolves.toBe(false)

    expect(save).toHaveBeenCalledTimes(1)
    expect(renameFileById).not.toHaveBeenCalled()
    expect(applyFileRename).not.toHaveBeenCalled()
    expect(model.state.editing()).toBe(true)
    expect(model.state.renaming()).toBe(false)
  })

  it('keeps invalid inline names local and does not call catalog rename', async () => {
    const {model, renameFileById} = createHarness()

    expect(model.startInlineRename(TARGET.fileName)).toBe(true)
    model.updateDraftName('bad/name.md')
    await expect(model.commitInlineRename(TARGET)).resolves.toBe(false)

    expect(renameFileById).not.toHaveBeenCalled()
    expect(model.state.validationError()).toBeTruthy()
    expect(model.state.editing()).toBe(true)
  })

  it('keeps empty inline names local and does not call catalog rename', async () => {
    const {model, renameFileById} = createHarness()

    expect(model.startInlineRename(TARGET.fileName)).toBe(true)
    model.updateDraftName('   ')
    await expect(model.commitInlineRename(TARGET)).resolves.toBe(false)

    expect(renameFileById).not.toHaveBeenCalled()
    expect(model.state.validationError()).toBeTruthy()
    expect(model.state.editing()).toBe(true)
  })

  it('closes unchanged inline rename without calling catalog rename', async () => {
    const {model, renameFileById} = createHarness()

    expect(model.startInlineRename(TARGET.fileName)).toBe(true)
    await expect(model.commitInlineRename(TARGET)).resolves.toBe(true)

    expect(renameFileById).not.toHaveBeenCalled()
    expect(model.state.editing()).toBe(false)
  })
})
