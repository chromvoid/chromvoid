import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVMenuButton} from '@chromvoid/uikit/components/cv-menu-button'
import {CVMenuItem} from '@chromvoid/uikit/components/cv-menu-item'
import {css, nothing} from 'lit'
import {unsafeHTML} from 'lit/directives/unsafe-html.js'

import {i18n} from 'root/i18n'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
import {transientBackModel} from 'root/shared/services/transient-back.model'

import type {FilePreviewFallbackReasonKey} from './file-preview.model'
import {markdownDocumentRenameModel} from '../models/markdown-document-rename.model'
import {
  markdownPreviewModel,
  type MarkdownPreviewData,
  type MarkdownImageInsertionSelection,
  type MarkdownPreviewMode,
  type MarkdownPreviewReadyState,
} from '../models/markdown-preview.model'

type MarkdownFallbackCopyKey =
  | FilePreviewFallbackReasonKey
  | 'markdown:fallback:text-too-large'
  | 'markdown:fallback:text-invalid-encoding'

const PREVIEW_DOUBLE_TAP_MS = 320
const PREVIEW_DOUBLE_TAP_DISTANCE = 24
const PREVIEW_TAP_MAX_MS = 260
const PREVIEW_TAP_MOVE_GUARD = 12

type PreviewTapState = {
  pointerId: number | null
  sourceBlock: HTMLElement | null
  startX: number
  startY: number
  time: number
}

type PreviewTapRecord = {
  sourceBlock: HTMLElement | null
  time: number
  x: number
  y: number
}

type TouchGeneratedMouseEvent = MouseEvent & {
  sourceCapabilities?: {
    firesTouchEvents?: boolean
  } | null
}

type Point = {
  x: number
  y: number
}

type DocumentWithCaretFromPoint = Document & {
  caretPositionFromPoint?: (
    x: number,
    y: number,
  ) => {offsetNode: Node; offset: number} | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

type TextNeedle = {
  value: string
  start: number
  offsetInNeedle: number
}

type RenderedTextOffsetCandidate = {
  offset: number
  distance: number
}

type VisibleTextStream = {
  text: string
  offsets: number[]
}

type SelectionRoot = DocumentFragment & {
  getSelection?: () => Selection | null
}

const IMAGE_FILE_NAME_PATTERN = /\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/i

export class MarkdownPreview extends ReatomLitElement {
  static define() {
    CVBottomSheet.define()
    CVMenuButton.define()
    CVMenuItem.define()
    if (!customElements.get('markdown-preview')) {
      customElements.define('markdown-preview', this as unknown as CustomElementConstructor)
    }
  }

  static get properties() {
    return {
      data: {type: Object},
    }
  }

  declare data: MarkdownPreviewData | null
  private unregisterTransientBack?: () => void
  private unregisterImagePickerTrigger?: () => void
  private previewTap: PreviewTapState | null = null
  private lastPreviewTap: PreviewTapRecord | null = null
  private lastEditorFocusRequestId = 0

  static styles = [
    css`
      :host {
        display: block;
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 0;
        color: var(--cv-color-text);
        --markdown-editor-keyboard-clearance: var(--mobile-keyboard-scroll-clearance, 0px);
      }

      .markdown-preview {
        box-sizing: border-box;
        position: relative;
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 0;
        display: flex;
        flex-direction: column;
        gap: var(--app-spacing-4);
      }

      .toolbar {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-spacing-3);
        flex-wrap: wrap;
      }

      .mode-control,
      .action-group {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
      }

      .action-group {
        flex-wrap: wrap;
      }

      .mode-control {
        padding: 3px;
        border-radius: var(--cv-radius-3);
        border: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-secondary-glass);
      }

      .mode-button,
      .action-button {
        min-block-size: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--app-spacing-2);
        border: 1px solid transparent;
        border-radius: var(--cv-radius-2);
        color: var(--cv-color-text);
        font: inherit;
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
        cursor: pointer;
      }

      .mode-button {
        padding: 0 var(--app-spacing-3);
        background: transparent;
        color: var(--cv-color-text-muted);
      }

      .mode-button[aria-pressed='true'] {
        background: var(--cv-color-accent-surface);
        color: var(--cv-color-accent);
        border-color: var(--cv-color-accent-border);
      }

      .action-button {
        padding: 0 var(--app-spacing-4);
        background: var(--cv-color-surface-tertiary-glass);
        border-color: var(--cv-color-border-muted);
      }

      .action-button.primary {
        background: var(--cv-color-accent-surface);
        border-color: var(--cv-color-accent-border);
        color: var(--cv-color-accent);
      }

      .action-button.warning {
        color: var(--cv-color-warning);
        border-color: var(--cv-color-warning-border, var(--cv-color-border-muted));
        background: var(--cv-color-warning-surface, var(--cv-color-surface-tertiary-glass));
      }

      .mode-button:focus-visible,
      .action-button:focus-visible,
      .source-editor:focus-visible {
        outline: 2px solid var(--cv-color-accent);
        outline-offset: 2px;
      }

      .mode-button:disabled,
      .action-button:disabled {
        opacity: 0.55;
        cursor: default;
      }

      .markdown-status-block {
        display: grid;
        gap: var(--app-spacing-2);
      }

      .markdown-status-row {
        display: flex;
        align-items: flex-start;
        gap: var(--app-spacing-2);
      }

      cv-callout.markdown-status-callout {
        --cv-callout-compact-padding-inline: var(--app-spacing-4);
        --cv-callout-compact-border-radius: var(--cv-radius-3);
        flex: 1 1 auto;
        min-inline-size: 0;
        line-height: 1.5;
      }

      cv-callout.markdown-status-callout::part(icon) {
        margin-block-start: 2px;
      }

      cv-callout.markdown-status-callout::part(message) {
        min-inline-size: 0;
      }

      .markdown-status-body {
        display: grid;
        gap: var(--app-spacing-1);
        min-inline-size: 0;
      }

      .content {
        box-sizing: border-box;
        flex: 1;
        min-block-size: 0;
        display: grid;
        overflow: hidden;
        padding-block-end: var(--markdown-editor-keyboard-clearance);
      }

      .rendered-markdown,
      .source-editor {
        box-sizing: border-box;
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 320px;
        min-inline-size: 0;
        border-radius: var(--cv-radius-3);
        border: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-secondary-glass);
      }

      .rendered-markdown {
        padding: var(--app-spacing-5);
        overflow: auto;
        font-size: var(--cv-font-size-base);
        line-height: 1.7;
        color: var(--cv-color-text);
        overflow-wrap: anywhere;
      }

      .rendered-markdown > :first-child {
        margin-block-start: 0;
      }

      .rendered-markdown > :last-child {
        margin-block-end: 0;
      }

      .rendered-markdown :is(h1, h2, h3, h4, h5, h6) {
        margin: var(--app-spacing-6) 0 var(--app-spacing-3);
        color: var(--cv-color-text-strong);
        font-weight: var(--cv-font-weight-semibold);
        line-height: 1.25;
        letter-spacing: 0;
      }

      .rendered-markdown h1 {
        font-size: var(--cv-font-size-2xl);
        padding-block-end: var(--app-spacing-3);
        border-block-end: 1px solid var(--cv-color-border-faint);
      }

      .rendered-markdown h2 {
        font-size: var(--cv-font-size-xl);
        padding-block-end: var(--app-spacing-2);
        border-block-end: 1px solid var(--cv-color-border-faint);
      }

      .rendered-markdown h3 {
        font-size: var(--cv-font-size-lg);
      }

      .rendered-markdown :is(h4, h5, h6) {
        font-size: var(--cv-font-size-base);
        color: var(--cv-color-text);
      }

      .rendered-markdown :is(p, ul, ol, pre, blockquote, table, hr, img) {
        margin: 0 0 var(--app-spacing-5);
      }

      .rendered-markdown .cv-markdown-image {
        box-sizing: border-box;
        display: grid;
        place-items: center;
        max-inline-size: 100%;
        min-block-size: 72px;
        margin: 0 0 var(--app-spacing-5);
        padding: var(--app-spacing-3) var(--app-spacing-4);
        border: 1px dashed var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface);
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-sm);
        line-height: 1.45;
        overflow-wrap: anywhere;
      }

      .rendered-markdown img.cv-markdown-image {
        display: block;
        min-block-size: 0;
        padding: 0;
        border-style: solid;
      }

      .rendered-markdown .cv-markdown-image--loaded {
        color: inherit;
      }

      .rendered-markdown .cv-markdown-image--blocked,
      .rendered-markdown .cv-markdown-image--unsupported {
        border-color: var(--cv-color-warning-border, var(--cv-color-border-muted));
        background: var(--cv-color-warning-surface, var(--cv-color-surface-tertiary-glass));
        color: var(--cv-color-warning, var(--cv-color-text-muted));
      }

      .rendered-markdown .cv-markdown-image--missing,
      .rendered-markdown .cv-markdown-image--error {
        border-color: var(--cv-color-danger-border, var(--cv-color-border-muted));
        background: var(--cv-color-danger-surface, var(--cv-color-surface-tertiary-glass));
        color: var(--cv-color-danger, var(--cv-color-text-muted));
      }

      .rendered-markdown :is(ul, ol) {
        padding-inline-start: var(--app-spacing-5);
      }

      .rendered-markdown li + li {
        margin-block-start: var(--app-spacing-1);
      }

      .rendered-markdown li > :is(ul, ol) {
        margin-block: var(--app-spacing-2) 0;
      }

      .rendered-markdown a {
        color: var(--cv-color-accent);
        text-decoration: underline;
        text-underline-offset: 3px;
        cursor: default;
      }

      .rendered-markdown :is(strong, b) {
        color: var(--cv-color-text-strong);
        font-weight: var(--cv-font-weight-semibold);
      }

      .rendered-markdown blockquote {
        padding: var(--app-spacing-3) var(--app-spacing-4);
        border-inline-start: 3px solid var(--cv-color-accent-border-strong);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-tertiary-glass);
        color: var(--cv-color-text-muted);
      }

      .rendered-markdown blockquote > :last-child {
        margin-block-end: 0;
      }

      .rendered-markdown code {
        font-family: var(
          --cv-font-family-code,
          ui-monospace,
          SFMono-Regular,
          Menlo,
          Monaco,
          Consolas,
          'Liberation Mono',
          monospace
        );
        font-size: 0.92em;
        color: var(--cv-color-accent);
      }

      .rendered-markdown :not(pre) > code {
        padding: 0.12em 0.34em;
        border: 1px solid var(--cv-color-border-faint);
        border-radius: var(--cv-radius-1);
        background: var(--cv-color-surface-tertiary-glass);
        white-space: break-spaces;
      }

      .rendered-markdown pre {
        overflow: auto;
        padding: var(--app-spacing-4);
        border-radius: var(--cv-radius-2);
        border: 1px solid var(--cv-color-border-faint);
        background: var(--cv-color-surface);
        box-shadow: inset 0 1px 0 var(--cv-alpha-white-5);
      }

      .rendered-markdown pre code {
        color: var(--cv-color-text);
        white-space: pre;
      }

      .rendered-markdown table {
        display: block;
        inline-size: max-content;
        max-inline-size: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        border-spacing: 0;
        border-collapse: separate;
        background: var(--cv-color-surface-secondary-glass-soft);
        white-space: nowrap;
      }

      .rendered-markdown table::-webkit-scrollbar {
        block-size: 10px;
      }

      .rendered-markdown table::-webkit-scrollbar-thumb {
        border: 3px solid transparent;
        border-radius: var(--cv-radius-pill);
        background: var(--cv-color-border-muted);
        background-clip: padding-box;
      }

      .rendered-markdown :is(th, td) {
        min-inline-size: min(18rem, 56vw);
        padding: var(--app-spacing-3) var(--app-spacing-4);
        border-inline-end: 1px solid var(--cv-color-border-faint);
        border-block-end: 1px solid var(--cv-color-border-faint);
        text-align: start;
        vertical-align: top;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .rendered-markdown :is(th, td)[data-align='center'] {
        text-align: center;
      }

      .rendered-markdown :is(th, td)[data-align='right'] {
        text-align: end;
      }

      .rendered-markdown th {
        position: sticky;
        inset-block-start: 0;
        z-index: 1;
        background: var(--cv-color-surface-secondary-glass-strong);
        color: var(--cv-color-text-strong);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
      }

      .rendered-markdown tbody tr:nth-child(even) td {
        background: var(--cv-color-surface-glass-subtle);
      }

      .rendered-markdown tbody tr:hover td {
        background: var(--cv-color-surface-highlight);
      }

      .rendered-markdown tr:last-child td {
        border-block-end: 0;
      }

      .rendered-markdown :is(th, td):last-child {
        border-inline-end: 0;
      }

      .rendered-markdown :is(td, th) > :last-child {
        margin-block-end: 0;
      }

      .rendered-markdown hr {
        border: 0;
        border-block-start: 1px solid var(--cv-color-border-faint);
      }

      .rendered-markdown img {
        display: block;
        max-inline-size: 100%;
        block-size: auto;
        border-radius: var(--cv-radius-2);
        border: 1px solid var(--cv-color-border-faint);
        background: var(--cv-color-surface);
      }

      .rendered-markdown kbd {
        padding: 0.12em 0.42em;
        border: 1px solid var(--cv-color-border-muted);
        border-block-end-color: var(--cv-color-border-strong);
        border-radius: var(--cv-radius-1);
        background: var(--cv-color-surface-tertiary-glass);
        color: var(--cv-color-text-strong);
        font: 600 0.85em / 1.4 var(--cv-font-family-code);
      }

      .source-editor {
        display: block;
        resize: none;
        overflow: auto;
        padding: var(--app-spacing-4);
        color: var(--cv-color-text);
        caret-color: var(--cv-color-accent);
        font: 500 var(--cv-font-size-sm) / 1.65
          var(
            --cv-font-family-code,
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            'Liberation Mono',
            monospace
          );
        outline: none;
      }

      .source-editor::placeholder {
        color: var(--cv-color-text-muted);
      }

      .loading,
      .fallback {
        flex: 1;
        min-block-size: 0;
        display: grid;
        place-items: center;
        gap: var(--app-spacing-3);
        color: var(--cv-color-text-muted);
      }

      .dirty-sheet-body {
        display: grid;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-4);
        padding-block-end: max(var(--app-spacing-4), env(safe-area-inset-bottom));
      }

      .dirty-title {
        font-size: var(--cv-font-size-lg);
        font-weight: var(--cv-font-weight-semibold);
      }

      .dirty-copy {
        color: var(--cv-color-text-muted);
        line-height: 1.5;
      }

      .dirty-actions {
        display: grid;
        gap: var(--app-spacing-2);
      }

      .dirty-actions .action-button {
        inline-size: 100%;
        min-block-size: 44px;
      }

      .stale-overflow {
        --cv-menu-button-min-height: 36px;
        flex: 0 0 auto;
        margin-inline-start: auto;
      }

      .stale-overflow::part(trigger) {
        inline-size: 36px;
        block-size: 36px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--cv-color-text);
        cursor: pointer;
      }

      .stale-overflow::part(trigger):hover {
        background: var(--cv-color-surface-tertiary-glass);
      }

      .stale-overflow::part(label),
      .stale-overflow::part(suffix),
      .stale-overflow::part(dropdown-icon) {
        display: none;
      }

      .stale-overflow::part(prefix) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .overflow-menu-item::part(base) {
        gap: 10px;
        padding: 10px 12px;
      }

      .fab-edit {
        display: none;
      }

      .image-input {
        display: none;
      }

      @media (max-width: 720px) {
        .markdown-preview {
          --markdown-preview-fab-size: 56px;
          --markdown-preview-fab-inset-block-end: max(16px, env(safe-area-inset-bottom));
          --markdown-preview-fab-clearance: calc(
            var(--markdown-preview-fab-size) + var(--markdown-preview-fab-inset-block-end) +
              var(--app-spacing-4)
          );
          gap: var(--app-spacing-3);
        }

        .toolbar {
          align-items: stretch;
          justify-content: stretch;
          flex-wrap: nowrap;
          gap: 0;
          padding-inline: 16px;
        }

        .mode-control {
          flex: 1 1 auto;
          inline-size: 100%;
          display: flex;
          box-sizing: border-box;
        }

        .mode-button {
          flex: 1 1 0;
          min-block-size: 40px;
          padding: 0 var(--app-spacing-3);
        }

        .toolbar-actions {
          flex: 0 0 auto;
          display: inline-flex;
          margin-inline-start: var(--app-spacing-2);
        }

        .toolbar-actions .action-button:not(.insert-image-action) {
          display: none;
        }

        .insert-image-action {
          inline-size: 40px;
          padding: 0;
        }

        .insert-image-action span {
          display: none;
        }

        .fab-edit {
          position: absolute;
          inset-inline-end: 16px;
          inset-block-end: var(--markdown-preview-fab-inset-block-end);
          inline-size: var(--markdown-preview-fab-size);
          block-size: var(--markdown-preview-fab-size);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--cv-color-accent-border);
          border-radius: 999px;
          background:
            linear-gradient(
              135deg,
              var(--cv-color-accent-surface-strong),
              var(--cv-color-accent-surface)
            ),
            var(--cv-color-surface-elevated, var(--cv-color-surface));
          color: var(--cv-color-accent);
          cursor: pointer;
          z-index: 4;
          box-shadow:
            0 8px 24px var(--cv-alpha-black-35),
            0 0 0 6px var(--cv-color-surface-elevated, var(--cv-color-surface));
        }

        .fab-edit:active {
          transform: scale(0.96);
        }

        .fab-edit:focus-visible {
          outline: 2px solid var(--cv-color-accent);
          outline-offset: 2px;
        }

        .fab-edit cv-icon {
          font-size: 22px;
        }

        .rendered-markdown,
        .source-editor {
          border: 0;
          border-radius: 0;
          background: transparent;
          min-block-size: 0;
        }


        .rendered-markdown {
          padding: var(--app-spacing-2) var(--app-spacing-4) var(--markdown-preview-fab-clearance);
          scroll-padding-block-end: var(--markdown-preview-fab-clearance);
        }

        .source-editor {
          padding: var(--app-spacing-2) var(--app-spacing-4)
            calc(var(--app-spacing-2) + 1.6em);
          font-size: var(--cv-font-size-base);
          line-height: 1.6;
          scroll-padding-block-end: max(
            var(--markdown-editor-keyboard-clearance),
            calc(var(--app-spacing-2) + 1.6em)
          );
        }

        .stale-actions {
          inline-size: 100%;
        }

        .stale-actions .action-button {
          flex: 1;
          min-block-size: 44px;
        }
      }
    `,
  ]

  constructor() {
    super()
    this.data = null
  }

  connectedCallback() {
    super.connectedCallback()
    this.unregisterTransientBack = transientBackModel.register(() => this.consumeBack(), {priority: 70})
    this.unregisterImagePickerTrigger = markdownPreviewModel.registerImagePickerTrigger(() => {
      this.openImagePicker()
    })
    markdownPreviewModel.setPreview(this.data)
  }

  disconnectedCallback() {
    this.previewTap = null
    this.lastPreviewTap = null
    this.unregisterTransientBack?.()
    this.unregisterTransientBack = undefined
    this.unregisterImagePickerTrigger?.()
    this.unregisterImagePickerTrigger = undefined
    markdownPreviewModel.cleanup()
    super.disconnectedCallback()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (changedProperties.has('data')) {
      markdownPreviewModel.setPreview(this.data)
    }
    this.applyEditorFocusRequest()
  }

  private handlePreviewModeClick() {
    markdownPreviewModel.setMode('preview')
  }

  private handleEditModeClick() {
    markdownPreviewModel.setMode('edit')
  }

  private handleUndoClick() {
    markdownPreviewModel.undo()
  }

  private handleRedoClick() {
    markdownPreviewModel.redo()
  }

  private handleFormatClick() {
    void markdownPreviewModel.formatDocument()
  }

  private handleRenameClick() {
    void markdownDocumentRenameModel.openRenameDialog(this.data)
  }

  private handleInsertImageClick() {
    markdownPreviewModel.requestImagePicker(this.getCurrentEditorSelection())
  }

  private handleReloadClick() {
    void markdownPreviewModel.reload()
  }

  private handleOverwriteClick() {
    void markdownPreviewModel.overwriteStale()
  }

  private handleStaleCancelClick() {
    markdownPreviewModel.cancelStale()
  }

  private handleStaleOverflow(event: CustomEvent<{value: string | null; open: boolean}>) {
    const menu = event.currentTarget as HTMLElementTagNameMap['cv-menu-button']
    if (event.detail.open) {
      menu.value = ''
      for (const item of menu.querySelectorAll<HTMLElementTagNameMap['cv-menu-item']>('cv-menu-item')) {
        item.selected = false
        item.active = false
      }
      return
    }
    const value = event.detail.value
    menu.open = false
    menu.value = ''
    for (const item of menu.querySelectorAll<HTMLElementTagNameMap['cv-menu-item']>('cv-menu-item')) {
      item.selected = false
      item.active = false
    }
    if (value === 'overwrite') {
      void markdownPreviewModel.overwriteStale()
    } else if (value === 'cancel') {
      markdownPreviewModel.cancelStale()
    }
  }

  private handleDirtySaveClick() {
    void markdownPreviewModel.savePendingCloseIntent()
  }

  private handleDirtyDiscardClick() {
    markdownPreviewModel.discardPendingCloseIntent()
  }

  private handleDirtyCancelClick() {
    markdownPreviewModel.cancelPendingCloseIntent()
  }

  private handleDirtySheetChange(event: CustomEvent<{open: boolean}>) {
    if (event.detail.open === false && markdownPreviewModel.pendingCloseIntent()) {
      markdownPreviewModel.cancelPendingCloseIntent()
    }
  }

  private consumeBack(): boolean {
    if (!markdownPreviewModel.pendingCloseIntent()) {
      return false
    }

    markdownPreviewModel.cancelPendingCloseIntent()
    return true
  }

  private handleSourceInput(event: InputEvent) {
    const target = event.currentTarget as HTMLTextAreaElement
    markdownPreviewModel.updateSource(target.value)
    this.updateEditorSelectionFromTarget(target)
  }

  private handleSourceSelection(event: Event) {
    this.updateEditorSelectionFromTarget(event.currentTarget)
  }

  private handleSourcePaste(event: ClipboardEvent) {
    const files = this.getImageFiles(event.clipboardData?.files)
    if (files.length === 0) {
      return
    }

    event.preventDefault()
    const editor = event.currentTarget as HTMLTextAreaElement
    void markdownPreviewModel.insertImageFiles(files, {
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
    })
  }

  private handleSourceDrop(event: DragEvent) {
    const files = this.getImageFiles(event.dataTransfer?.files)
    if (files.length === 0) {
      return
    }

    event.preventDefault()
    const editor = event.currentTarget as HTMLTextAreaElement
    void markdownPreviewModel.insertImageFiles(files, {
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
    })
  }

  private handleSourceDragOver(event: DragEvent) {
    if (this.hasImageFile(event.dataTransfer?.items)) {
      event.preventDefault()
    }
  }

  private handleImageInputChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const files = this.getImageFiles(input.files)
    if (files.length > 0) {
      void markdownPreviewModel.insertImageFiles(files, markdownPreviewModel.getImageInsertionSelection())
    }
    input.value = ''
  }

  private openImagePicker() {
    const input = this.renderRoot.querySelector<HTMLInputElement>('.image-input')
    if (!input) {
      return
    }

    input.value = ''
    input.click()
  }

  private getCurrentEditorSelection(): MarkdownImageInsertionSelection | undefined {
    const editor = this.renderRoot.querySelector<HTMLTextAreaElement>('.source-editor')
    if (!editor) {
      return undefined
    }

    return {
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
    }
  }

  private updateEditorSelectionFromTarget(target: EventTarget | null): void {
    if (!(target instanceof HTMLTextAreaElement)) {
      return
    }

    markdownPreviewModel.updateEditorSelection({
      selectionStart: target.selectionStart,
      selectionEnd: target.selectionEnd,
    })
  }

  private handlePreviewClick(event: MouseEvent) {
    markdownPreviewModel.handleRenderedPreviewClick(event)
  }

  private getImageFiles(files: FileList | readonly File[] | null | undefined): File[] {
    return Array.from(files ?? []).filter((file) => this.isImageFile(file))
  }

  private hasImageFile(items: DataTransferItemList | null | undefined): boolean {
    return Array.from(items ?? []).some(
      (item) => item.kind === 'file' && (!item.type || item.type.startsWith('image/')),
    )
  }

  private isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || IMAGE_FILE_NAME_PATTERN.test(file.name)
  }

  private handlePreviewDoubleClick(event: MouseEvent) {
    if (!this.isTouchGeneratedMouseEvent(event)) {
      return
    }

    this.previewTap = null
    this.lastPreviewTap = null
    this.commitPreviewDoubleTap(
      event,
      {x: event.clientX, y: event.clientY},
      this.findSourceBlock(event, event.clientX, event.clientY),
    )
  }

  private handlePreviewPointerDown(event: PointerEvent) {
    if (event.pointerType !== 'touch') {
      return
    }

    this.startPreviewTap(event, {x: event.clientX, y: event.clientY}, event.pointerId)
  }

  private handlePreviewPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'touch') {
      return
    }

    this.movePreviewTap({x: event.clientX, y: event.clientY}, event.pointerId)
  }

  private handlePreviewPointerEnd(event: PointerEvent) {
    if (event.pointerType !== 'touch') {
      return
    }

    this.endPreviewTap(event, {x: event.clientX, y: event.clientY}, event.pointerId)
  }

  private handlePreviewTouchStart(event: TouchEvent) {
    const touch = event.touches[0]
    if (!touch) {
      return
    }

    this.startPreviewTap(event, {x: touch.clientX, y: touch.clientY}, null)
  }

  private handlePreviewTouchMove(event: TouchEvent) {
    const touch = event.touches[0]
    if (!touch) {
      return
    }

    this.movePreviewTap({x: touch.clientX, y: touch.clientY}, null)
  }

  private handlePreviewTouchEnd(event: TouchEvent) {
    const touch = event.changedTouches[0]
    if (!touch) {
      return
    }

    this.endPreviewTap(event, {x: touch.clientX, y: touch.clientY}, null)
  }

  private startPreviewTap(event: Event, point: Point, pointerId: number | null): void {
    const state = markdownPreviewModel.state()
    if (
      state.kind !== 'ready' ||
      state.mode !== 'preview' ||
      state.readOnlyReasonKey ||
      state.errorKey
    ) {
      return
    }

    const sourceBlock = this.findSourceBlock(event, point.x, point.y)
    const time = Date.now()
    if (this.isPreviewDoubleTapCandidate(sourceBlock, point, time)) {
      this.preventPreviewDefault(event)
      this.clearPreviewSelection()
    }

    this.previewTap = {
      pointerId,
      sourceBlock,
      startX: point.x,
      startY: point.y,
      time,
    }
  }

  private movePreviewTap(point: Point, pointerId: number | null): void {
    const current = this.previewTap
    if (!current || (current.pointerId !== null && pointerId !== current.pointerId)) {
      return
    }

    const deltaX = Math.abs(point.x - current.startX)
    const deltaY = Math.abs(point.y - current.startY)
    if (deltaX > PREVIEW_TAP_MOVE_GUARD || deltaY > PREVIEW_TAP_MOVE_GUARD) {
      this.previewTap = null
    }
  }

  private endPreviewTap(event: Event, point: Point, pointerId: number | null): void {
    const current = this.previewTap
    if (!current || (current.pointerId !== null && pointerId !== current.pointerId)) {
      return
    }

    this.previewTap = null
    const deltaX = Math.abs(point.x - current.startX)
    const deltaY = Math.abs(point.y - current.startY)
    if (deltaX > PREVIEW_TAP_MOVE_GUARD || deltaY > PREVIEW_TAP_MOVE_GUARD) {
      this.lastPreviewTap = null
      return
    }

    const now = Date.now()
    if (now - current.time > PREVIEW_TAP_MAX_MS) {
      this.lastPreviewTap = null
      return
    }

    const previousTap = this.lastPreviewTap
    const doubleTap =
      Boolean(previousTap) &&
      now - previousTap!.time <= PREVIEW_DOUBLE_TAP_MS &&
      previousTap!.sourceBlock === current.sourceBlock &&
      Math.hypot(point.x - previousTap!.x, point.y - previousTap!.y) <= PREVIEW_DOUBLE_TAP_DISTANCE

    this.lastPreviewTap = doubleTap
      ? null
      : {
          sourceBlock: current.sourceBlock,
          time: now,
          x: point.x,
          y: point.y,
        }

    if (!doubleTap) {
      return
    }

    this.commitPreviewDoubleTap(event, point, current.sourceBlock)
  }

  private isPreviewDoubleTapCandidate(
    sourceBlock: HTMLElement | null,
    point: Point,
    now: number,
  ): boolean {
    const previousTap = this.lastPreviewTap
    return (
      Boolean(previousTap) &&
      now - previousTap!.time <= PREVIEW_DOUBLE_TAP_MS &&
      previousTap!.sourceBlock === sourceBlock &&
      Math.hypot(point.x - previousTap!.x, point.y - previousTap!.y) <= PREVIEW_DOUBLE_TAP_DISTANCE
    )
  }

  private isTouchGeneratedMouseEvent(event: MouseEvent): boolean {
    return Boolean((event as TouchGeneratedMouseEvent).sourceCapabilities?.firesTouchEvents)
  }

  private preventPreviewDefault(event: Event): void {
    if (event.cancelable) {
      event.preventDefault()
    }
    event.stopPropagation()
  }

  private commitPreviewDoubleTap(event: Event, point: Point, sourceBlock: HTMLElement | null): void {
    const latestState = markdownPreviewModel.state()
    if (
      latestState.kind !== 'ready' ||
      latestState.mode !== 'preview' ||
      latestState.readOnlyReasonKey ||
      latestState.errorKey
    ) {
      return
    }

    this.preventPreviewDefault(event)

    const selectionStart = this.resolvePreviewSelectionStart(
      sourceBlock,
      event,
      point.x,
      point.y,
      latestState.source,
    )
    this.clearPreviewSelection()
    markdownPreviewModel.setMode('edit', {selectionStart})
  }

  private applyEditorFocusRequest(): void {
    const request = markdownPreviewModel.editorFocusRequest()
    if (!request || request.id === this.lastEditorFocusRequestId) {
      return
    }

    const editor = this.renderRoot.querySelector<HTMLTextAreaElement>('.source-editor')
    if (!editor) {
      return
    }

    this.lastEditorFocusRequestId = request.id
    this.applyEditorFocusSelection(editor, request.selectionStart)
    this.reapplyEditorFocusSelectionOnNextFrame(request.id, request.selectionStart)
  }

  private applyEditorFocusSelection(editor: HTMLTextAreaElement, selectionStart: number | null): void {
    editor.focus({preventScroll: true})
    if (selectionStart !== null) {
      const normalizedSelectionStart = Math.min(editor.value.length, Math.max(0, selectionStart))
      editor.setSelectionRange(normalizedSelectionStart, normalizedSelectionStart)
    }
  }

  private reapplyEditorFocusSelectionOnNextFrame(
    requestId: number,
    selectionStart: number | null,
  ): void {
    const requestAnimationFrame = this.ownerDocument.defaultView?.requestAnimationFrame
    if (!requestAnimationFrame) {
      return
    }

    requestAnimationFrame.call(this.ownerDocument.defaultView, () => {
      if (!this.isConnected || markdownPreviewModel.editorFocusRequest()?.id !== requestId) {
        return
      }

      const editor = this.renderRoot.querySelector<HTMLTextAreaElement>('.source-editor')
      if (editor) {
        this.applyEditorFocusSelection(editor, selectionStart)
      }
    })
  }

  private resolvePreviewSelectionStart(
    initialSourceBlock: HTMLElement | null,
    event: Event,
    clientX: number,
    clientY: number,
    source: string,
  ): number | null {
    const sourceBlock = initialSourceBlock ?? this.findSourceBlock(event, clientX, clientY)
    const sourceLines = sourceBlock ? this.readSourceLines(sourceBlock) : null
    if (!sourceBlock || !sourceLines) {
      return null
    }

    const fallbackOffset = this.getSourceLineFallbackOffset(source, sourceLines.start, sourceLines.end)
    const renderedText = sourceBlock.textContent ?? ''
    const sourceStart = this.getSourceOffsetForLine(source, sourceLines.start)
    const sourceEnd = this.getSourceOffsetForLine(source, sourceLines.end)
    const sourceSlice = source.slice(sourceStart, sourceEnd)
    const renderedOffset = this.getPreviewRenderedOffset(sourceBlock, clientX, clientY)
    const mappedSourceOffset =
      renderedOffset === null
        ? null
        : this.mapRenderedOffsetToMarkdownSourceOffset(sourceSlice, renderedText, renderedOffset)
    if (mappedSourceOffset !== null) {
      return sourceStart + mappedSourceOffset
    }

    const textNeedle = renderedOffset === null ? null : this.getTextNeedle(renderedText, renderedOffset)
    if (!textNeedle) {
      return fallbackOffset
    }

    const occurrenceIndex = this.countNeedleOccurrencesBefore(
      renderedText,
      textNeedle.value,
      textNeedle.start,
    )
    const sourceNeedleIndex = this.findNeedleOccurrence(sourceSlice, textNeedle.value, occurrenceIndex)
    if (sourceNeedleIndex === null) {
      return fallbackOffset
    }

    return sourceStart + sourceNeedleIndex + textNeedle.offsetInNeedle
  }

  private getPreviewRenderedOffset(element: HTMLElement, clientX: number, clientY: number): number | null {
    return (
      this.getSelectedPreviewRenderedOffset(element, clientX, clientY) ??
      this.getRenderedCaretOffset(element, clientX, clientY)
    )
  }

  private getSelectedPreviewRenderedOffset(
    element: HTMLElement,
    clientX: number,
    clientY: number,
  ): number | null {
    const selection = this.getPreviewSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null
    }

    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index)
      if (
        !this.isNodeInside(element, range.startContainer) ||
        !this.isNodeInside(element, range.endContainer) ||
        !this.rangeContainsPoint(range, clientX, clientY)
      ) {
        continue
      }

      const rangeStart = this.getTextOffsetWithin(element, range.startContainer, range.startOffset)
      const rangeEnd = this.getTextOffsetWithin(element, range.endContainer, range.endOffset)
      if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) {
        continue
      }

      return rangeStart + this.getSelectionOffsetInRange(range, rangeEnd - rangeStart, clientX, clientY)
    }

    return null
  }

  private getPreviewSelection(): Selection | null {
    const shadowSelection = (this.renderRoot as SelectionRoot).getSelection?.()
    if (shadowSelection?.rangeCount) {
      return shadowSelection
    }

    const documentSelection = this.ownerDocument.getSelection?.()
    return documentSelection?.rangeCount ? documentSelection : null
  }

  private clearPreviewSelection(): void {
    const shadowSelection = (this.renderRoot as SelectionRoot).getSelection?.()
    shadowSelection?.removeAllRanges()

    const documentSelection = this.ownerDocument.getSelection?.()
    if (documentSelection !== shadowSelection) {
      documentSelection?.removeAllRanges()
    }
  }

  private rangeContainsPoint(range: Range, clientX: number, clientY: number): boolean {
    if (typeof range.getClientRects !== 'function') {
      return true
    }

    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
    if (rects.length === 0) {
      return true
    }

    return rects.some(
      (rect) =>
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom,
    )
  }

  private getSelectionOffsetInRange(
    range: Range,
    rangeLength: number,
    clientX: number,
    clientY: number,
  ): number {
    if (typeof range.getClientRects !== 'function') {
      return 0
    }

    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
    const matchingRect = rects.find((rect) => clientY >= rect.top && clientY <= rect.bottom) ?? rects[0]
    if (!matchingRect) {
      return 0
    }

    const ratio = Math.min(1, Math.max(0, (clientX - matchingRect.left) / matchingRect.width))
    return Math.min(rangeLength, Math.max(0, Math.round(rangeLength * ratio)))
  }

  private mapRenderedOffsetToMarkdownSourceOffset(
    source: string,
    renderedText: string,
    renderedOffset: number,
  ): number | null {
    const renderedStream = this.buildVisibleTextStream(renderedText)
    const markdownStream = this.buildMarkdownVisibleTextStream(source)
    if (!renderedStream.text || renderedStream.text !== markdownStream.text) {
      return null
    }

    const visiblePosition = this.getVisiblePositionForTextOffset(renderedStream.offsets, renderedOffset)
    return this.getSourceOffsetForVisiblePosition(markdownStream.offsets, visiblePosition)
  }

  private buildVisibleTextStream(text: string): VisibleTextStream {
    const chars: string[] = []
    const offsets: number[] = []

    for (let index = 0; index < text.length; index += 1) {
      this.appendVisibleStreamChar(chars, offsets, text[index] ?? '', index)
    }

    return this.trimVisibleTextStream(chars, offsets)
  }

  private buildMarkdownVisibleTextStream(source: string): VisibleTextStream {
    const chars: string[] = []
    const offsets: number[] = []
    let lineStart = 0

    while (lineStart <= source.length) {
      const lineEndIndex = source.indexOf('\n', lineStart)
      const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex
      const contentStart = this.getMarkdownVisibleLineStart(source, lineStart, lineEnd)
      this.appendMarkdownInlineVisibleChars(source, contentStart, lineEnd, chars, offsets)

      if (lineEndIndex === -1) {
        break
      }

      this.appendVisibleStreamChar(chars, offsets, '\n', lineEndIndex)
      lineStart = lineEndIndex + 1
    }

    return this.trimVisibleTextStream(chars, offsets)
  }

  private getMarkdownVisibleLineStart(source: string, lineStart: number, lineEnd: number): number {
    let index = lineStart

    for (let blockquoteLevel = 0; blockquoteLevel < 8; blockquoteLevel += 1) {
      const quoteMatch = /^[ \t]{0,3}>[ \t]?/.exec(source.slice(index, lineEnd))
      if (!quoteMatch) {
        break
      }
      index += quoteMatch[0].length
    }

    const headingMatch = /^[ \t]{0,3}#{1,6}[ \t]+/.exec(source.slice(index, lineEnd))
    if (headingMatch) {
      return index + headingMatch[0].length
    }

    const listMatch = /^[ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]+/.exec(source.slice(index, lineEnd))
    if (listMatch) {
      index += listMatch[0].length
      const taskMatch = /^\[[ xX]\][ \t]+/.exec(source.slice(index, lineEnd))
      if (taskMatch) {
        index += taskMatch[0].length
      }
    }

    return index
  }

  private appendMarkdownInlineVisibleChars(
    source: string,
    start: number,
    end: number,
    chars: string[],
    offsets: number[],
  ): void {
    let index = start
    while (index < end) {
      const char = source[index] ?? ''
      const link = this.readMarkdownLink(source, index, end)
      if (link) {
        this.appendMarkdownInlineVisibleChars(source, link.labelStart, link.labelEnd, chars, offsets)
        index = link.end
        continue
      }

      if (char === '\\' && index + 1 < end) {
        this.appendVisibleStreamChar(chars, offsets, source[index + 1] ?? '', index + 1)
        index += 2
        continue
      }

      if (char === '`' || char === '*' || char === '_' || char === '~') {
        index += 1
        continue
      }

      this.appendVisibleStreamChar(chars, offsets, char, index)
      index += 1
    }
  }

  private readMarkdownLink(
    source: string,
    index: number,
    end: number,
  ): {labelStart: number; labelEnd: number; end: number} | null {
    const labelOpen = source[index] === '!' && source[index + 1] === '[' ? index + 1 : index
    if (source[labelOpen] !== '[') {
      return null
    }

    const labelEnd = source.indexOf(']', labelOpen + 1)
    if (labelEnd === -1 || labelEnd + 1 >= end || source[labelEnd + 1] !== '(') {
      return null
    }

    const linkEnd = source.indexOf(')', labelEnd + 2)
    if (linkEnd === -1 || linkEnd > end) {
      return null
    }

    return {
      labelStart: labelOpen + 1,
      labelEnd,
      end: linkEnd + 1,
    }
  }

  private appendVisibleStreamChar(
    chars: string[],
    offsets: number[],
    char: string,
    offset: number,
  ): void {
    const value = /\s/u.test(char) ? ' ' : char
    if (value === ' ' && chars.at(-1) === ' ') {
      return
    }

    chars.push(value)
    offsets.push(offset)
  }

  private trimVisibleTextStream(chars: string[], offsets: number[]): VisibleTextStream {
    let start = 0
    let end = chars.length
    while (start < end && chars[start] === ' ') {
      start += 1
    }
    while (end > start && chars[end - 1] === ' ') {
      end -= 1
    }

    return {
      text: chars.slice(start, end).join(''),
      offsets: offsets.slice(start, end),
    }
  }

  private getVisiblePositionForTextOffset(offsets: number[], textOffset: number): number {
    const normalizedOffset = Math.max(0, textOffset)
    let position = 0
    while (position < offsets.length && offsets[position]! < normalizedOffset) {
      position += 1
    }
    return position
  }

  private getSourceOffsetForVisiblePosition(offsets: number[], visiblePosition: number): number | null {
    if (offsets.length === 0) {
      return null
    }

    if (visiblePosition <= 0) {
      return offsets[0] ?? null
    }

    if (visiblePosition >= offsets.length) {
      return (offsets.at(-1) ?? 0) + 1
    }

    return offsets[visiblePosition] ?? null
  }

  private findSourceBlock(event: Event, clientX: number, clientY: number): HTMLElement | null {
    for (const target of event.composedPath()) {
      if (target instanceof HTMLElement && this.readSourceLines(target)) {
        return target
      }
    }

    let closest: {element: HTMLElement; area: number} | null = null
    for (const element of this.renderRoot.querySelectorAll<HTMLElement>(
      '[data-source-line-start][data-source-line-end]',
    )) {
      const rect = element.getBoundingClientRect()
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        continue
      }

      const area = rect.width * rect.height
      if (!closest || area < closest.area) {
        closest = {element, area}
      }
    }

    return closest?.element ?? null
  }

  private readSourceLines(element: HTMLElement): {start: number; end: number} | null {
    const start = Number(element.dataset['sourceLineStart'])
    const end = Number(element.dataset['sourceLineEnd'])
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      return null
    }

    return {start, end}
  }

  private getRenderedCaretOffset(element: HTMLElement, clientX: number, clientY: number): number | null {
    const documentWithCaret = this.ownerDocument as DocumentWithCaretFromPoint
    const position = documentWithCaret.caretPositionFromPoint?.(clientX, clientY)
    if (position && this.isNodeInside(element, position.offsetNode)) {
      return this.getTextOffsetWithin(element, position.offsetNode, position.offset)
    }

    const range = documentWithCaret.caretRangeFromPoint?.(clientX, clientY)
    if (range && this.isNodeInside(element, range.startContainer)) {
      return this.getTextOffsetWithin(element, range.startContainer, range.startOffset)
    }

    return this.getRenderedCaretOffsetFromTextRects(element, clientX, clientY)
  }

  private getRenderedCaretOffsetFromTextRects(
    element: HTMLElement,
    clientX: number,
    clientY: number,
  ): number | null {
    const range = this.ownerDocument.createRange()
    const walker = this.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let baseOffset = 0
    let bestCandidate: RenderedTextOffsetCandidate | null = null

    try {
      while (walker.nextNode()) {
        const textNode = walker.currentNode
        const text = textNode.textContent ?? ''
        for (let index = 0; index < text.length; index += 1) {
          range.setStart(textNode, index)
          range.setEnd(textNode, index + 1)
          const candidate = this.getTextRectOffsetCandidate(
            range.getClientRects(),
            baseOffset + index,
            clientX,
            clientY,
          )
          if (!candidate) {
            continue
          }

          if (!bestCandidate || candidate.distance < bestCandidate.distance) {
            bestCandidate = candidate
          }
          if (candidate.distance === 0) {
            return candidate.offset
          }
        }
        baseOffset += text.length
      }
    } finally {
      range.detach()
    }

    return bestCandidate?.offset ?? null
  }

  private getTextRectOffsetCandidate(
    rects: DOMRectList,
    textOffset: number,
    clientX: number,
    clientY: number,
  ): RenderedTextOffsetCandidate | null {
    let bestCandidate: RenderedTextOffsetCandidate | null = null

    for (const rect of Array.from(rects)) {
      if (rect.width <= 0 || rect.height <= 0) {
        continue
      }

      const insideX = clientX >= rect.left && clientX <= rect.right
      const insideY = clientY >= rect.top && clientY <= rect.bottom
      const xDistance = insideX ? 0 : Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right))
      const yDistance = insideY ? 0 : Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom))
      const offset = textOffset + Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const candidate = {
        offset: Math.round(offset),
        distance: yDistance * 1000 + xDistance,
      }

      if (!bestCandidate || candidate.distance < bestCandidate.distance) {
        bestCandidate = candidate
      }
    }

    return bestCandidate
  }

  private isNodeInside(root: HTMLElement, node: Node): boolean {
    return node === root || root.contains(node)
  }

  private getTextOffsetWithin(root: HTMLElement, node: Node, offset: number): number | null {
    const range = this.ownerDocument.createRange()
    range.selectNodeContents(root)
    try {
      range.setEnd(node, this.clampNodeOffset(node, offset))
      return Math.min(root.textContent?.length ?? 0, Math.max(0, range.toString().length))
    } catch {
      return null
    } finally {
      range.detach()
    }
  }

  private clampNodeOffset(node: Node, offset: number): number {
    const maxOffset = node.nodeType === Node.TEXT_NODE ? node.textContent?.length ?? 0 : node.childNodes.length
    return Math.min(maxOffset, Math.max(0, offset))
  }

  private getTextNeedle(text: string, offset: number): TextNeedle | null {
    const clampedOffset = Math.min(text.length, Math.max(0, offset))
    const wordAnchor = this.findWordAnchor(text, clampedOffset)
    if (wordAnchor !== null) {
      let start = wordAnchor
      let end = wordAnchor + 1
      while (start > 0 && this.isWordCharacter(text[start - 1] ?? '')) {
        start -= 1
      }
      while (end < text.length && this.isWordCharacter(text[end] ?? '')) {
        end += 1
      }

      return {
        value: text.slice(start, end),
        start,
        offsetInNeedle: Math.min(end - start, Math.max(0, clampedOffset - start)),
      }
    }

    return this.getNonWhitespaceNeedle(text, clampedOffset)
  }

  private findWordAnchor(text: string, offset: number): number | null {
    if (offset < text.length && this.isWordCharacter(text[offset] ?? '')) {
      return offset
    }
    if (offset > 0 && this.isWordCharacter(text[offset - 1] ?? '')) {
      return offset - 1
    }
    return null
  }

  private isWordCharacter(value: string): boolean {
    return /^[\p{L}\p{N}_-]$/u.test(value)
  }

  private getNonWhitespaceNeedle(text: string, offset: number): TextNeedle | null {
    const anchor =
      offset < text.length && /\S/u.test(text[offset] ?? '')
        ? offset
        : offset > 0 && /\S/u.test(text[offset - 1] ?? '')
          ? offset - 1
          : null
    if (anchor === null) {
      return null
    }

    let runStart = anchor
    let runEnd = anchor + 1
    while (runStart > 0 && /\S/u.test(text[runStart - 1] ?? '')) {
      runStart -= 1
    }
    while (runEnd < text.length && /\S/u.test(text[runEnd] ?? '')) {
      runEnd += 1
    }

    const start = Math.max(runStart, Math.min(anchor, runEnd) - 8)
    const end = Math.min(runEnd, start + 24)
    return {
      value: text.slice(start, end),
      start,
      offsetInNeedle: Math.min(end - start, Math.max(0, offset - start)),
    }
  }

  private countNeedleOccurrencesBefore(text: string, needle: string, beforeIndex: number): number {
    let count = 0
    let fromIndex = 0
    while (fromIndex < text.length) {
      const index = text.indexOf(needle, fromIndex)
      if (index === -1 || index >= beforeIndex) {
        return count
      }

      count += 1
      fromIndex = index + needle.length
    }

    return count
  }

  private findNeedleOccurrence(source: string, needle: string, occurrenceIndex: number): number | null {
    let count = 0
    let fromIndex = 0
    while (fromIndex < source.length) {
      const index = source.indexOf(needle, fromIndex)
      if (index === -1) {
        return null
      }
      if (count === occurrenceIndex) {
        return index
      }

      count += 1
      fromIndex = index + needle.length
    }

    return null
  }

  private getSourceLineFallbackOffset(source: string, startLine: number, endLine: number): number {
    const startOffset = this.getSourceOffsetForLine(source, startLine)
    const endOffset = this.getSourceOffsetForLine(source, endLine)
    const sourceLine = source.slice(startOffset, endOffset)
    const firstNonWhitespace = /\S/u.exec(sourceLine)
    return startOffset + (firstNonWhitespace?.index ?? 0)
  }

  private getSourceOffsetForLine(source: string, line: number): number {
    if (line <= 0) {
      return 0
    }

    let currentLine = 0
    let offset = 0
    while (currentLine < line && offset < source.length) {
      const nextLineBreak = source.indexOf('\n', offset)
      if (nextLineBreak === -1) {
        return source.length
      }

      offset = nextLineBreak + 1
      currentLine += 1
    }

    return offset
  }

  private handleKeyboard(event: KeyboardEvent) {
    if (keyboardShortcutsModel.matches('markdown.save', event) && markdownPreviewModel.canSave()) {
      event.preventDefault()
      void markdownPreviewModel.save()
      return
    }

    if (keyboardShortcutsModel.matches('markdown.undo', event) && markdownPreviewModel.canUndo()) {
      event.preventDefault()
      markdownPreviewModel.undo()
      return
    }

    if (keyboardShortcutsModel.matches('markdown.redo', event) && markdownPreviewModel.canRedo()) {
      event.preventDefault()
      markdownPreviewModel.redo()
      return
    }

    if (event.key === 'Escape') {
      event.stopPropagation()
      this.dispatchEvent(new CustomEvent('close', {bubbles: true, composed: true}))
    }
  }

  private getFormatLabel(state: MarkdownPreviewReadyState): string {
    return i18n(state.formatting ? 'markdown:formatting' : 'markdown:format')
  }

  private getFallbackCopyKey(reasonKey: FilePreviewFallbackReasonKey): MarkdownFallbackCopyKey {
    if (reasonKey === 'file-preview:text-too-large') {
      return 'markdown:fallback:text-too-large'
    }

    if (reasonKey === 'file-preview:text-invalid-encoding') {
      return 'markdown:fallback:text-invalid-encoding'
    }

    return reasonKey
  }

  private renderModeButton(mode: MarkdownPreviewMode, currentMode: MarkdownPreviewMode) {
    const label = i18n(mode === 'preview' ? 'markdown:mode:preview' : 'markdown:mode:edit')

    return html`
      <cv-button unstyled
        class="mode-button"
        type="button"
        aria-pressed=${currentMode === mode ? 'true' : 'false'}
        aria-label=${label}
        @click=${mode === 'preview' ? this.handlePreviewModeClick : this.handleEditModeClick}
      >
        ${label}
      </cv-button>
    `
  }

  private renderToolbar(state: MarkdownPreviewReadyState) {
    const formatLabel = this.getFormatLabel(state)
    const insertImageLabel = i18n(
      markdownPreviewModel.imageAttaching() ? 'markdown:attaching-image' : 'markdown:insert-image',
    )
    const renameLabel = i18n(markdownDocumentRenameModel.state.renaming() ? 'markdown:renaming' : 'button:rename')

    return html`
      <div class="toolbar">
        <div class="mode-control" role="group" aria-label=${i18n('markdown:mode-group')}>
          ${this.renderModeButton('preview', state.mode)} ${this.renderModeButton('edit', state.mode)}
        </div>
        <div class="action-group toolbar-actions">
          <cv-button unstyled
            class="action-button insert-image-action"
            type="button"
            ?disabled=${!markdownPreviewModel.canInsertImage()}
            aria-label=${insertImageLabel}
            @click=${this.handleInsertImageClick}
          >
            ${markdownPreviewModel.imageAttaching()
              ? html`<cv-spinner slot="prefix" size="xs" label=${insertImageLabel}></cv-spinner>`
              : html`<cv-icon slot="prefix" name="image-plus" size="s"></cv-icon>`}
            <span>${insertImageLabel}</span>
          </cv-button>
          <cv-button unstyled
            class="action-button"
            type="button"
            ?disabled=${!markdownPreviewModel.canUndo()}
            aria-label=${i18n('markdown:undo')}
            @click=${this.handleUndoClick}
          >
            <cv-icon slot="prefix" name="undo-2" size="s"></cv-icon>
            <span>${i18n('markdown:undo')}</span>
          </cv-button>
          <cv-button unstyled
            class="action-button"
            type="button"
            ?disabled=${!markdownPreviewModel.canRedo()}
            aria-label=${i18n('markdown:redo')}
            @click=${this.handleRedoClick}
          >
            <cv-icon slot="prefix" name="redo-2" size="s"></cv-icon>
            <span>${i18n('markdown:redo')}</span>
          </cv-button>
          <cv-button unstyled
            class="action-button"
            type="button"
            ?disabled=${!markdownPreviewModel.canFormat()}
            aria-label=${formatLabel}
            @click=${this.handleFormatClick}
          >
            ${state.formatting
              ? html`<cv-spinner slot="prefix" size="xs" label=${formatLabel}></cv-spinner>`
              : html`<cv-icon slot="prefix" name="arrow-repeat" size="s"></cv-icon>`}
            <span>${formatLabel}</span>
          </cv-button>
          <cv-button unstyled
            class="action-button"
            type="button"
            ?disabled=${!markdownDocumentRenameModel.state.canRename()}
            aria-label=${renameLabel}
            @click=${this.handleRenameClick}
          >
            ${markdownDocumentRenameModel.state.renaming()
              ? html`<cv-spinner slot="prefix" size="xs" label=${renameLabel}></cv-spinner>`
              : html`<cv-icon slot="prefix" name="pencil" size="s"></cv-icon>`}
            <span>${renameLabel}</span>
          </cv-button>
        </div>
      </div>
    `
  }

  private renderStatus(state: MarkdownPreviewReadyState) {
    if (state.stale) {
      return html`
        <div class="markdown-status-block">
          <div class="markdown-status-row">
            <cv-callout class="markdown-status-callout" variant="warning" density="compact" role="alert">
              <cv-icon slot="icon" name="exclamation-triangle" size="s"></cv-icon>
              <div class="markdown-status-body">
                <strong>${i18n('markdown:stale:title')}</strong>
                <div>${i18n('markdown:stale:copy')}</div>
              </div>
            </cv-callout>
            <cv-menu-button
              class="stale-overflow"
              variant="ghost"
              preset="icon-overflow"
              aria-label=${i18n('markdown:stale:more-actions' as any)}
              @cv-input=${this.handleStaleOverflow}
            >
              <span slot="prefix" class="stale-overflow-trigger">
                <cv-icon name="three-dots"></cv-icon>
              </span>
              <cv-menu-item slot="menu" value="overwrite" class="overflow-menu-item">
                <cv-icon slot="prefix" name="upload"></cv-icon>
                ${i18n('markdown:stale:overwrite')}
              </cv-menu-item>
              <cv-menu-item slot="menu" value="cancel" class="overflow-menu-item">
                ${i18n('button:cancel')}
              </cv-menu-item>
            </cv-menu-button>
          </div>
          <div class="action-group stale-actions">
            <cv-button unstyled class="action-button primary" type="button" @click=${this.handleReloadClick}>
              <cv-icon slot="prefix" name="arrow-clockwise" size="s"></cv-icon>
              <span>${i18n('markdown:stale:reload')}</span>
            </cv-button>
          </div>
        </div>
      `
    }

    if (state.readOnlyReasonKey) {
      return html`
        <cv-callout class="markdown-status-callout" variant="warning" density="compact" role="status" aria-live="polite">
          <cv-icon slot="icon" name="info" size="s"></cv-icon>
          <span>${i18n(state.readOnlyReasonKey)}</span>
        </cv-callout>
      `
    }

    if (state.errorKey) {
      return html`
        <cv-callout class="markdown-status-callout" variant="danger" density="compact" role="alert">
          <cv-icon slot="icon" name="exclamation-triangle" size="s"></cv-icon>
          <span>${i18n(state.errorKey)}</span>
        </cv-callout>
      `
    }

    return nothing
  }

  private renderContent(state: MarkdownPreviewReadyState) {
    if (state.mode === 'edit') {
      return html`
        <textarea
          class="source-editor"
          spellcheck="false"
          aria-label=${i18n('markdown:editor-label')}
          .value=${state.source}
          @input=${this.handleSourceInput}
          @focus=${this.handleSourceSelection}
          @keyup=${this.handleSourceSelection}
          @pointerup=${this.handleSourceSelection}
          @select=${this.handleSourceSelection}
          @dragover=${this.handleSourceDragOver}
          @drop=${this.handleSourceDrop}
          @paste=${this.handleSourcePaste}
        ></textarea>
      `
    }

    return html`
      <div
        class="rendered-markdown"
        tabindex="0"
        aria-label=${i18n('markdown:preview-label')}
        @click=${this.handlePreviewClick}
        @pointercancel=${this.handlePreviewPointerEnd}
        @pointerdown=${this.handlePreviewPointerDown}
        @pointermove=${this.handlePreviewPointerMove}
        @pointerup=${this.handlePreviewPointerEnd}
        @dblclick=${this.handlePreviewDoubleClick}
        @touchcancel=${this.handlePreviewTouchEnd}
        @touchend=${this.handlePreviewTouchEnd}
        @touchmove=${this.handlePreviewTouchMove}
        @touchstart=${this.handlePreviewTouchStart}
      >
        ${unsafeHTML(state.renderedHtml)}
      </div>
    `
  }

  private renderDirtyConfirmation() {
    const open = !!markdownPreviewModel.pendingCloseIntent()

    return html`
      <cv-bottom-sheet
        class="dirty-sheet"
        .open=${open}
        no-header
        show-handle
        drag-to-close
        close-on-escape
        close-on-outside-pointer
        aria-label=${i18n('markdown:dirty:dialog-label')}
        aria-labelledby="markdown-dirty-title"
        aria-describedby="markdown-dirty-copy"
        @cv-change=${this.handleDirtySheetChange}
      >
        <div class="dirty-sheet-body">
          <div class="dirty-title" id="markdown-dirty-title">${i18n('markdown:dirty:title')}</div>
          <div class="dirty-copy" id="markdown-dirty-copy">${i18n('markdown:dirty:copy')}</div>
          <div class="dirty-actions">
            <cv-button unstyled class="action-button primary" type="button" @click=${this.handleDirtySaveClick}>
              <cv-icon slot="prefix" name="save" size="s"></cv-icon>
              <span>${i18n('markdown:dirty:save')}</span>
            </cv-button>
            <cv-button unstyled class="action-button warning" type="button" @click=${this.handleDirtyDiscardClick}>
              <span>${i18n('markdown:dirty:discard')}</span>
            </cv-button>
            <cv-button unstyled class="action-button" type="button" @click=${this.handleDirtyCancelClick}>
              <span>${i18n('markdown:dirty:cancel')}</span>
            </cv-button>
          </div>
        </div>
      </cv-bottom-sheet>
    `
  }

  protected render() {
    const state = markdownPreviewModel.state()
    void markdownPreviewModel.editorFocusRequest()

    if (state.kind === 'idle') {
      return nothing
    }

    if (state.kind === 'loading') {
      return html`
        <div class="markdown-preview" @keydown=${this.handleKeyboard}>
          <div class="loading" role="status" aria-live="polite">
            <cv-spinner size="m" label=${i18n('loading')}></cv-spinner>
          </div>
        </div>
      `
    }

    if (state.kind === 'fallback') {
      return html`
        <div class="markdown-preview" @keydown=${this.handleKeyboard}>
          <div class="fallback" role="status" aria-live="polite">
            <cv-icon name="file-earmark-text" size="l"></cv-icon>
            <span>${i18n(this.getFallbackCopyKey(state.reasonKey))}</span>
          </div>
        </div>
      `
    }

    const showFab = state.mode === 'preview' && !state.readOnlyReasonKey && !state.errorKey
    return html`
      <div class="markdown-preview" @keydown=${this.handleKeyboard}>
        ${this.renderToolbar(state)} ${this.renderStatus(state)}
        <div class="content">${this.renderContent(state)}</div>
        <input
          class="image-input"
          type="file"
          accept="image/*"
          multiple
          @change=${this.handleImageInputChange}
        />
        ${showFab
          ? html`
              <cv-button
                unstyled
                class="fab-edit"
                type="button"
                aria-label=${i18n('markdown:mode:edit')}
                @click=${this.handleEditModeClick}
              >
                <cv-icon name="pencil"></cv-icon>
              </cv-button>
            `
          : nothing}
        ${this.renderDirtyConfirmation()}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'markdown-preview': MarkdownPreview
  }
}
