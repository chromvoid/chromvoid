import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  MarkdownPreviewModel,
  type MarkdownPreviewData,
  type MarkdownPreviewModelDeps,
  type MarkdownPreviewReadyState,
} from '../../src/features/file-manager/models/markdown-preview.model'
import {FileLoadError, type FileTextLoadResult} from '../../src/features/file-manager/services/text-file-io'
import {renderMarkdownSource as renderRealMarkdownSource} from '../../src/features/file-manager/services/markdown-renderer'

const PREVIEW_DATA: MarkdownPreviewData = {
  fileId: 7,
  fileName: 'notes.md',
  size: 7,
  mimeType: 'text/markdown',
  lastModified: 123,
  sourceRevision: 11,
  mode: 'markdown',
}

const DEFAULT_LOAD_RESULT: FileTextLoadResult = {
  text: '# Notes',
  size: 7,
  mimeType: 'text/markdown',
  sourceRevision: 11,
}

const DEFAULT_SAVE_RESULT = {
  nodeId: 7,
  size: 9,
  mimeType: 'text/markdown',
  modtime: 456,
  sourceRevision: 12,
}

const DEFAULT_SESSION_SETTINGS = {
  auto_lock_timeout_secs: 300,
  lock_on_sleep: true,
  lock_on_mobile_background: false,
  require_biometric_app_gate: true,
  auto_mount_after_unlock: false,
  auto_start_ssh_agent_after_unlock: false,
  keep_screen_awake_when_unlocked: false,
  android_vault_status_notification_enabled: true,
  android_quick_lock_tile_enabled: true,
  confirm_file_deletion: true,
  show_hidden_files: false,
  markdown_attachment_folder_path: '/attachments',
}

let createdModels: MarkdownPreviewModel[] = []

function createModel(options?: {
  loadResult?: FileTextLoadResult
  renderDebounceMs?: number
  autosaveDebounceMs?: number
  historyGroupMs?: number
  maxHistoryLength?: number
  now?: () => number
  renderMarkdownSource?: MarkdownPreviewModelDeps['renderMarkdownSource']
  imageAssetService?: MarkdownPreviewModelDeps['imageAssetService']
  loadSessionSettings?: MarkdownPreviewModelDeps['loadSessionSettings']
}) {
  const loadTextFileById = vi.fn(async () => options?.loadResult ?? DEFAULT_LOAD_RESULT)
  const saveTextFileById = vi.fn(async () => DEFAULT_SAVE_RESULT)
  const renderMarkdownSource =
    options?.renderMarkdownSource ??
    vi.fn((source: string) => ({html: `<p>${source}</p>`, imageRefs: []}))
  const formatMarkdownSource = vi.fn(async (source: string) => source)

  const model = new MarkdownPreviewModel({
    loadTextFileById: loadTextFileById as MarkdownPreviewModelDeps['loadTextFileById'],
    saveTextFileById: saveTextFileById as MarkdownPreviewModelDeps['saveTextFileById'],
    renderMarkdownSource: renderMarkdownSource as MarkdownPreviewModelDeps['renderMarkdownSource'],
    formatMarkdownSource: formatMarkdownSource as MarkdownPreviewModelDeps['formatMarkdownSource'],
    imageAssetService: options?.imageAssetService,
    loadSessionSettings: options?.loadSessionSettings,
    renderDebounceMs: options?.renderDebounceMs ?? 20,
    autosaveDebounceMs: options?.autosaveDebounceMs,
    historyGroupMs: options?.historyGroupMs,
    maxHistoryLength: options?.maxHistoryLength,
    now: options?.now,
  })
  createdModels.push(model)

  return {model, loadTextFileById, saveTextFileById, renderMarkdownSource, formatMarkdownSource}
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return {promise, resolve, reject}
}

async function flushAsync() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function expectReady(model: MarkdownPreviewModel): MarkdownPreviewReadyState {
  const state = model.state()
  expect(state.kind).toBe('ready')
  return state as MarkdownPreviewReadyState
}

async function loadReady(model: MarkdownPreviewModel): Promise<MarkdownPreviewReadyState> {
  model.setPreview(PREVIEW_DATA)
  await flushAsync()
  return expectReady(model)
}

describe('MarkdownPreviewModel', () => {
  afterEach(() => {
    for (const model of createdModels) {
      model.cleanup()
    }
    createdModels = []
    document.body.innerHTML = ''
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('loads Markdown source, baseline metadata, and sanitized render output', async () => {
    const {model, loadTextFileById, renderMarkdownSource} = createModel()

    const state = await loadReady(model)

    expect(loadTextFileById).toHaveBeenCalledWith(
      PREVIEW_DATA.fileId,
      PREVIEW_DATA.fileName,
      expect.objectContaining({
        maxBytes: 1_048_576,
        allowMetadataFallback: true,
      }),
    )
    expect(renderMarkdownSource).toHaveBeenCalledWith('# Notes')
    expect(state).toMatchObject({
      fileId: 7,
      fileName: 'notes.md',
      source: '# Notes',
      baseline: '# Notes',
      sourceRevision: 11,
      baselineSourceRevision: 11,
      dirty: false,
      saving: false,
      formatting: false,
      stale: false,
      renderedHtml: '<p># Notes</p>',
      errorKey: null,
      readOnlyReasonKey: null,
    })
    expect(model.dirty()).toBe(false)
    expect(model.canSave()).toBe(false)
  })

  it('resolves catalog Markdown image refs into model-generated image sources', async () => {
    const release = vi.fn()
    const resolveImageRef = vi.fn(async (ref) => ({
      key: ref.key,
      rawRef: ref.rawRef,
      altText: ref.altText,
      status: 'loaded' as const,
      url: 'blob:markdown-image',
      release,
    }))
    const releaseResolution = vi.fn((resolution) => resolution.release?.())
    const {model} = createModel({
      loadResult: {
        text: '![Screenshot](/attachments/pic.png)',
        size: 36,
        mimeType: 'text/markdown',
        sourceRevision: 11,
      },
      renderMarkdownSource: renderRealMarkdownSource,
      imageAssetService: {
        resolveImageRef,
        releaseResolution,
        uploadImageFiles: vi.fn(),
      },
    })

    await loadReady(model)
    await flushAsync()

    const state = expectReady(model)
    expect(resolveImageRef).toHaveBeenCalledWith(
      expect.objectContaining({rawRef: '/attachments/pic.png', kind: 'catalog-absolute'}),
      expect.objectContaining({signal: expect.any(AbortSignal)}),
    )
    expect(state.imageAssets['image-0']).toMatchObject({
      status: 'loaded',
      url: 'blob:markdown-image',
    })
    expect(state.renderedHtml).toContain('<img')
    expect(state.renderedHtml).toContain('src="blob:markdown-image"')

    model.cleanup()

    expect(releaseResolution).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases late image resolution results after cleanup', async () => {
    const imageResolution = deferred<{
      key: string
      rawRef: string
      altText: string
      status: 'loaded'
      url: string
      release: () => void
    }>()
    const release = vi.fn()
    const releaseResolution = vi.fn((resolution) => resolution.release?.())
    const resolveImageRef = vi.fn(() => imageResolution.promise)
    const {model} = createModel({
      loadResult: {
        text: '![Screenshot](/attachments/pic.png)',
        size: 36,
        mimeType: 'text/markdown',
        sourceRevision: 11,
      },
      renderMarkdownSource: renderRealMarkdownSource,
      imageAssetService: {
        resolveImageRef,
        releaseResolution,
        uploadImageFiles: vi.fn(),
      },
    })

    await loadReady(model)
    model.cleanup()

    imageResolution.resolve({
      key: 'image-0',
      rawRef: '/attachments/pic.png',
      altText: 'Screenshot',
      status: 'loaded',
      url: 'blob:late-markdown-image',
      release,
    })
    await flushAsync()

    expect(model.state()).toEqual({kind: 'idle'})
    expect(releaseResolution).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('keeps external Markdown image refs blocked without loadable sources', async () => {
    const resolveImageRef = vi.fn(async (ref) => ({
      key: ref.key,
      rawRef: ref.rawRef,
      altText: ref.altText,
      status: 'blocked-external' as const,
      url: null,
    }))
    const {model} = createModel({
      loadResult: {
        text: '![Remote](https://example.com/a.png)',
        size: 36,
        mimeType: 'text/markdown',
        sourceRevision: 11,
      },
      renderMarkdownSource: renderRealMarkdownSource,
      imageAssetService: {
        resolveImageRef,
        releaseResolution: vi.fn(),
        uploadImageFiles: vi.fn(),
      },
    })

    await loadReady(model)
    await flushAsync()

    const state = expectReady(model)
    expect(state.imageAssets['image-0']).toMatchObject({
      status: 'blocked-external',
      url: null,
    })
    expect(state.renderedHtml).not.toContain('<img')
    expect(state.renderedHtml).not.toContain('src=')
  })

  it('ignores late load results after switching preview data', async () => {
    const firstLoad = deferred<FileTextLoadResult>()
    const secondLoad = deferred<FileTextLoadResult>()
    const loadTextFileById = vi
      .fn()
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise)
    const saveTextFileById = vi.fn(async () => DEFAULT_SAVE_RESULT)
    const renderMarkdownSource = vi.fn((source: string) => ({html: `<p>${source}</p>`, imageRefs: []}))
    const model = new MarkdownPreviewModel({
      loadTextFileById: loadTextFileById as MarkdownPreviewModelDeps['loadTextFileById'],
      saveTextFileById: saveTextFileById as MarkdownPreviewModelDeps['saveTextFileById'],
      renderMarkdownSource: renderMarkdownSource as MarkdownPreviewModelDeps['renderMarkdownSource'],
    })
    createdModels.push(model)

    model.setPreview({...PREVIEW_DATA, fileId: 7, fileName: 'old.md'})
    model.setPreview({...PREVIEW_DATA, fileId: 8, fileName: 'new.md', sourceRevision: 22})

    secondLoad.resolve({
      text: '# New',
      size: 5,
      mimeType: 'text/markdown',
      sourceRevision: 22,
    })
    await flushAsync()

    let state = expectReady(model)
    expect(state.fileId).toBe(8)
    expect(state.source).toBe('# New')

    firstLoad.resolve({
      text: '# Old',
      size: 5,
      mimeType: 'text/markdown',
      sourceRevision: 11,
    })
    await flushAsync()

    state = expectReady(model)
    expect(state.fileId).toBe(8)
    expect(state.source).toBe('# New')
  })

  it('switches mode, marks edits dirty, and debounces rendered preview updates', async () => {
    vi.useFakeTimers()
    const {model, renderMarkdownSource} = createModel({renderDebounceMs: 20})
    await loadReady(model)
    renderMarkdownSource.mockClear()

    model.setMode('edit', {selectionStart: 3})
    model.updateSource('# Changed')

    let state = expectReady(model)
    expect(model.mode()).toBe('edit')
    expect(model.editorFocusRequest()).toEqual({id: 1, selectionStart: 3})
    expect(state.dirty).toBe(true)
    expect(state.renderedHtml).toBe('<p># Notes</p>')
    expect(renderMarkdownSource).not.toHaveBeenCalled()

    vi.advanceTimersByTime(19)
    expect(renderMarkdownSource).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    state = expectReady(model)
    expect(renderMarkdownSource).toHaveBeenCalledWith('# Changed')
    expect(state.renderedHtml).toBe('<p># Changed</p>')
    expect(model.canSave()).toBe(true)
  })

  it('uploads image files, inserts Markdown links, and schedules normal dirty/autosave flow', async () => {
    const uploadImageFiles = vi.fn(async () => ({
      markdown: '![photo](/attachments/photo.png)',
      paths: ['/attachments/photo.png'],
    }))
    const {model} = createModel({
      imageAssetService: {
        resolveImageRef: vi.fn(),
        releaseResolution: vi.fn(),
        uploadImageFiles,
      },
      loadSessionSettings: vi.fn(async () => DEFAULT_SESSION_SETTINGS),
    })
    await loadReady(model)

    const file = new File([new Uint8Array([1])], 'photo.png', {type: 'image/png'})
    await expect(
      model.insertImageFiles([file], {
        selectionStart: '# Notes'.length,
        selectionEnd: '# Notes'.length,
      }),
    ).resolves.toBe(true)

    const state = expectReady(model)
    expect(uploadImageFiles).toHaveBeenCalledWith(
      [file],
      expect.objectContaining({attachmentFolderPath: '/attachments'}),
    )
    expect(state.source).toBe('# Notes\n![photo](/attachments/photo.png)')
    expect(state.dirty).toBe(true)
    expect(model.canUndo()).toBe(true)
    expect(model.imageAttaching()).toBe(false)
    expect(model.editorFocusRequest()?.selectionStart).toBe(state.source.length)
  })

  it('registers the image picker trigger and stores the requested insertion selection', async () => {
    const {model} = createModel()
    await loadReady(model)
    const trigger = vi.fn()
    const unregister = model.registerImagePickerTrigger(trigger)

    expect(model.canInsertImage()).toBe(true)
    expect(model.requestImagePicker({selectionStart: 2, selectionEnd: 5})).toBe(true)

    expect(trigger).toHaveBeenCalledTimes(1)
    expect(model.mode()).toBe('edit')
    expect(model.getImageInsertionSelection()).toEqual({
      selectionStart: 2,
      selectionEnd: 5,
    })

    unregister()
    expect(model.requestImagePicker({selectionStart: 0, selectionEnd: 0})).toBe(false)
  })

  it('uses the last editor selection and falls back to the end of the note for image insertion', async () => {
    const {model} = createModel()
    await loadReady(model)
    const trigger = vi.fn()
    model.registerImagePickerTrigger(trigger)

    expect(model.requestImagePicker()).toBe(true)
    expect(model.getImageInsertionSelection()).toEqual({
      selectionStart: '# Notes'.length,
      selectionEnd: '# Notes'.length,
    })

    model.updateEditorSelection({selectionStart: 1, selectionEnd: 3})
    expect(model.requestImagePicker()).toBe(true)
    expect(model.getImageInsertionSelection()).toEqual({
      selectionStart: 1,
      selectionEnd: 3,
    })
  })

  it('does not request the image picker while the note is read-only or busy', async () => {
    const {model} = createModel()
    const ready = await loadReady(model)
    const trigger = vi.fn()
    model.registerImagePickerTrigger(trigger)

    model.state.set({...ready, saving: true})
    expect(model.canInsertImage()).toBe(false)
    expect(model.requestImagePicker()).toBe(false)

    model.state.set({...ready, formatting: true})
    expect(model.canInsertImage()).toBe(false)
    expect(model.requestImagePicker()).toBe(false)

    model.state.set({...ready, readOnlyReasonKey: 'markdown:read-only:save-unavailable'})
    expect(model.canInsertImage()).toBe(false)
    expect(model.requestImagePicker()).toBe(false)

    model.state.set(ready)
    model.imageAttaching.set(true)
    expect(model.canInsertImage()).toBe(false)
    expect(model.requestImagePicker()).toBe(false)
    expect(trigger).not.toHaveBeenCalled()
  })

  it('marks image attachment busy for the upload lifecycle', async () => {
    const uploadResult = deferred<{markdown: string; paths: string[]}>()
    const uploadImageFiles = vi.fn(() => uploadResult.promise)
    const {model} = createModel({
      imageAssetService: {
        resolveImageRef: vi.fn(),
        releaseResolution: vi.fn(),
        uploadImageFiles,
      },
      loadSessionSettings: vi.fn(async () => DEFAULT_SESSION_SETTINGS),
    })
    await loadReady(model)

    const uploadPromise = model.insertImageFiles([new File([new Uint8Array([1])], 'photo.png')], {
      selectionStart: '# Notes'.length,
      selectionEnd: '# Notes'.length,
    })
    await flushAsync()

    expect(model.imageAttaching()).toBe(true)
    expect(model.canInsertImage()).toBe(false)

    uploadResult.resolve({
      markdown: '![photo](/attachments/photo.png)',
      paths: ['/attachments/photo.png'],
    })

    await expect(uploadPromise).resolves.toBe(true)
    expect(model.imageAttaching()).toBe(false)
    expect(model.canInsertImage()).toBe(true)
  })

  it('ignores cancelled attachment uploads after cleanup', async () => {
    const uploadResult = deferred<{markdown: string; paths: string[]}>()
    const uploadImageFiles = vi.fn(() => uploadResult.promise)
    const {model} = createModel({
      imageAssetService: {
        resolveImageRef: vi.fn(),
        releaseResolution: vi.fn(),
        uploadImageFiles,
      },
      loadSessionSettings: vi.fn(async () => DEFAULT_SESSION_SETTINGS),
    })
    await loadReady(model)

    const uploadPromise = model.insertImageFiles([new File([new Uint8Array([1])], 'photo.png')], {
      selectionStart: '# Notes'.length,
      selectionEnd: '# Notes'.length,
    })
    await flushAsync()

    model.cleanup()
    uploadResult.resolve({
      markdown: '![photo](/attachments/photo.png)',
      paths: ['/attachments/photo.png'],
    })

    await expect(uploadPromise).resolves.toBe(false)
    expect(model.state()).toEqual({kind: 'idle'})
  })

  it('rejects invalid attachment folder settings without uploading', async () => {
    const uploadImageFiles = vi.fn()
    const {model} = createModel({
      imageAssetService: {
        resolveImageRef: vi.fn(),
        releaseResolution: vi.fn(),
        uploadImageFiles,
      },
      loadSessionSettings: vi.fn(async () => ({
        auto_lock_timeout_secs: 300,
        lock_on_sleep: true,
        lock_on_mobile_background: false,
        require_biometric_app_gate: true,
        auto_mount_after_unlock: false,
        auto_start_ssh_agent_after_unlock: false,
        keep_screen_awake_when_unlocked: false,
        android_vault_status_notification_enabled: true,
        android_quick_lock_tile_enabled: true,
        confirm_file_deletion: true,
        markdown_attachment_folder_path: 'attachments',
      })),
    })
    await loadReady(model)

    const file = new File([new Uint8Array([1])], 'photo.png', {type: 'image/png'})
    await expect(
      model.insertImageFiles([file], {
        selectionStart: 0,
        selectionEnd: 0,
      }),
    ).resolves.toBe(false)

    expect(uploadImageFiles).not.toHaveBeenCalled()
    expect(expectReady(model).errorKey).toBe('markdown:error:attachment-folder-invalid')
  })

  it('pushes the baseline on first user edit and restores it through undo/redo', async () => {
    const {model} = createModel()
    await loadReady(model)

    model.updateSource('# Changed')

    expect(model.canUndo()).toBe(true)
    expect(model.canRedo()).toBe(false)
    expect(model.undo()).toBe(true)

    let state = expectReady(model)
    expect(state.source).toBe('# Notes')
    expect(state.dirty).toBe(false)
    expect(model.canUndo()).toBe(false)
    expect(model.canRedo()).toBe(true)

    expect(model.redo()).toBe(true)
    state = expectReady(model)
    expect(state.source).toBe('# Changed')
    expect(state.dirty).toBe(true)
  })

  it('groups continuous typing inside the history window into one undo step', async () => {
    let now = 0
    const {model} = createModel({historyGroupMs: 750, now: () => now})
    await loadReady(model)

    model.updateSource('# A')
    now = 500
    model.updateSource('# AB')

    expect(model.undo()).toBe(true)
    expect(expectReady(model).source).toBe('# Notes')
    expect(model.canUndo()).toBe(false)
  })

  it('starts another undo step after the history grouping window', async () => {
    let now = 0
    const {model} = createModel({historyGroupMs: 750, now: () => now})
    await loadReady(model)

    model.updateSource('# A')
    now = 751
    model.updateSource('# AB')

    expect(model.undo()).toBe(true)
    expect(expectReady(model).source).toBe('# A')
    expect(model.undo()).toBe(true)
    expect(expectReady(model).source).toBe('# Notes')
  })

  it('clears redo history when a new edit follows undo', async () => {
    let now = 0
    const {model} = createModel({historyGroupMs: 750, now: () => now})
    await loadReady(model)

    model.updateSource('# A')
    now = 751
    model.updateSource('# AB')
    expect(model.undo()).toBe(true)
    expect(model.canRedo()).toBe(true)

    model.updateSource('# AC')

    expect(model.canRedo()).toBe(false)
    expect(expectReady(model).source).toBe('# AC')
  })

  it('records formatting as one undo step', async () => {
    const {model, formatMarkdownSource} = createModel()
    formatMarkdownSource.mockResolvedValue('# Notes\n\n- formatted\n')
    await loadReady(model)

    await expect(model.formatDocument()).resolves.toBe(true)

    expect(model.canUndo()).toBe(true)
    expect(model.undo()).toBe(true)
    expect(expectReady(model).source).toBe('# Notes')
  })

  it('keeps undo history after a successful save', async () => {
    const {model} = createModel()
    await loadReady(model)
    model.updateSource('# Changed')

    await expect(model.save()).resolves.toBe(true)

    expect(model.canUndo()).toBe(true)
    expect(model.undo()).toBe(true)
    expect(expectReady(model).source).toBe('# Notes')
  })

  it('resets undo and redo across reload, discard, cleanup, and file switch', async () => {
    const {model, loadTextFileById} = createModel()
    loadTextFileById
      .mockResolvedValueOnce(DEFAULT_LOAD_RESULT)
      .mockResolvedValueOnce(DEFAULT_LOAD_RESULT)
      .mockResolvedValueOnce({
        text: '# Other',
        size: 7,
        mimeType: 'text/markdown',
        sourceRevision: 22,
      })
    await loadReady(model)
    model.updateSource('# Changed')
    expect(model.canUndo()).toBe(true)

    await model.reload()
    expect(model.canUndo()).toBe(false)
    expect(model.canRedo()).toBe(false)

    model.updateSource('# Changed again')
    expect(model.canUndo()).toBe(true)
    model.discardLocalChanges()
    expect(model.canUndo()).toBe(false)
    expect(model.canRedo()).toBe(false)

    model.updateSource('# Changed third')
    expect(model.canUndo()).toBe(true)
    model.setPreview({...PREVIEW_DATA, fileId: 8, fileName: 'other.md', sourceRevision: 22})
    await flushAsync()
    expect(expectReady(model).source).toBe('# Other')
    expect(model.canUndo()).toBe(false)
    expect(model.canRedo()).toBe(false)

    model.updateSource('# Changed fourth')
    expect(model.canUndo()).toBe(true)
    model.cleanup()
    expect(model.canUndo()).toBe(false)
    expect(model.canRedo()).toBe(false)
  })

  it('bounds undo history to the newest snapshots', async () => {
    let now = 0
    const {model} = createModel({historyGroupMs: 10, maxHistoryLength: 3, now: () => now})
    await loadReady(model)

    for (const source of ['# A', '# B', '# C', '# D']) {
      now += 20
      model.updateSource(source)
    }

    expect(model.undo()).toBe(true)
    expect(expectReady(model).source).toBe('# C')
    expect(model.undo()).toBe(true)
    expect(expectReady(model).source).toBe('# B')
    expect(model.undo()).toBe(true)
    expect(expectReady(model).source).toBe('# A')
    expect(model.canUndo()).toBe(false)
  })

  it('creates bounded editor focus requests and resets them across previews', async () => {
    const {model} = createModel()
    await loadReady(model)

    model.setMode('edit', {selectionStart: 99})
    expect(model.editorFocusRequest()).toEqual({id: 1, selectionStart: '# Notes'.length})

    model.setMode('edit')
    expect(model.editorFocusRequest()).toEqual({id: 2, selectionStart: null})

    model.setMode('preview')
    expect(model.editorFocusRequest()).toBeNull()

    model.setMode('edit', {selectionStart: -1})
    expect(model.editorFocusRequest()).toEqual({id: 3, selectionStart: 0})

    model.setPreview({...PREVIEW_DATA, fileId: 8, fileName: 'other.md'})
    expect(model.editorFocusRequest()).toBeNull()
    await flushAsync()
    expectReady(model)
  })

  it('formats source through the formatter and refreshes rendered preview', async () => {
    const {model, formatMarkdownSource, renderMarkdownSource} = createModel()
    await loadReady(model)
    renderMarkdownSource.mockClear()
    formatMarkdownSource.mockResolvedValue('# Notes\n\n- one\n')

    await expect(model.formatDocument()).resolves.toBe(true)

    const state = expectReady(model)
    expect(formatMarkdownSource).toHaveBeenCalledWith('# Notes')
    expect(renderMarkdownSource).toHaveBeenCalledWith('# Notes\n\n- one\n')
    expect(state.source).toBe('# Notes\n\n- one\n')
    expect(state.dirty).toBe(true)
    expect(state.formatting).toBe(false)
    expect(state.renderedHtml).toBe('<p># Notes\n\n- one\n</p>')
    expect(model.canSave()).toBe(true)
  })

  it('disables save while formatting and keeps source when formatting fails', async () => {
    const formatResult = deferred<string>()
    const {model, formatMarkdownSource} = createModel()
    formatMarkdownSource.mockReturnValueOnce(formatResult.promise)
    await loadReady(model)
    model.updateSource('# Local')

    const formatPromise = model.formatDocument()
    await flushAsync()

    let state = expectReady(model)
    expect(state.formatting).toBe(true)
    expect(model.canFormat()).toBe(false)
    expect(model.canSave()).toBe(false)
    await expect(model.save()).resolves.toBe(false)

    formatResult.reject(new Error('format failed'))
    await expect(formatPromise).resolves.toBe(false)

    state = expectReady(model)
    expect(state.source).toBe('# Local')
    expect(state.dirty).toBe(true)
    expect(state.formatting).toBe(false)
    expect(state.errorKey).toBe('markdown:error:format-failed')
  })

  it('does not overwrite newer edits with an older formatting result', async () => {
    const formatResult = deferred<string>()
    const {model, formatMarkdownSource} = createModel()
    formatMarkdownSource.mockReturnValueOnce(formatResult.promise)
    await loadReady(model)

    const formatPromise = model.formatDocument()
    await flushAsync()
    model.updateSource('# Typed while formatting')
    formatResult.resolve('# Formatted old source\n')

    await expect(formatPromise).resolves.toBe(false)

    const state = expectReady(model)
    expect(state.source).toBe('# Typed while formatting')
    expect(state.dirty).toBe(true)
    expect(state.formatting).toBe(false)
  })

  it('saves with a source-revision precondition and clears dirty state after success', async () => {
    const {model, saveTextFileById} = createModel()
    await loadReady(model)
    model.updateSource('# Changed')

    await expect(model.save()).resolves.toBe(true)

    expect(saveTextFileById).toHaveBeenCalledTimes(1)
    const call = saveTextFileById.mock.calls[0]
    expect(call?.[0]).toBe(7)
    expect(call?.[1]).toBe('notes.md')
    expect(call?.[2]).toBe('# Changed')
    expect(call?.[3]).toEqual(
      expect.objectContaining({
        mimeType: 'text/markdown',
        expectedSourceRevision: 11,
        conflictMode: 'fail_if_stale',
        maxBytes: 1_048_576,
      }),
    )

    const state = expectReady(model)
    expect(state.baseline).toBe('# Changed')
    expect(state.sourceRevision).toBe(12)
    expect(state.baselineSourceRevision).toBe(12)
    expect(state.dirty).toBe(false)
    expect(state.saving).toBe(false)
    expect(state.errorKey).toBeNull()
  })

  it('autosaves edited source after the debounce with stale-safe replace options', async () => {
    vi.useFakeTimers()
    let now = 1_000
    const {model, saveTextFileById} = createModel({
      autosaveDebounceMs: 100,
      now: () => now,
    })
    await loadReady(model)

    model.updateSource('# Autosaved')

    expect(model.autosavePending()).toBe(true)
    expect(saveTextFileById).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(99)
    expect(saveTextFileById).not.toHaveBeenCalled()

    now = 1_100
    await vi.advanceTimersByTimeAsync(1)
    await flushAsync()

    expect(saveTextFileById).toHaveBeenCalledTimes(1)
    expect(saveTextFileById.mock.calls[0]?.[2]).toBe('# Autosaved')
    expect(saveTextFileById.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({
        mimeType: 'text/markdown',
        expectedSourceRevision: 11,
        conflictMode: 'fail_if_stale',
        maxBytes: 1_048_576,
      }),
    )
    expect(model.autosavePending()).toBe(false)
    expect(model.lastAutosaveAttemptAt()).toBe(1_100)
    expect(expectReady(model).dirty).toBe(false)
  })

  it('keeps edit mode when autosaved metadata is echoed through preview data', async () => {
    vi.useFakeTimers()
    const {model, loadTextFileById} = createModel({autosaveDebounceMs: 100})
    await loadReady(model)

    model.setMode('edit')
    model.updateSource('# Autosaved')
    await vi.advanceTimersByTimeAsync(100)
    await flushAsync()

    model.setPreview({
      ...PREVIEW_DATA,
      size: DEFAULT_SAVE_RESULT.size,
      mimeType: DEFAULT_SAVE_RESULT.mimeType,
      lastModified: DEFAULT_SAVE_RESULT.modtime,
      sourceRevision: DEFAULT_SAVE_RESULT.sourceRevision ?? undefined,
    })
    await flushAsync()

    const state = expectReady(model)
    expect(loadTextFileById).toHaveBeenCalledTimes(1)
    expect(state.mode).toBe('edit')
    expect(state.source).toBe('# Autosaved')
    expect(state.baseline).toBe('# Autosaved')
    expect(state.dirty).toBe(false)
  })

  it('does not abort in-flight autosave when same-file metadata arrives first', async () => {
    vi.useFakeTimers()
    const saveResult = deferred<typeof DEFAULT_SAVE_RESULT>()
    const {model, loadTextFileById, saveTextFileById} = createModel({autosaveDebounceMs: 100})
    saveTextFileById.mockReturnValueOnce(saveResult.promise)
    await loadReady(model)

    model.setMode('edit')
    model.updateSource('# Autosaved')
    await vi.advanceTimersByTimeAsync(100)
    await flushAsync()

    expect(saveTextFileById).toHaveBeenCalledTimes(1)
    expect(expectReady(model).saving).toBe(true)

    model.setPreview({
      ...PREVIEW_DATA,
      size: DEFAULT_SAVE_RESULT.size,
      mimeType: DEFAULT_SAVE_RESULT.mimeType,
      lastModified: DEFAULT_SAVE_RESULT.modtime,
      sourceRevision: DEFAULT_SAVE_RESULT.sourceRevision ?? undefined,
    })
    await flushAsync()

    let state = expectReady(model)
    expect(loadTextFileById).toHaveBeenCalledTimes(1)
    expect(state.mode).toBe('edit')
    expect(state.saving).toBe(true)
    expect(state.source).toBe('# Autosaved')

    saveResult.resolve(DEFAULT_SAVE_RESULT)
    await flushAsync()

    state = expectReady(model)
    expect(loadTextFileById).toHaveBeenCalledTimes(1)
    expect(state.mode).toBe('edit')
    expect(state.source).toBe('# Autosaved')
    expect(state.baseline).toBe('# Autosaved')
    expect(state.dirty).toBe(false)
    expect(state.saving).toBe(false)
  })

  it('updates the same open file name without reloading Markdown source', async () => {
    const {model, loadTextFileById} = createModel()
    await loadReady(model)

    model.applyFileRename(PREVIEW_DATA.fileId, 'renamed.md')
    model.setPreview({...PREVIEW_DATA, fileName: 'renamed.md'})
    await flushAsync()

    expect(loadTextFileById).toHaveBeenCalledTimes(1)
    expect(model.currentData()?.fileName).toBe('renamed.md')
    expect(expectReady(model).fileName).toBe('renamed.md')
  })

  it('manual save clears pending autosave and prevents a second save for the same source', async () => {
    vi.useFakeTimers()
    const {model, saveTextFileById} = createModel({autosaveDebounceMs: 100})
    await loadReady(model)

    model.updateSource('# Manual')
    expect(model.autosavePending()).toBe(true)

    await expect(model.save()).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(100)

    expect(saveTextFileById).toHaveBeenCalledTimes(1)
    expect(model.autosavePending()).toBe(false)
  })

  it('does not autosave when save support is unavailable', async () => {
    vi.useFakeTimers()
    const {model, saveTextFileById} = createModel({
      autosaveDebounceMs: 100,
      loadResult: {
        text: '# Offline',
        size: 9,
        mimeType: 'text/markdown',
        sourceRevision: null,
        sourceMetadataUnavailable: true,
      },
    })
    await loadReady(model)

    model.updateSource('# Local only')
    await vi.advanceTimersByTimeAsync(100)

    expect(model.autosavePending()).toBe(false)
    expect(saveTextFileById).not.toHaveBeenCalled()
  })

  it('preserves source and stale UI after autosave stale failure without retrying', async () => {
    vi.useFakeTimers()
    const {model, saveTextFileById} = createModel({autosaveDebounceMs: 100})
    saveTextFileById.mockRejectedValue(new FileLoadError('TEXT_STALE_SOURCE', 'stale'))
    await loadReady(model)

    model.updateSource('# Local')
    await vi.advanceTimersByTimeAsync(100)
    await flushAsync()

    let state = expectReady(model)
    expect(state.source).toBe('# Local')
    expect(state.dirty).toBe(true)
    expect(state.stale).toBe(true)
    expect(state.errorKey).toBe('markdown:error:stale-source')
    expect(model.autosavePending()).toBe(false)

    await vi.advanceTimersByTimeAsync(500)
    state = expectReady(model)
    expect(saveTextFileById).toHaveBeenCalledTimes(1)
    expect(state.source).toBe('# Local')
  })

  it('keeps newer source after in-flight save success and schedules trailing autosave', async () => {
    vi.useFakeTimers()
    const saveResult = deferred<typeof DEFAULT_SAVE_RESULT>()
    const {model, saveTextFileById} = createModel({autosaveDebounceMs: 100})
    saveTextFileById.mockReturnValueOnce(saveResult.promise)
    await loadReady(model)
    model.updateSource('# First')

    const savePromise = model.save()
    await flushAsync()
    model.updateSource('# Second')

    saveResult.resolve(DEFAULT_SAVE_RESULT)
    await expect(savePromise).resolves.toBe(true)
    await flushAsync()

    let state = expectReady(model)
    expect(state.source).toBe('# Second')
    expect(state.baseline).toBe('# First')
    expect(state.dirty).toBe(true)
    expect(model.autosavePending()).toBe(true)

    await vi.advanceTimersByTimeAsync(100)
    await flushAsync()

    expect(saveTextFileById).toHaveBeenCalledTimes(2)
    expect(saveTextFileById.mock.calls[1]?.[2]).toBe('# Second')
    state = expectReady(model)
    expect(state.baseline).toBe('# Second')
    expect(state.dirty).toBe(false)
  })

  it('clears pending autosave timers on discard, reload, cleanup, and file switch', async () => {
    vi.useFakeTimers()
    const {model, loadTextFileById, saveTextFileById} = createModel({autosaveDebounceMs: 100})
    loadTextFileById
      .mockResolvedValueOnce(DEFAULT_LOAD_RESULT)
      .mockResolvedValueOnce(DEFAULT_LOAD_RESULT)
      .mockResolvedValueOnce({
        text: '# Other',
        size: 7,
        mimeType: 'text/markdown',
        sourceRevision: 22,
      })
    await loadReady(model)

    model.updateSource('# Discard')
    expect(model.autosavePending()).toBe(true)
    model.discardLocalChanges()
    await vi.advanceTimersByTimeAsync(100)
    expect(model.autosavePending()).toBe(false)
    expect(saveTextFileById).not.toHaveBeenCalled()

    model.updateSource('# Reload')
    expect(model.autosavePending()).toBe(true)
    await model.reload()
    await vi.advanceTimersByTimeAsync(100)
    expect(model.autosavePending()).toBe(false)
    expect(saveTextFileById).not.toHaveBeenCalled()

    model.updateSource('# Switch')
    expect(model.autosavePending()).toBe(true)
    model.setPreview({...PREVIEW_DATA, fileId: 8, fileName: 'other.md', sourceRevision: 22})
    await flushAsync()
    await vi.advanceTimersByTimeAsync(100)
    expect(model.autosavePending()).toBe(false)
    expect(saveTextFileById).not.toHaveBeenCalled()

    model.updateSource('# Cleanup')
    expect(model.autosavePending()).toBe(true)
    model.cleanup()
    await vi.advanceTimersByTimeAsync(100)
    expect(model.autosavePending()).toBe(false)
    expect(saveTextFileById).not.toHaveBeenCalled()
  })

  it('ignores late save results after switching preview data', async () => {
    const saveResult = deferred<typeof DEFAULT_SAVE_RESULT>()
    const {model, loadTextFileById, saveTextFileById} = createModel()
    loadTextFileById
      .mockResolvedValueOnce(DEFAULT_LOAD_RESULT)
      .mockResolvedValueOnce({
        text: '# New',
        size: 5,
        mimeType: 'text/markdown',
        sourceRevision: 22,
      })
    saveTextFileById.mockReturnValueOnce(saveResult.promise)
    await loadReady(model)
    model.updateSource('# Old edit')

    const savePromise = model.save()
    await flushAsync()
    expect(expectReady(model).saving).toBe(true)

    model.setPreview({...PREVIEW_DATA, fileId: 8, fileName: 'new.md', sourceRevision: 22})
    await flushAsync()
    saveResult.resolve({...DEFAULT_SAVE_RESULT, sourceRevision: 99})

    await expect(savePromise).resolves.toBe(false)
    await flushAsync()

    const state = expectReady(model)
    expect(state.fileId).toBe(8)
    expect(state.source).toBe('# New')
    expect(state.sourceRevision).toBe(22)
    expect(state.dirty).toBe(false)
  })

  it('keeps source and dirty state when save fails', async () => {
    const {model, saveTextFileById} = createModel()
    saveTextFileById.mockRejectedValue(new FileLoadError('TEXT_SAVE_FAILED', 'failed'))
    await loadReady(model)
    model.updateSource('# Unsaved')

    await expect(model.save()).resolves.toBe(false)

    const state = expectReady(model)
    expect(state.source).toBe('# Unsaved')
    expect(state.baseline).toBe('# Notes')
    expect(state.dirty).toBe(true)
    expect(state.stale).toBe(false)
    expect(state.errorKey).toBe('markdown:error:save-failed')
  })

  it('keeps stale edits and overwrites only through the explicit stale action', async () => {
    const {model, saveTextFileById} = createModel()
    saveTextFileById
      .mockRejectedValueOnce(new FileLoadError('TEXT_STALE_SOURCE', 'stale'))
      .mockResolvedValueOnce({...DEFAULT_SAVE_RESULT, sourceRevision: 13})
    await loadReady(model)
    model.updateSource('# Local')

    await expect(model.save()).resolves.toBe(false)

    let state = expectReady(model)
    expect(state.source).toBe('# Local')
    expect(state.dirty).toBe(true)
    expect(state.stale).toBe(true)
    expect(state.errorKey).toBe('markdown:error:stale-source')

    await expect(model.overwriteStale()).resolves.toBe(true)

    const overwriteCall = saveTextFileById.mock.calls[1]
    expect(overwriteCall?.[3]).toEqual(
      expect.objectContaining({
        conflictMode: 'overwrite',
        expectedSourceRevision: 11,
      }),
    )
    state = expectReady(model)
    expect(state.baseline).toBe('# Local')
    expect(state.sourceRevision).toBe(13)
    expect(state.dirty).toBe(false)
    expect(state.stale).toBe(false)
  })

  it('can dismiss stale warning while keeping dirty source in memory', async () => {
    const {model, saveTextFileById} = createModel()
    saveTextFileById.mockRejectedValueOnce(new FileLoadError('TEXT_STALE_SOURCE', 'stale'))
    await loadReady(model)
    model.updateSource('# Local')
    await model.save()

    model.cancelStale()

    const state = expectReady(model)
    expect(state.source).toBe('# Local')
    expect(state.dirty).toBe(true)
    expect(state.stale).toBe(false)
    expect(state.errorKey).toBeNull()
  })

  it('reloads stale source from the current preview data', async () => {
    const {model, loadTextFileById, saveTextFileById} = createModel()
    loadTextFileById
      .mockResolvedValueOnce(DEFAULT_LOAD_RESULT)
      .mockResolvedValueOnce({
        text: '# Remote',
        size: 8,
        mimeType: 'text/markdown',
        sourceRevision: 12,
      })
    saveTextFileById.mockRejectedValueOnce(new FileLoadError('TEXT_STALE_SOURCE', 'stale'))
    await loadReady(model)
    model.updateSource('# Local')
    await model.save()

    await model.reload()

    const state = expectReady(model)
    expect(loadTextFileById).toHaveBeenCalledTimes(2)
    expect(state.source).toBe('# Remote')
    expect(state.baseline).toBe('# Remote')
    expect(state.sourceRevision).toBe(12)
    expect(state.dirty).toBe(false)
    expect(state.stale).toBe(false)
  })

  it.each([
    ['TEXT_TOO_LARGE', 'file-preview:text-too-large'],
    ['TEXT_INVALID_UTF8', 'file-preview:text-invalid-encoding'],
  ] as const)('maps %s load failures to preview fallback state', async (code, reasonKey) => {
    const {model, loadTextFileById} = createModel()
    loadTextFileById.mockRejectedValue(new FileLoadError(code, code))

    model.setPreview(PREVIEW_DATA)
    await flushAsync()

    expect(model.state()).toEqual({kind: 'fallback', reasonKey})
  })

  it('keeps metadata-unsupported Markdown editable but read-only for saves', async () => {
    const {model, saveTextFileById} = createModel({
      loadResult: {
        text: '# Offline',
        size: 9,
        mimeType: 'text/markdown',
        sourceRevision: null,
        sourceMetadataUnavailable: true,
      },
    })
    await loadReady(model)

    let state = expectReady(model)
    expect(state.readOnlyReasonKey).toBe('markdown:read-only:save-unavailable')

    model.updateSource('# Local only')
    await expect(model.save()).resolves.toBe(false)

    state = expectReady(model)
    expect(state.source).toBe('# Local only')
    expect(state.dirty).toBe(true)
    expect(state.readOnlyReasonKey).toBe('markdown:read-only:save-unavailable')
    expect(saveTextFileById).not.toHaveBeenCalled()
  })

  it('keeps dirty state and disables later saves when replacement support is unavailable', async () => {
    const {model, saveTextFileById} = createModel()
    saveTextFileById.mockRejectedValue(new FileLoadError('TEXT_WRITE_UNAVAILABLE', 'write unavailable'))
    await loadReady(model)
    model.updateSource('# Local')

    await expect(model.save()).resolves.toBe(false)
    await expect(model.save()).resolves.toBe(false)

    const state = expectReady(model)
    expect(saveTextFileById).toHaveBeenCalledTimes(1)
    expect(state.dirty).toBe(true)
    expect(state.errorKey).toBe('markdown:error:read-only')
    expect(state.readOnlyReasonKey).toBe('markdown:read-only:save-unavailable')
  })

  it('stores pending close intents and can cancel, save, or discard them', async () => {
    const {model} = createModel()
    await loadReady(model)
    model.updateSource('# Local')

    const resume = vi.fn()
    expect(model.requestCloseIntent({kind: 'close'})).toBe(false)
    expect(model.pendingCloseIntent()).toEqual({kind: 'close'})

    model.cancelPendingCloseIntent()
    expect(model.pendingCloseIntent()).toBeNull()

    expect(model.requestCloseIntent({kind: 'close'})).toBe(false)
    await model.savePendingCloseIntent()
    expect(model.pendingCloseIntent()).toBeNull()
    expect(model.dirty()).toBe(false)

    model.updateSource('# Local again')
    expect(model.requestCloseIntent({kind: 'close'}, resume)).toBe(false)
    model.discardPendingCloseIntent()

    const state = expectReady(model)
    expect(model.pendingCloseIntent()).toBeNull()
    expect(state.source).toBe(state.baseline)
    expect(state.dirty).toBe(false)
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('prevents default navigation for rendered Markdown links', () => {
    const {model} = createModel()
    const anchor = document.createElement('a')
    const span = document.createElement('span')
    anchor.href = 'https://example.com'
    anchor.append(span)
    document.body.append(anchor)
    anchor.addEventListener('click', (event) => model.handleRenderedPreviewClick(event as MouseEvent))

    const event = new MouseEvent('click', {bubbles: true, cancelable: true})
    span.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })
})
