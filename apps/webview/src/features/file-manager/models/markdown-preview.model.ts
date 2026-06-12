import {atom, computed, wrap} from '@reatom/core'

import type {CatalogFileReplaceConflictMode, CatalogFileReplaceResult} from 'root/core/catalog/catalog'
import {
  loadSessionSettings,
  type SessionSettings,
} from 'root/core/session/session-settings'
import {
  systemClipboardTextReader,
  type ClipboardTextReader,
} from 'root/shared/services/clipboard'
import type {FilePreviewFallbackReasonKey} from '../components/file-preview.model'
import {
  FileLoadError,
  loadTextFileById,
  saveTextFileById,
  type FileTextLoadResult,
} from '../services/text-file-io'
import {formatMarkdownSource} from '../services/markdown-formatter'
import {getMarkdownErrorKey, type MarkdownErrorKey} from '../services/markdown-errors'
import {
  renderMarkdownSource,
  type MarkdownImageRef,
} from '../services/markdown-renderer'
import {
  MarkdownImageAssetError,
  markdownImageAssetService,
  type MarkdownImageAssetResolution,
  type MarkdownImageAssetService,
  type MarkdownImageAssetStatus,
} from '../services/markdown-image-assets'
import {normalizeMarkdownAttachmentFolderPath} from '../services/markdown-attachment-settings'

export type MarkdownPreviewMode = 'preview' | 'edit'
export type MarkdownReadOnlyReasonKey = 'markdown:read-only:save-unavailable'

export type MarkdownPreviewData = {
  fileId: number
  fileName: string
  size?: number
  mimeType?: string
  lastModified?: number
  sourceRevision?: number
  mode?: 'markdown'
}

export type MarkdownCloseIntent = Readonly<{kind: string} & Record<string, unknown>>

export type MarkdownEditorFocusRequest = {
  id: number
  selectionStart: number | null
}

export type MarkdownImageInsertionSelection = {
  selectionStart: number
  selectionEnd: number
}

export type MarkdownPreviewImageAssetState = {
  key: string
  rawRef: string
  altText: string
  status: MarkdownImageAssetStatus | 'loading'
  url: string | null
}

export type MarkdownPreviewReadyState = {
  kind: 'ready'
  fileId: number
  fileName: string
  size?: number
  mimeType: string
  lastModified?: number
  source: string
  baseline: string
  sourceRevision: number | null
  baselineSourceRevision: number | null
  mode: MarkdownPreviewMode
  dirty: boolean
  saving: boolean
  formatting: boolean
  stale: boolean
  renderedHtml: string
  imageAssets: Record<string, MarkdownPreviewImageAssetState>
  errorKey: MarkdownErrorKey | null
  readOnlyReasonKey: MarkdownReadOnlyReasonKey | null
  lastSavedAt: number | null
  autosavePending: boolean
  lastAutosaveAttemptAt: number | null
}

export type MarkdownPreviewState =
  | {kind: 'idle'}
  | {kind: 'loading'}
  | MarkdownPreviewReadyState
  | {kind: 'fallback'; reasonKey: FilePreviewFallbackReasonKey}

export type MarkdownPreviewModelDeps = {
  loadTextFileById?: typeof loadTextFileById
  saveTextFileById?: typeof saveTextFileById
  renderMarkdownSource?: typeof renderMarkdownSource
  formatMarkdownSource?: typeof formatMarkdownSource
  imageAssetService?: Pick<
    MarkdownImageAssetService,
    'releaseResolution' | 'resolveImageRef' | 'uploadImageFiles'
  >
  clipboardTextReader?: ClipboardTextReader
  loadSessionSettings?: typeof loadSessionSettings
  renderDebounceMs?: number
  autosaveDebounceMs?: number
  historyGroupMs?: number
  maxHistoryLength?: number
  now?: () => number
}

const DEFAULT_MAX_MARKDOWN_BYTES = 1_048_576
const DEFAULT_RENDER_DEBOUNCE_MS = 120
const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 1_000
const DEFAULT_HISTORY_GROUP_MS = 750
const DEFAULT_MAX_HISTORY_LENGTH = 100
const MARKDOWN_MIME_TYPE = 'text/markdown'
const SAVE_UNAVAILABLE_REASON_KEY: MarkdownReadOnlyReasonKey = 'markdown:read-only:save-unavailable'

type MarkdownHistoryState = {
  undoStack: string[]
  redoStack: string[]
  activeGroupStartedAt: number | null
}

type MarkdownHistoryOrigin = 'user' | 'format'
type MarkdownSaveOrigin = 'manual' | 'autosave' | 'overwrite'

type RenderSnapshot = {
  renderedHtml: string
  baseHtml: string
  imageAssets: Record<string, MarkdownPreviewImageAssetState>
  imageRefs: MarkdownImageRef[]
  errorKey: MarkdownErrorKey | null
}

type InsertMarkdownResult = {
  source: string
  selectionStart: number
}

type ImagePickerTrigger = () => void

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isSamePreviewData(a: MarkdownPreviewData | null, b: MarkdownPreviewData | null): boolean {
  return (
    a?.fileId === b?.fileId &&
    a?.fileName === b?.fileName &&
    a?.size === b?.size &&
    a?.mimeType === b?.mimeType &&
    a?.lastModified === b?.lastModified &&
    a?.sourceRevision === b?.sourceRevision &&
    a?.mode === b?.mode
  )
}

function isSameReadyPreviewFile(state: MarkdownPreviewReadyState, data: MarkdownPreviewData): boolean {
  return state.fileId === data.fileId && data.mode === 'markdown'
}

export class MarkdownPreviewModel {
  readonly currentData = atom<MarkdownPreviewData | null>(null)
  readonly state = atom<MarkdownPreviewState>({kind: 'idle'})
  private readonly historyState = atom<MarkdownHistoryState>({
    undoStack: [],
    redoStack: [],
    activeGroupStartedAt: null,
  })
  readonly pendingCloseIntent = atom<MarkdownCloseIntent | null>(null)
  readonly editorFocusRequest = atom<MarkdownEditorFocusRequest | null>(
    null,
    'markdown.preview.editorFocusRequest',
  )
  readonly imageAttaching = atom(false, 'markdown.preview.imageAttaching')
  private readonly lastImageInsertionSelection = atom<MarkdownImageInsertionSelection | null>(
    null,
    'markdown.preview.lastImageInsertionSelection',
  )
  private readonly pendingImageInsertionSelection = atom<MarkdownImageInsertionSelection | null>(
    null,
    'markdown.preview.pendingImageInsertionSelection',
  )

  readonly source = computed(() => {
    const state = this.state()
    return state.kind === 'ready' ? state.source : ''
  })
  readonly baseline = computed(() => {
    const state = this.state()
    return state.kind === 'ready' ? state.baseline : ''
  })
  readonly sourceRevision = computed(() => {
    const state = this.state()
    return state.kind === 'ready' ? state.sourceRevision : null
  })
  readonly mode = computed<MarkdownPreviewMode>(() => {
    const state = this.state()
    return state.kind === 'ready' ? state.mode : 'preview'
  })
  readonly dirty = computed(() => {
    const state = this.state()
    return state.kind === 'ready' && state.dirty
  })
  readonly saving = computed(() => {
    const state = this.state()
    return state.kind === 'ready' && state.saving
  })
  readonly formatting = computed(() => {
    const state = this.state()
    return state.kind === 'ready' && state.formatting
  })
  readonly stale = computed(() => {
    const state = this.state()
    return state.kind === 'ready' && state.stale
  })
  readonly renderedHtml = computed(() => {
    const state = this.state()
    return state.kind === 'ready' ? state.renderedHtml : ''
  })
  readonly fallbackReasonKey = computed<FilePreviewFallbackReasonKey>(() => {
    const state = this.state()
    return state.kind === 'fallback' ? state.reasonKey : 'file-preview:preview-unavailable'
  })
  readonly errorKey = computed<MarkdownErrorKey | null>(() => {
    const state = this.state()
    return state.kind === 'ready' ? state.errorKey : null
  })
  readonly readOnlyReasonKey = computed<MarkdownReadOnlyReasonKey | null>(() => {
    const state = this.state()
    return state.kind === 'ready' ? state.readOnlyReasonKey : null
  })
  readonly autosavePending = computed(() => {
    const state = this.state()
    return state.kind === 'ready' && state.autosavePending
  })
  readonly lastAutosaveAttemptAt = computed(() => {
    const state = this.state()
    return state.kind === 'ready' ? state.lastAutosaveAttemptAt : null
  })
  readonly canUndo = computed(() => this.historyState().undoStack.length > 0)
  readonly canRedo = computed(() => this.historyState().redoStack.length > 0)
  readonly canSave = computed(() => {
    const state = this.state()
    return (
      state.kind === 'ready' &&
      state.dirty &&
      !state.saving &&
      !state.formatting &&
      !state.readOnlyReasonKey
    )
  })
  readonly canFormat = computed(() => {
    const state = this.state()
    return state.kind === 'ready' && !state.saving && !state.formatting
  })
  readonly canInsertImage = computed(() => {
    const state = this.state()
    return (
      state.kind === 'ready' &&
      !state.saving &&
      !state.formatting &&
      !state.readOnlyReasonKey &&
      !this.imageAttaching()
    )
  })
  readonly canPasteText = computed(() => this.state().kind === 'ready')

  private readonly loadText: typeof loadTextFileById
  private readonly saveText: typeof saveTextFileById
  private readonly renderSource: typeof renderMarkdownSource
  private readonly formatSource: typeof formatMarkdownSource
  private readonly clipboardTextReader: ClipboardTextReader
  private readonly imageAssetService: Pick<
    MarkdownImageAssetService,
    'releaseResolution' | 'resolveImageRef' | 'uploadImageFiles'
  >
  private readonly loadSettings: typeof loadSessionSettings
  private readonly renderDebounceMs: number
  private readonly autosaveDebounceMs: number
  private readonly historyGroupMs: number
  private readonly maxHistoryLength: number
  private readonly now: () => number
  private abortController: AbortController | null = null
  private imageResolutionController: AbortController | null = null
  private attachmentUploadController: AbortController | null = null
  private operationToken = 0
  private imageResolutionToken = 0
  private attachmentUploadToken = 0
  private imageAssetResolutions = new Map<string, MarkdownImageAssetResolution>()
  private renderTimer: ReturnType<typeof setTimeout> | null = null
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null
  private pendingCloseResume: (() => void) | null = null
  private editorFocusRequestId = 0
  private imagePickerTrigger: ImagePickerTrigger | null = null

  constructor(deps: MarkdownPreviewModelDeps = {}) {
    this.loadText = deps.loadTextFileById ?? loadTextFileById
    this.saveText = deps.saveTextFileById ?? saveTextFileById
    this.renderSource = deps.renderMarkdownSource ?? renderMarkdownSource
    this.formatSource = deps.formatMarkdownSource ?? formatMarkdownSource
    this.clipboardTextReader = deps.clipboardTextReader ?? systemClipboardTextReader
    this.imageAssetService = deps.imageAssetService ?? markdownImageAssetService
    this.loadSettings = deps.loadSessionSettings ?? loadSessionSettings
    this.renderDebounceMs = deps.renderDebounceMs ?? DEFAULT_RENDER_DEBOUNCE_MS
    this.autosaveDebounceMs = deps.autosaveDebounceMs ?? DEFAULT_AUTOSAVE_DEBOUNCE_MS
    this.historyGroupMs = deps.historyGroupMs ?? DEFAULT_HISTORY_GROUP_MS
    this.maxHistoryLength = deps.maxHistoryLength ?? DEFAULT_MAX_HISTORY_LENGTH
    this.now = deps.now ?? (() => Date.now())
  }

  setPreview(data: MarkdownPreviewData | null): void {
    if (isSamePreviewData(this.currentData(), data)) {
      return
    }

    const state = this.state()
    if (data && state.kind === 'ready' && isSameReadyPreviewFile(state, data)) {
      if (state.saving || state.formatting) {
        this.currentData.set(data)
        return
      }

      const sourceRevision = data.sourceRevision ?? state.sourceRevision
      if (!state.dirty && sourceRevision === state.sourceRevision) {
        this.currentData.set(data)
        this.state.set({
          ...state,
          fileName: data.fileName,
          size: data.size ?? state.size,
          mimeType: data.mimeType ?? state.mimeType,
          lastModified: data.lastModified ?? state.lastModified,
          sourceRevision,
          baselineSourceRevision: sourceRevision,
        })
        return
      }

      if (state.dirty) {
        this.currentData.set(data)
        this.state.set({
          ...state,
          fileName: data.fileName,
          size: data.size ?? state.size,
          mimeType: data.mimeType ?? state.mimeType,
          lastModified: data.lastModified ?? state.lastModified,
          stale: state.stale || sourceRevision !== state.sourceRevision,
          errorKey: sourceRevision !== state.sourceRevision ? 'markdown:error:stale-source' : state.errorKey,
        })
        return
      }
    }

    this.abortCurrentOperation()
    this.clearImageAssets()
    this.abortAttachmentUpload()
    this.clearRenderTimer()
    this.clearAutosaveTimer()
    this.resetHistory()
    this.pendingCloseIntent.set(null)
    this.editorFocusRequest.set(null)
    this.resetImageInsertionSelection()
    this.currentData.set(data)

    if (!data) {
      this.state.set({kind: 'idle'})
      return
    }

    this.state.set({kind: 'loading'})
    void this.loadPreview(data)
  }

  applyFileRename(fileId: number, fileName: string): void {
    const currentData = this.currentData()
    if (currentData?.fileId === fileId && currentData.fileName !== fileName) {
      this.currentData.set({...currentData, fileName})
    }

    this.updateReadyState((state) =>
      state.fileId === fileId && state.fileName !== fileName ? {...state, fileName} : state,
    )
  }

  setMode(mode: MarkdownPreviewMode, options: {selectionStart?: number | null} = {}): void {
    const state = this.state()
    if (state.kind !== 'ready') {
      return
    }

    if (mode === 'edit') {
      this.requestEditorFocus(state, options.selectionStart ?? null)
    } else {
      this.editorFocusRequest.set(null)
    }

    if (state.mode !== mode) {
      this.state.set({...state, mode})
    }
  }

  updateSource(source: string): void {
    const current = this.state()
    if (current.kind !== 'ready' || current.source === source) {
      return
    }

    this.state.set({
      ...current,
      source,
      dirty: source !== current.baseline,
      errorKey: current.stale ? current.errorKey : null,
    })
    this.recordHistoryForSourceChange(current.source, 'user')
    this.scheduleRender()
    this.scheduleAutosaveForCurrentSource()
  }

  async save(): Promise<boolean> {
    this.clearAutosaveTimer()
    return this.saveWithConflictMode('manual', 'fail_if_stale')
  }

  async formatDocument(): Promise<boolean> {
    const snapshot = this.state()
    if (snapshot.kind !== 'ready' || snapshot.saving || snapshot.formatting) {
      return false
    }

    const token = ++this.operationToken
    this.clearRenderTimer()
    this.clearAutosaveTimer()
    this.state.set({...snapshot, formatting: true, errorKey: null})

    try {
      const formattedSource = await wrap(this.formatSource(snapshot.source))
      if (token !== this.operationToken) {
        return false
      }

      const current = this.state()
      if (current.kind !== 'ready') {
        return false
      }
      if (current.source !== snapshot.source) {
        this.state.set({...current, formatting: false})
        return false
      }

      if (formattedSource === current.source) {
        this.state.set({...current, formatting: false})
        this.scheduleAutosaveForCurrentSource()
        return true
      }

      this.recordHistoryForSourceChange(current.source, 'format')
      const rendered = this.renderMarkdown(formattedSource)
      this.clearImageAssets()
      this.state.set({
        ...current,
        source: formattedSource,
        dirty: formattedSource !== current.baseline,
        formatting: false,
        renderedHtml: rendered.renderedHtml,
        imageAssets: rendered.imageAssets,
        errorKey: current.stale ? current.errorKey : rendered.errorKey,
      })
      this.startImageResolution(rendered, formattedSource)
      this.scheduleAutosaveForCurrentSource()
      return true
    } catch {
      if (token !== this.operationToken) {
        return false
      }

      this.updateReadyState((state) => ({
        ...state,
        formatting: false,
        errorKey: 'markdown:error:format-failed',
      }))
      this.scheduleAutosaveForCurrentSource()
      return false
    }
  }

  async reload(): Promise<void> {
    const data = this.currentData()
    if (!data) {
      return
    }

    this.abortCurrentOperation()
    this.clearImageAssets()
    this.abortAttachmentUpload()
    this.clearRenderTimer()
    this.clearAutosaveTimer()
    this.resetHistory()
    this.pendingCloseIntent.set(null)
    this.state.set({kind: 'loading'})
    await this.loadPreview(data)
  }

  async overwriteStale(): Promise<boolean> {
    const state = this.state()
    if (state.kind !== 'ready' || !state.stale) {
      return false
    }

    this.clearAutosaveTimer()
    return this.saveWithConflictMode('overwrite', 'overwrite')
  }

  cancelStale(): void {
    this.updateReadyState((state) => ({
      ...state,
      stale: false,
      errorKey: null,
    }))
  }

  discardLocalChanges(): void {
    const state = this.state()
    if (state.kind !== 'ready') {
      return
    }

    this.abortCurrentOperation()
    this.clearImageAssets()
    this.abortAttachmentUpload()
    this.clearRenderTimer()
    this.clearAutosaveTimer()
    this.resetHistory()
    const rendered = this.renderMarkdown(state.baseline)
    this.state.set({
      ...state,
      source: state.baseline,
      sourceRevision: state.baselineSourceRevision,
      dirty: false,
      saving: false,
      formatting: false,
      stale: false,
      renderedHtml: rendered.renderedHtml,
      imageAssets: rendered.imageAssets,
      errorKey: rendered.errorKey,
      autosavePending: false,
    })
    this.startImageResolution(rendered, state.baseline)
  }

  requestCloseIntent(intent: MarkdownCloseIntent, resume?: () => void): boolean {
    const state = this.state()
    if (state.kind === 'ready' && (state.dirty || state.saving)) {
      this.pendingCloseIntent.set(intent)
      this.pendingCloseResume = resume ?? null
      return false
    }

    this.pendingCloseIntent.set(null)
    this.pendingCloseResume = null
    return true
  }

  cancelPendingCloseIntent(): void {
    this.pendingCloseIntent.set(null)
    this.pendingCloseResume = null
  }

  async savePendingCloseIntent(): Promise<void> {
    const saved = await wrap(this.save())
    if (saved) {
      const resume = this.pendingCloseResume
      this.pendingCloseIntent.set(null)
      this.pendingCloseResume = null
      resume?.()
    }
  }

  discardPendingCloseIntent(): void {
    const resume = this.pendingCloseResume
    this.discardLocalChanges()
    this.pendingCloseIntent.set(null)
    this.pendingCloseResume = null
    resume?.()
  }

  handleRenderedPreviewClick(event: MouseEvent): void {
    const target = event.target
    const element =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null
    const anchor = element?.closest('a')
    if (!anchor) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  registerImagePickerTrigger(trigger: ImagePickerTrigger): () => void {
    this.imagePickerTrigger = trigger
    return () => {
      if (this.imagePickerTrigger === trigger) {
        this.imagePickerTrigger = null
      }
    }
  }

  requestImagePicker(selection?: MarkdownImageInsertionSelection): boolean {
    const snapshot = this.state()
    const trigger = this.imagePickerTrigger
    if (!this.canInsertImage() || snapshot.kind !== 'ready' || !trigger) {
      return false
    }

    const nextSelection = this.normalizeImageInsertionSelection(
      selection ?? this.getLastKnownEditorSelection(snapshot),
      snapshot.source.length,
    )
    this.lastImageInsertionSelection.set(nextSelection)
    this.pendingImageInsertionSelection.set(nextSelection)

    if (snapshot.mode === 'edit') {
      this.requestEditorFocus(snapshot, nextSelection.selectionStart)
    } else {
      this.setMode('edit', {selectionStart: nextSelection.selectionStart})
    }

    trigger()
    return true
  }

  updateEditorSelection(selection: MarkdownImageInsertionSelection): void {
    const state = this.state()
    if (state.kind !== 'ready') {
      return
    }

    this.lastImageInsertionSelection.set(
      this.normalizeImageInsertionSelection(selection, state.source.length),
    )
  }

  async pasteTextFromClipboard(selection?: MarkdownImageInsertionSelection): Promise<boolean> {
    const snapshot = this.state()
    if (snapshot.kind !== 'ready') {
      return false
    }

    const initialSelection = this.normalizeImageInsertionSelection(
      selection ?? this.getLastKnownEditorSelection(snapshot),
      snapshot.source.length,
    )

    let text = ''
    try {
      text = await wrap(this.clipboardTextReader.readText())
    } catch {
      return false
    }

    if (!text) {
      return false
    }

    const current = this.state()
    if (current.kind !== 'ready' || current.fileId !== snapshot.fileId) {
      return false
    }

    const normalizedSelection = this.normalizeImageInsertionSelection(
      initialSelection,
      current.source.length,
    )
    const inserted = this.insertTextAtSelection(current.source, text, normalizedSelection)
    this.lastImageInsertionSelection.set({
      selectionStart: inserted.selectionStart,
      selectionEnd: inserted.selectionStart,
    })

    if (inserted.source === current.source) {
      if (current.mode !== 'edit') {
        this.state.set({...current, mode: 'edit'})
      }
      this.requestEditorFocus({...current, mode: 'edit'}, inserted.selectionStart)
      return true
    }

    this.recordHistoryForSourceChange(current.source, 'user')
    const nextState: MarkdownPreviewReadyState = {
      ...current,
      mode: 'edit',
      source: inserted.source,
      dirty: inserted.source !== current.baseline,
      errorKey: current.stale ? current.errorKey : null,
    }
    this.state.set(nextState)
    this.requestEditorFocus(nextState, inserted.selectionStart)
    this.scheduleRender()
    this.scheduleAutosaveForCurrentSource()
    return true
  }

  getImageInsertionSelection(): MarkdownImageInsertionSelection {
    const state = this.state()
    if (state.kind !== 'ready') {
      return {selectionStart: 0, selectionEnd: 0}
    }

    return this.normalizeImageInsertionSelection(
      this.pendingImageInsertionSelection() ?? this.getLastKnownEditorSelection(state),
      state.source.length,
    )
  }

  async insertImageFiles(
    files: readonly File[],
    selection: MarkdownImageInsertionSelection,
  ): Promise<boolean> {
    const snapshot = this.state()
    if (
      snapshot.kind !== 'ready' ||
      snapshot.saving ||
      snapshot.formatting ||
      snapshot.readOnlyReasonKey ||
      this.imageAttaching()
    ) {
      return false
    }

    this.abortAttachmentUpload()
    const controller = new AbortController()
    const token = ++this.attachmentUploadToken
    this.attachmentUploadController = controller
    this.imageAttaching.set(true)

    try {
      const settings = await wrap(this.loadSettings())
      const attachmentFolderPath = this.getAttachmentFolderPath(settings)
      if (!attachmentFolderPath) {
        this.setReadyError('markdown:error:attachment-folder-invalid')
        return false
      }

      const uploaded = await wrap(
        this.imageAssetService.uploadImageFiles(files, {
          attachmentFolderPath,
          signal: controller.signal,
        }),
      )
      if (controller.signal.aborted || token !== this.attachmentUploadToken) {
        return false
      }

      const current = this.state()
      if (
        current.kind !== 'ready' ||
        current.saving ||
        current.formatting ||
        current.readOnlyReasonKey
      ) {
        return false
      }

      const inserted = this.insertMarkdownAtSelection(current.source, uploaded.markdown, selection)
      this.lastImageInsertionSelection.set({
        selectionStart: inserted.selectionStart,
        selectionEnd: inserted.selectionStart,
      })
      this.recordHistoryForSourceChange(current.source, 'user')
      this.state.set({
        ...current,
        source: inserted.source,
        dirty: inserted.source !== current.baseline,
        errorKey: current.stale ? current.errorKey : null,
      })
      this.requestEditorFocus({...current, source: inserted.source}, inserted.selectionStart)
      this.scheduleRender()
      this.scheduleAutosaveForCurrentSource()
      return true
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === 'AbortError') ||
        token !== this.attachmentUploadToken
      ) {
        return false
      }

      this.setReadyError(this.getAttachmentUploadErrorKey(error))
      return false
    } finally {
      if (this.attachmentUploadController === controller) {
        this.attachmentUploadController = null
        this.imageAttaching.set(false)
        this.pendingImageInsertionSelection.set(null)
      }
    }
  }

  cleanup(): void {
    this.abortCurrentOperation()
    this.clearImageAssets()
    this.abortAttachmentUpload()
    this.clearRenderTimer()
    this.clearAutosaveTimer()
    this.resetHistory()
    this.currentData.set(null)
    this.pendingCloseIntent.set(null)
    this.pendingCloseResume = null
    this.editorFocusRequest.set(null)
    this.resetImageInsertionSelection()
    this.state.set({kind: 'idle'})
  }

  private requestEditorFocus(state: MarkdownPreviewReadyState, selectionStart: number | null): void {
    const normalizedSelectionStart =
      typeof selectionStart === 'number' && Number.isFinite(selectionStart)
        ? Math.min(state.source.length, Math.max(0, Math.floor(selectionStart)))
        : null

    this.editorFocusRequest.set({
      id: ++this.editorFocusRequestId,
      selectionStart: normalizedSelectionStart,
    })
  }

  private async loadPreview(data: MarkdownPreviewData): Promise<void> {
    const controller = new AbortController()
    const token = ++this.operationToken
    this.abortController = controller

    try {
      const loaded = await wrap(
        this.loadText(data.fileId, data.fileName, {
          signal: controller.signal,
          maxBytes: DEFAULT_MAX_MARKDOWN_BYTES,
          allowMetadataFallback: true,
        }),
      )
      if (controller.signal.aborted || token !== this.operationToken) {
        return
      }

      const ready = this.createReadyState(data, loaded)
      this.state.set(ready.state)
      this.startImageResolution(ready.rendered, loaded.text)
    } catch (error) {
      if (isAbortError(error) || token !== this.operationToken) {
        return
      }

      this.state.set(this.createLoadFailureState(error))
    } finally {
      if (this.abortController === controller) {
        this.abortController = null
      }
    }
  }

  private createReadyState(
    data: MarkdownPreviewData,
    loaded: FileTextLoadResult,
  ): {state: MarkdownPreviewReadyState; rendered: RenderSnapshot} {
    const rendered = this.renderMarkdown(loaded.text)
    const sourceRevision = loaded.sourceRevision ?? null
    const readOnlyReasonKey =
      loaded.sourceMetadataUnavailable || sourceRevision === null ? SAVE_UNAVAILABLE_REASON_KEY : null

    return {
      state: {
        kind: 'ready',
        fileId: data.fileId,
        fileName: data.fileName,
        size: loaded.size,
        mimeType: loaded.mimeType,
        lastModified: data.lastModified,
        source: loaded.text,
        baseline: loaded.text,
        sourceRevision,
        baselineSourceRevision: sourceRevision,
        mode: 'preview',
        dirty: false,
        saving: false,
        formatting: false,
        stale: false,
        renderedHtml: rendered.renderedHtml,
        imageAssets: rendered.imageAssets,
        errorKey: rendered.errorKey,
        readOnlyReasonKey,
        lastSavedAt: null,
        autosavePending: false,
        lastAutosaveAttemptAt: null,
      },
      rendered,
    }
  }

  private createLoadFailureState(error: unknown): MarkdownPreviewState {
    if (error instanceof FileLoadError) {
      if (error.code === 'TEXT_TOO_LARGE') {
        return {kind: 'fallback', reasonKey: 'file-preview:text-too-large'}
      }
      if (error.code === 'TEXT_INVALID_UTF8') {
        return {kind: 'fallback', reasonKey: 'file-preview:text-invalid-encoding'}
      }
    }

    return {kind: 'fallback', reasonKey: 'file-preview:preview-unavailable'}
  }

  private async saveWithConflictMode(
    origin: MarkdownSaveOrigin,
    conflictMode: CatalogFileReplaceConflictMode,
  ): Promise<boolean> {
    const snapshot = this.state()
    if (snapshot.kind !== 'ready') {
      return false
    }
    if (snapshot.saving || snapshot.formatting || snapshot.readOnlyReasonKey) {
      return false
    }
    if (!snapshot.dirty) {
      return true
    }
    if (origin === 'autosave' && !this.canStartAutosave(snapshot)) {
      return false
    }

    const controller = new AbortController()
    const token = ++this.operationToken
    const savedSource = snapshot.source
    this.abortController = controller
    this.state.set({...snapshot, saving: true, errorKey: null, autosavePending: false})

    try {
      const result = await wrap(
        this.saveText(snapshot.fileId, snapshot.fileName, savedSource, {
          mimeType: MARKDOWN_MIME_TYPE,
          expectedSourceRevision: snapshot.baselineSourceRevision,
          conflictMode,
          signal: controller.signal,
          maxBytes: DEFAULT_MAX_MARKDOWN_BYTES,
        }),
      )
      if (controller.signal.aborted || token !== this.operationToken) {
        return false
      }

      this.applySaveSuccess(savedSource, result)
      return true
    } catch (error) {
      if (isAbortError(error) || token !== this.operationToken) {
        return false
      }

      this.applySaveFailure(error)
      return false
    } finally {
      if (this.abortController === controller) {
        this.abortController = null
      }
    }
  }

  private applySaveSuccess(savedSource: string, result: CatalogFileReplaceResult): void {
    let shouldScheduleTrailingAutosave = false
    let savedData: MarkdownPreviewData | null = null
    this.updateReadyState((state) => {
      const sourceRevision = result.sourceRevision ?? null
      const readOnlyReasonKey = sourceRevision === null ? SAVE_UNAVAILABLE_REASON_KEY : null
      const nextState: MarkdownPreviewReadyState = {
        ...state,
        fileId: result.nodeId,
        size: result.size,
        mimeType: result.mimeType,
        lastModified: result.modtime,
        baseline: savedSource,
        sourceRevision,
        baselineSourceRevision: sourceRevision,
        dirty: state.source !== savedSource,
        saving: false,
        formatting: false,
        stale: false,
        errorKey: null,
        readOnlyReasonKey,
        lastSavedAt: this.now(),
        autosavePending: false,
      }
      const currentData = this.currentData()
      if (currentData?.fileId === state.fileId) {
        savedData = {
          ...currentData,
          fileId: result.nodeId,
          fileName: state.fileName,
          size: result.size,
          mimeType: result.mimeType,
          lastModified: result.modtime,
          sourceRevision: result.sourceRevision ?? undefined,
        }
      }
      shouldScheduleTrailingAutosave =
        nextState.source !== savedSource && this.canStartAutosave(nextState)
      return nextState
    })
    if (savedData) {
      this.currentData.set(savedData)
    }
    if (shouldScheduleTrailingAutosave) {
      this.scheduleAutosave('trailing-save')
    }
  }

  private applySaveFailure(error: unknown): void {
    this.clearAutosaveTimer()
    this.updateReadyState((state) => {
      const errorKey = getMarkdownErrorKey(error, 'markdown:error:save-failed')
      return {
        ...state,
        saving: false,
        formatting: false,
        autosavePending: false,
        stale: error instanceof FileLoadError && error.code === 'TEXT_STALE_SOURCE',
        errorKey,
        readOnlyReasonKey:
          error instanceof FileLoadError && error.code === 'TEXT_WRITE_UNAVAILABLE'
            ? SAVE_UNAVAILABLE_REASON_KEY
            : state.readOnlyReasonKey,
      }
    })
  }

  private renderMarkdown(source: string): RenderSnapshot {
    try {
      const result = this.renderSource(source)
      const imageRefs = result.imageRefs ?? []
      const imageAssets = this.createLoadingImageAssetState(imageRefs)
      return {
        renderedHtml: this.applyImageAssetStates(result.html, imageAssets),
        baseHtml: result.html,
        imageAssets,
        imageRefs,
        errorKey: null,
      }
    } catch (error) {
      return {
        renderedHtml: '',
        baseHtml: '',
        imageAssets: {},
        imageRefs: [],
        errorKey: getMarkdownErrorKey(error, 'markdown:error:render-failed'),
      }
    }
  }

  private scheduleRender(): void {
    this.clearRenderTimer()
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null
      this.updateRenderedMarkdown()
    }, this.renderDebounceMs)
  }

  private updateRenderedMarkdown(): void {
    const state = this.state()
    if (state.kind !== 'ready') {
      return
    }

    const rendered = this.renderMarkdown(state.source)
    this.clearImageAssets()
    this.state.set({
      ...state,
      renderedHtml: rendered.renderedHtml,
      imageAssets: rendered.imageAssets,
      errorKey: rendered.errorKey ?? state.errorKey,
    })
    this.startImageResolution(rendered, state.source)
  }

  private createLoadingImageAssetState(
    imageRefs: readonly MarkdownImageRef[],
  ): Record<string, MarkdownPreviewImageAssetState> {
    return Object.fromEntries(
      imageRefs.map((ref) => [
        ref.key,
        {
          key: ref.key,
          rawRef: ref.rawRef,
          altText: ref.altText,
          status: ref.kind === 'catalog-absolute' ? 'loading' : this.imageRefStatus(ref),
          url: null,
        } satisfies MarkdownPreviewImageAssetState,
      ]),
    )
  }

  private imageRefStatus(ref: MarkdownImageRef): MarkdownPreviewImageAssetState['status'] {
    if (ref.kind === 'external-blocked') {
      return 'blocked-external'
    }

    return 'unsupported'
  }

  private applyImageAssetStates(
    baseHtml: string,
    imageAssets: Record<string, MarkdownPreviewImageAssetState>,
  ): string {
    if (!baseHtml || typeof document === 'undefined') {
      return baseHtml
    }

    const template = document.createElement('template')
    template.innerHTML = baseHtml

    for (const element of template.content.querySelectorAll<HTMLElement>('[data-cv-image-key]')) {
      const key = element.dataset['cvImageKey']
      const asset = key ? imageAssets[key] : undefined
      if (!key || !asset) {
        continue
      }

      if (asset.status === 'loaded' && asset.url) {
        const image = document.createElement('img')
        image.className = 'cv-markdown-image cv-markdown-image--loaded'
        image.alt = asset.altText
        image.src = asset.url
        image.loading = 'lazy'
        image.decoding = 'async'
        image.dataset['cvImageKey'] = asset.key
        image.dataset['cvImageRef'] = asset.rawRef
        image.dataset['cvImageKind'] = 'catalog-absolute'
        element.replaceWith(image)
        continue
      }

      element.className = `cv-markdown-image cv-markdown-image--${this.imageStatusClass(asset.status)}`
      element.setAttribute('role', 'img')
      element.setAttribute('aria-label', asset.altText || asset.rawRef)
      element.textContent = asset.altText || asset.rawRef
    }

    return template.innerHTML
  }

  private imageStatusClass(status: MarkdownPreviewImageAssetState['status']): string {
    return status === 'blocked-external' ? 'blocked' : status
  }

  private startImageResolution(rendered: RenderSnapshot, source: string): void {
    if (rendered.errorKey || rendered.imageRefs.length === 0) {
      return
    }

    this.abortImageResolution()
    const controller = new AbortController()
    const token = ++this.imageResolutionToken
    this.imageResolutionController = controller
    void this.resolveImageRefs(rendered, source, token, controller)
  }

  private async resolveImageRefs(
    rendered: RenderSnapshot,
    source: string,
    token: number,
    controller: AbortController,
  ): Promise<void> {
    try {
      const settled = await wrap(
        Promise.allSettled(
          rendered.imageRefs.map((ref) =>
            this.imageAssetService.resolveImageRef(ref, {signal: controller.signal}),
          ),
        ),
      )
      const resolutions: MarkdownImageAssetResolution[] = []
      let firstError: unknown = null
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          resolutions.push(result.value)
          continue
        }
        firstError ??= result.reason
      }
      if (controller.signal.aborted || token !== this.imageResolutionToken) {
        for (const resolution of resolutions) {
          this.imageAssetService.releaseResolution(resolution)
        }
        return
      }
      if (firstError) {
        for (const resolution of resolutions) {
          this.imageAssetService.releaseResolution(resolution)
        }
        throw firstError
      }

      const current = this.state()
      if (current.kind !== 'ready' || current.source !== source) {
        for (const resolution of resolutions) {
          this.imageAssetService.releaseResolution(resolution)
        }
        return
      }

      const nextAssets: Record<string, MarkdownPreviewImageAssetState> = {
        ...rendered.imageAssets,
      }
      for (const resolution of resolutions) {
        if (resolution.status === 'loaded') {
          this.imageAssetResolutions.set(resolution.key, resolution)
        }
        nextAssets[resolution.key] = {
          key: resolution.key,
          rawRef: resolution.rawRef,
          altText: resolution.altText,
          status: resolution.status,
          url: resolution.url,
        }
      }

      this.state.set({
        ...current,
        imageAssets: nextAssets,
        renderedHtml: this.applyImageAssetStates(rendered.baseHtml, nextAssets),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      const erroredAssets: Record<string, MarkdownPreviewImageAssetState> = {
        ...rendered.imageAssets,
      }
      for (const ref of rendered.imageRefs) {
        erroredAssets[ref.key] = {
          key: ref.key,
          rawRef: ref.rawRef,
          altText: ref.altText,
          status: 'error',
          url: null,
        }
      }
      this.updateReadyState((state) =>
        state.source === source
          ? {
              ...state,
              imageAssets: erroredAssets,
              renderedHtml: this.applyImageAssetStates(rendered.baseHtml, erroredAssets),
            }
          : state,
      )
    } finally {
      if (this.imageResolutionController === controller) {
        this.imageResolutionController = null
      }
    }
  }

  private updateReadyState(updater: (state: MarkdownPreviewReadyState) => MarkdownPreviewReadyState): void {
    const state = this.state()
    if (state.kind !== 'ready') {
      return
    }

    this.state.set(updater(state))
  }

  private clearRenderTimer(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer)
      this.renderTimer = null
    }
  }

  private abortCurrentOperation(): void {
    this.operationToken += 1
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  private abortImageResolution(): void {
    this.imageResolutionToken += 1
    if (this.imageResolutionController) {
      this.imageResolutionController.abort()
      this.imageResolutionController = null
    }
  }

  private abortAttachmentUpload(): void {
    this.attachmentUploadToken += 1
    if (this.attachmentUploadController) {
      this.attachmentUploadController.abort()
      this.attachmentUploadController = null
    }
    this.imageAttaching.set(false)
    this.pendingImageInsertionSelection.set(null)
  }

  private clearImageAssets(): void {
    this.abortImageResolution()
    for (const resolution of this.imageAssetResolutions.values()) {
      this.imageAssetService.releaseResolution(resolution)
    }
    this.imageAssetResolutions.clear()
  }

  private getAttachmentFolderPath(settings: SessionSettings): string | null {
    const normalized = normalizeMarkdownAttachmentFolderPath(settings.markdown_attachment_folder_path)
    return normalized.ok ? normalized.path : null
  }

  private getAttachmentUploadErrorKey(error: unknown): MarkdownErrorKey {
    if (error instanceof MarkdownImageAssetError) {
      if (
        error.code === 'ATTACHMENT_FOLDER_INVALID' ||
        error.code === 'ATTACHMENT_FOLDER_CONFLICT'
      ) {
        return 'markdown:error:attachment-folder-invalid'
      }
      if (error.code === 'ATTACHMENT_NOT_IMAGE') {
        return 'markdown:error:attachment-not-image'
      }
    }

    return 'markdown:error:attachment-upload-failed'
  }

  private setReadyError(errorKey: MarkdownErrorKey): void {
    this.updateReadyState((state) => ({
      ...state,
      errorKey,
    }))
  }

  private insertMarkdownAtSelection(
    source: string,
    markdown: string,
    selection: MarkdownImageInsertionSelection,
  ): InsertMarkdownResult {
    const start = this.clampSourceOffset(source, selection.selectionStart)
    const end = this.clampSourceOffset(source, selection.selectionEnd)
    const selectionStart = Math.min(start, end)
    const selectionEnd = Math.max(start, end)
    const prefix = selectionStart > 0 && source[selectionStart - 1] !== '\n' ? '\n' : ''
    const suffix = selectionEnd < source.length && source[selectionEnd] !== '\n' ? '\n' : ''
    const insertion = `${prefix}${markdown}${suffix}`

    return {
      source: `${source.slice(0, selectionStart)}${insertion}${source.slice(selectionEnd)}`,
      selectionStart: selectionStart + insertion.length,
    }
  }

  private insertTextAtSelection(
    source: string,
    text: string,
    selection: MarkdownImageInsertionSelection,
  ): InsertMarkdownResult {
    const start = this.clampSourceOffset(source, selection.selectionStart)
    const end = this.clampSourceOffset(source, selection.selectionEnd)
    const selectionStart = Math.min(start, end)
    const selectionEnd = Math.max(start, end)

    return {
      source: `${source.slice(0, selectionStart)}${text}${source.slice(selectionEnd)}`,
      selectionStart: selectionStart + text.length,
    }
  }

  private clampSourceOffset(source: string, value: number): number {
    return Number.isFinite(value) ? Math.min(source.length, Math.max(0, Math.floor(value))) : source.length
  }

  private getLastKnownEditorSelection(
    state: MarkdownPreviewReadyState,
  ): MarkdownImageInsertionSelection {
    return (
      this.lastImageInsertionSelection() ?? {
        selectionStart: state.source.length,
        selectionEnd: state.source.length,
      }
    )
  }

  private normalizeImageInsertionSelection(
    selection: MarkdownImageInsertionSelection,
    sourceLength: number,
  ): MarkdownImageInsertionSelection {
    const selectionStart = this.clampSourceOffsetByLength(sourceLength, selection.selectionStart)
    const selectionEnd = this.clampSourceOffsetByLength(sourceLength, selection.selectionEnd)

    return {
      selectionStart: Math.min(selectionStart, selectionEnd),
      selectionEnd: Math.max(selectionStart, selectionEnd),
    }
  }

  private clampSourceOffsetByLength(sourceLength: number, value: number): number {
    return Number.isFinite(value) ? Math.min(sourceLength, Math.max(0, Math.floor(value))) : sourceLength
  }

  private resetImageInsertionSelection(): void {
    this.lastImageInsertionSelection.set(null)
    this.pendingImageInsertionSelection.set(null)
    this.imageAttaching.set(false)
  }

  private boundedStack(stack: string[]): string[] {
    return stack.length <= this.maxHistoryLength
      ? stack
      : stack.slice(stack.length - this.maxHistoryLength)
  }

  private recordHistoryForSourceChange(previousSource: string, origin: MarkdownHistoryOrigin): void {
    const history = this.historyState()
    const now = this.now()
    const shouldStartGroup =
      origin === 'format' ||
      history.activeGroupStartedAt === null ||
      now - history.activeGroupStartedAt > this.historyGroupMs

    if (!shouldStartGroup) {
      this.historyState.set({...history, redoStack: []})
      return
    }

    this.historyState.set({
      undoStack: this.boundedStack([...history.undoStack, previousSource]),
      redoStack: [],
      activeGroupStartedAt: origin === 'user' ? now : null,
    })
  }

  undo(): boolean {
    const state = this.state()
    const history = this.historyState()
    const previousSource = history.undoStack.at(-1)
    if (state.kind !== 'ready' || previousSource === undefined) {
      return false
    }

    this.historyState.set({
      undoStack: history.undoStack.slice(0, -1),
      redoStack: this.boundedStack([...history.redoStack, state.source]),
      activeGroupStartedAt: null,
    })
    this.applyHistorySource(previousSource)
    return true
  }

  redo(): boolean {
    const state = this.state()
    const history = this.historyState()
    const nextSource = history.redoStack.at(-1)
    if (state.kind !== 'ready' || nextSource === undefined) {
      return false
    }

    this.historyState.set({
      undoStack: this.boundedStack([...history.undoStack, state.source]),
      redoStack: history.redoStack.slice(0, -1),
      activeGroupStartedAt: null,
    })
    this.applyHistorySource(nextSource)
    return true
  }

  private applyHistorySource(source: string): void {
    const state = this.state()
    if (state.kind !== 'ready' || state.source === source) {
      return
    }

    this.state.set({
      ...state,
      source,
      dirty: source !== state.baseline,
      errorKey: state.stale ? state.errorKey : null,
    })
    this.scheduleRender()
    this.scheduleAutosaveForCurrentSource()
  }

  private resetHistory(): void {
    this.historyState.set({
      undoStack: [],
      redoStack: [],
      activeGroupStartedAt: null,
    })
  }

  private canStartAutosave(state: MarkdownPreviewReadyState): boolean {
    return (
      state.dirty &&
      !state.saving &&
      !state.formatting &&
      !state.stale &&
      !state.readOnlyReasonKey &&
      state.baselineSourceRevision !== null
    )
  }

  private scheduleAutosaveForCurrentSource(): void {
    this.scheduleAutosave('source-change')
  }

  private scheduleAutosave(_reason: 'source-change' | 'trailing-save'): void {
    this.clearAutosaveTimer()
    const state = this.state()
    if (state.kind !== 'ready' || !this.canStartAutosave(state)) {
      return
    }

    this.setAutosavePending(true)
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null
      void this.runAutosave()
    }, this.autosaveDebounceMs)
  }

  private async runAutosave(): Promise<void> {
    this.setAutosavePending(false)
    const state = this.state()
    if (state.kind !== 'ready' || !this.canStartAutosave(state)) {
      return
    }

    this.updateReadyState((current) => ({
      ...current,
      lastAutosaveAttemptAt: this.now(),
    }))
    await this.saveWithConflictMode('autosave', 'fail_if_stale')
  }

  private setAutosavePending(next: boolean): void {
    this.updateReadyState((state) =>
      state.autosavePending === next ? state : {...state, autosavePending: next},
    )
  }

  private clearAutosaveTimer(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer)
      this.autosaveTimer = null
    }
    this.setAutosavePending(false)
  }
}

export const markdownPreviewModel = new MarkdownPreviewModel()
