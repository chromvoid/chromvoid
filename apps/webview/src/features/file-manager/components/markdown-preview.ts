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
import {
  MarkdownSourceEditor,
  type MarkdownSourceCommandDetail,
  type MarkdownSourceImageFilesDetail,
  type MarkdownSourceInputDetail,
  type MarkdownSourceSelectionDetail,
} from './markdown-source-editor'
import {markdownDocumentRenameModel} from '../models/markdown-document-rename.model'
import {
  markdownPreviewModel,
  type MarkdownPreviewData,
  type MarkdownImageInsertionSelection,
  type MarkdownPreviewMode,
  type MarkdownPreviewReadyState,
  type MarkdownQuickTextAction,
  type MarkdownViewportAnchor,
} from '../models/markdown-preview.model'
import {getMarkdownSourceOffsetForLine} from '../services/markdown-task-lists'

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

type CaretPositionLike = {
  offsetNode: Node
  offset: number
}

type CaretPointDocument = Document & {
  caretPositionFromPoint?: (
    x: number,
    y: number,
    options?: {shadowRoots?: ShadowRoot[]},
  ) => CaretPositionLike | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

type SelectionRoot = DocumentFragment & {
  getSelection?: () => Selection | null
}

const IMAGE_FILE_NAME_PATTERN = /\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/i

type MarkdownQuickOverflowAction = MarkdownQuickTextAction | 'undo' | 'redo'

type MarkdownQuickActionLabelKey =
  | 'markdown:quick-action:table'
  | 'markdown:quick-action:bold'
  | 'markdown:quick-action:italic'
  | 'markdown:quick-action:strikethrough'
  | 'markdown:quick-action:heading-h2'
  | 'markdown:quick-action:bullet-list'
  | 'markdown:quick-action:numbered-list'
  | 'markdown:quick-action:task-list'
  | 'markdown:quick-action:quote'
  | 'markdown:quick-action:inline-code'
  | 'markdown:quick-action:divider'

type MarkdownQuickActionItem = {
  action: MarkdownQuickTextAction
  icon: string
  labelKey: MarkdownQuickActionLabelKey
}

const MARKDOWN_QUICK_TABLE_ACTION: MarkdownQuickActionItem = {
  action: 'table',
  icon: 'table',
  labelKey: 'markdown:quick-action:table',
}

const MARKDOWN_QUICK_FORMAT_ACTIONS: MarkdownQuickActionItem[] = [
  {action: 'bold', icon: 'bold', labelKey: 'markdown:quick-action:bold'},
  {action: 'italic', icon: 'italic', labelKey: 'markdown:quick-action:italic'},
  {action: 'strikethrough', icon: 'strikethrough', labelKey: 'markdown:quick-action:strikethrough'},
]

const MARKDOWN_QUICK_OVERFLOW_ACTIONS: MarkdownQuickActionItem[] = [
  {action: 'heading-h2', icon: 'heading', labelKey: 'markdown:quick-action:heading-h2'},
  {action: 'bullet-list', icon: 'list', labelKey: 'markdown:quick-action:bullet-list'},
  {action: 'numbered-list', icon: 'list-ordered', labelKey: 'markdown:quick-action:numbered-list'},
  {action: 'task-list', icon: 'list-todo', labelKey: 'markdown:quick-action:task-list'},
  {action: 'quote', icon: 'quote', labelKey: 'markdown:quick-action:quote'},
  {action: 'inline-code', icon: 'code', labelKey: 'markdown:quick-action:inline-code'},
  {action: 'divider', icon: 'minus', labelKey: 'markdown:quick-action:divider'},
]

export class MarkdownPreview extends ReatomLitElement {
  static define() {
    CVBottomSheet.define()
    CVMenuButton.define()
    CVMenuItem.define()
    MarkdownSourceEditor.define()
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
  private lastAnchorScrollRequestId = 0
  private renderedViewportContext: {fileId: number; mode: MarkdownPreviewMode} | null = null
  private preparedModeAnchor: MarkdownViewportAnchor | null = null
  private viewportCaptureFrame = 0
  private editorViewportRestoreFrame = 0
  private viewportRestoreReleaseFrame = 0
  private viewportRestoreInProgress = false
  private activeViewportResizeObserver: ResizeObserver | null = null
  private observedViewportElement: HTMLElement | null = null
  private previewImageResizeObserver: ResizeObserver | null = null
  private renderedPreviewHtml: string | null = null
  private pendingQuickActionPointerTarget: HTMLElement | null = null
  private suppressNextQuickActionClickTarget: HTMLElement | null = null

  static styles = [
    css`
      :host {
        display: block;
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 0;
        color: var(--cv-color-text);
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
      .source-editor:focus-visible,
      .source-editor:focus-within {
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

      .rendered-markdown::selection,
      .rendered-markdown *::selection {
        background: var(--cv-color-text-selection-background);
        color: var(--cv-color-text-selection-foreground);
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
      .rendered-markdown .cv-markdown-image--app-editorial-status-error {
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

      .rendered-markdown .cv-markdown-task-checkbox {
        box-sizing: border-box;
        position: relative;
        display: inline-grid;
        place-items: center;
        inline-size: max(1.08em, 18px);
        block-size: max(1.08em, 18px);
        margin-inline: 0 0.5em;
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-1);
        background-color: var(--cv-color-surface-tertiary-glass);
        color: var(--cv-color-primary);
        cursor: pointer;
        overflow-anchor: none;
        transform: translateY(0);
        transition:
          transform var(--cv-duration-fast) var(--cv-easing-standard),
          border-color var(--cv-duration-fast) var(--cv-easing-standard),
          background-color var(--cv-duration-fast) var(--cv-easing-standard),
          color var(--cv-duration-fast) var(--cv-easing-standard);
        vertical-align: middle;
      }

      .rendered-markdown .cv-markdown-task-checkbox:hover {
        border-color: var(--cv-color-primary-border-strong);
        background-color: var(--cv-color-primary-surface);
      }

      .rendered-markdown .cv-markdown-task-checkbox:active {
        transform: translateY(1px) scale(0.96);
      }

      .rendered-markdown .cv-markdown-task-checkbox[aria-checked='true'] {
        border-color: var(--cv-color-primary-border-strong);
        background-color: var(--cv-color-primary-surface-strong);
      }

      .rendered-markdown .cv-markdown-task-checkbox::after {
        box-sizing: border-box;
        content: '';
        inline-size: 0.38em;
        block-size: 0.68em;
        border-color: currentColor;
        border-style: solid;
        border-width: 0 2px 2px 0;
        opacity: 0;
        transform: translateY(-0.08em) rotate(45deg) scale(0.84);
        transition:
          transform var(--cv-duration-fast) var(--cv-easing-standard),
          opacity var(--cv-duration-fast) var(--cv-easing-standard);
      }

      .rendered-markdown .cv-markdown-task-checkbox[aria-checked='true']::after {
        opacity: 1;
        transform: translateY(-0.08em) rotate(45deg) scale(1);
      }

      .rendered-markdown .cv-markdown-task-checkbox:focus-visible {
        outline: 2px solid var(--cv-color-focus-ring, var(--cv-color-primary));
        outline-offset: 3px;
        border-color: var(--cv-color-primary-border-strong);
      }

      @media (prefers-reduced-motion: reduce) {
        .rendered-markdown .cv-markdown-task-checkbox,
        .rendered-markdown .cv-markdown-task-checkbox::after {
          transition-duration: var(--cv-duration-instant, 0ms);
        }
      }

      .rendered-markdown a {
        color: var(--cv-color-accent);
        text-decoration: underline;
        text-underline-offset: 3px;
        cursor: default;
      }

      .rendered-markdown [data-cv-note-link-id] {
        color: var(--cv-color-accent);
        text-decoration: underline;
        text-underline-offset: 3px;
        cursor: pointer;
      }

      .rendered-markdown [data-cv-note-link-id]:focus-visible {
        outline: 2px solid var(--cv-color-accent);
        outline-offset: 2px;
      }

      .rendered-markdown [data-cv-note-link-state='unresolved'],
      .rendered-markdown [data-cv-note-link-state='ambiguous'],
      .rendered-markdown [data-cv-note-link-state='external'] {
        color: var(--cv-color-text-muted);
        text-decoration-style: dotted;
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

      .editor-quick-bar {
        display: none;
      }

      @media (max-width: 720px) {
        .markdown-preview {
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
          display: none;
        }

        .fab-edit {
          position: absolute;
          inset-inline-end: 16px;
          inset-block-end: max(var(--app-spacing-4), env(safe-area-inset-bottom));
          inline-size: var(--file-markdown-preview-fab-size);
          block-size: var(--file-markdown-preview-fab-size);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--cv-color-accent-border-strong);
          border-radius: 999px;
          background: var(--cv-color-surface-elevated, var(--cv-color-surface));
          color: var(--cv-color-accent);
          cursor: pointer;
          z-index: 4;
          box-shadow:
            var(--app-glass-shadow),
            inset 0 1px 0 var(--cv-alpha-white-10);
        }

        .fab-edit:hover {
          color: var(--cv-color-accent-hover);
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

        @supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .fab-edit {
            background: var(--app-glass-background);
            backdrop-filter: blur(10px) saturate(115%);
            -webkit-backdrop-filter: blur(10px) saturate(115%);
          }

          .fab-edit:hover {
            background: var(--cv-color-surface-secondary-glass-strong);
          }
        }

        @media (prefers-reduced-transparency: reduce) {
          .fab-edit,
          .fab-edit:hover {
            background: var(--cv-color-surface-elevated, var(--cv-color-surface));
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
        }

        .rendered-markdown,
        .source-editor {
          border: 0;
          border-radius: 0;
          background: transparent;
          min-block-size: 0;
        }

        .rendered-markdown {
          padding: var(--app-spacing-2) var(--app-spacing-4)
            calc(
              var(--file-markdown-preview-fab-size) + max(var(--app-spacing-4), env(safe-area-inset-bottom)) +
                var(--app-spacing-4)
            );
          scroll-padding-block-end: calc(
            var(--file-markdown-preview-fab-size) + max(var(--app-spacing-4), env(safe-area-inset-bottom)) +
              var(--app-spacing-4)
          );
        }

        .source-editor {
          padding: var(--app-spacing-2) var(--app-spacing-4)
            calc(
              var(--app-spacing-2) + var(--file-markdown-editor-quick-bar-block-size) + var(--app-spacing-3) +
                var(--app-runtime-keyboard-block-end-action-offset, 0px)
            );
          font-size: var(--cv-font-size-base);
          line-height: 1.6;
        }

        .editor-quick-bar {
          box-sizing: border-box;
          position: absolute;
          inset-inline: 0;
          /* The inherited action offset lifts the bar above overlay IMEs while
             native-resize mode contributes only the shared breathing gap. */
          inset-block-end: var(--app-runtime-keyboard-block-end-action-offset, 0px);
          min-block-size: var(--file-markdown-editor-quick-bar-block-size);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--app-spacing-1);
          overflow-x: auto;
          overscroll-behavior-inline: contain;
          padding-block: var(--app-spacing-1);
          padding-inline-start: max(12px, var(--app-runtime-safe-area-inline-start, 0px));
          padding-inline-end: max(12px, var(--app-runtime-safe-area-inline-end, 0px));
          border-block-start: 1px solid var(--cv-color-border-muted);
          background: var(--cv-color-surface-elevated, var(--cv-color-surface));
          box-shadow: 0 -8px 24px var(--cv-alpha-black-25);
          z-index: 5;
          -webkit-overflow-scrolling: touch;
        }

        .editor-quick-group {
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          gap: var(--app-spacing-1);
        }

        .editor-quick-button {
          flex: 0 0 auto;
          inline-size: 44px;
          block-size: 44px;
          min-inline-size: 44px;
          min-block-size: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: 0;
          border-radius: var(--cv-radius-2);
          background: transparent;
          color: var(--cv-color-text);
          font: inherit;
          cursor: pointer;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        .editor-quick-button span {
          display: none;
        }

        .editor-quick-button:focus-visible {
          outline: 2px solid var(--cv-color-accent);
          outline-offset: 2px;
        }

        .editor-quick-button:active {
          transform: scale(0.96);
        }

        .editor-quick-button:disabled {
          opacity: 0.48;
          cursor: default;
          transform: none;
        }

        .editor-quick-overflow {
          --cv-menu-button-min-height: 44px;
          --cv-menu-button-menu-align: end;
          --cv-menu-button-menu-z-index: 12;
          flex: 0 0 auto;
        }

        .editor-quick-overflow::part(trigger) {
          inline-size: 44px;
          block-size: 44px;
          min-inline-size: 44px;
          min-block-size: 44px;
          padding: 0;
          border: 0;
          border-radius: var(--cv-radius-2);
          background: transparent;
          color: var(--cv-color-text);
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        .editor-quick-overflow::part(prefix) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .editor-quick-overflow::part(label),
        .editor-quick-overflow::part(suffix),
        .editor-quick-overflow::part(dropdown-icon) {
          display: none;
        }

        .editor-quick-overflow::part(menu) {
          gap: 2px;
          padding: 4px;
          border: 1px solid var(--cv-color-border-muted);
          border-radius: var(--cv-radius-2);
          background: var(--cv-color-surface-elevated, var(--cv-color-surface));
          box-shadow: 0 12px 32px var(--cv-alpha-black-35);
        }

        .editor-quick-overflow-trigger {
          inline-size: 100%;
          block-size: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .editor-quick-menu-item::part(base) {
          gap: 10px;
          padding: 10px 12px;
          border-radius: var(--cv-radius-1);
          white-space: nowrap;
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
    if (this.viewportCaptureFrame) {
      this.ownerDocument.defaultView?.cancelAnimationFrame(this.viewportCaptureFrame)
      this.viewportCaptureFrame = 0
    }
    if (this.editorViewportRestoreFrame) {
      this.ownerDocument.defaultView?.cancelAnimationFrame(this.editorViewportRestoreFrame)
      this.editorViewportRestoreFrame = 0
    }
    if (this.viewportRestoreReleaseFrame) {
      this.ownerDocument.defaultView?.cancelAnimationFrame(this.viewportRestoreReleaseFrame)
      this.viewportRestoreReleaseFrame = 0
    }
    this.viewportRestoreInProgress = false
    this.activeViewportResizeObserver?.disconnect()
    this.activeViewportResizeObserver = null
    this.observedViewportElement = null
    this.previewImageResizeObserver?.disconnect()
    this.previewImageResizeObserver = null
    this.unregisterTransientBack?.()
    this.unregisterTransientBack = undefined
    this.unregisterImagePickerTrigger?.()
    this.unregisterImagePickerTrigger = undefined
    markdownPreviewModel.cleanup()
    super.disconnectedCallback()
  }

  protected willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties)
    const state = markdownPreviewModel.state()
    const contextChanging =
      state.kind === 'ready' &&
      this.renderedViewportContext !== null &&
      (this.renderedViewportContext.fileId !== state.fileId ||
        this.renderedViewportContext.mode !== state.mode)
    if (!contextChanging) {
      this.rememberRenderedViewportAnchor()
    }
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (changedProperties.has('data')) {
      markdownPreviewModel.setPreview(this.data)
    }
    this.applyEditorFocusRequest()
    const anchorApplied = this.applyAnchorScrollRequest()
    this.syncRenderedTaskCheckboxStates()
    const state = markdownPreviewModel.state()
    if (state.kind !== 'ready') {
      this.renderedViewportContext = null
      this.renderedPreviewHtml = null
      this.observeActiveViewportLayout(null)
      this.previewImageResizeObserver?.disconnect()
      return
    }

    const contextChanged =
      this.renderedViewportContext?.fileId !== state.fileId ||
      this.renderedViewportContext.mode !== state.mode
    const previewContentChanged = state.mode === 'preview' && this.renderedPreviewHtml !== state.renderedHtml
    this.renderedViewportContext = {fileId: state.fileId, mode: state.mode}
    this.renderedPreviewHtml = state.mode === 'preview' ? state.renderedHtml : null

    if (!anchorApplied && (contextChanged || previewContentChanged)) {
      this.applyRememberedViewportAnchor(state)
    }
    this.observeActiveViewportLayout(state)
    this.observePreviewImageLayout(state)
  }

  private handleModePointerDown() {
    this.preparedModeAnchor = this.captureActiveViewportAnchor()
  }

  private handlePreviewModeClick() {
    this.switchMode('preview')
  }

  private handleEditModeClick() {
    this.switchMode('edit')
  }

  private switchMode(mode: MarkdownPreviewMode): void {
    const viewportAnchor = this.preparedModeAnchor ?? this.captureActiveViewportAnchor()
    this.preparedModeAnchor = null
    if (viewportAnchor) {
      markdownPreviewModel.setMode(mode, {viewportAnchor})
    } else {
      markdownPreviewModel.setMode(mode)
    }
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

  private handleInsertImageClick(event?: Event) {
    if (this.consumeSuppressedQuickActionClick(event)) {
      return
    }

    this.insertImageAtCurrentSelection()
  }

  private insertImageAtCurrentSelection() {
    this.rememberRenderedViewportAnchor()
    markdownPreviewModel.requestImagePicker(this.getCurrentEditorSelection())
  }

  private handleInsertLinkClick(event?: Event) {
    if (this.consumeSuppressedQuickActionClick(event)) {
      return
    }

    this.insertFileLinkAtCurrentSelection()
  }

  private insertFileLinkAtCurrentSelection() {
    this.rememberRenderedViewportAnchor()
    if (!markdownPreviewModel.requestFileLinkInsertion(this.getCurrentEditorSelection())) {
      return
    }

    void this.updateComplete.then(() => {
      this.openFileLinkCompletion()
    })
  }

  private handleQuickActionPointerDown(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement | null
    if (!target || target.hasAttribute('disabled')) {
      return
    }

    this.pendingQuickActionPointerTarget = target
    event.preventDefault()
  }

  private handleQuickActionPointerCancel(event: PointerEvent) {
    if (this.pendingQuickActionPointerTarget === event.currentTarget) {
      this.pendingQuickActionPointerTarget = null
    }
  }

  private finishQuickActionPointer(event: PointerEvent): HTMLElement | null {
    const target = event.currentTarget as HTMLElement | null
    if (!target || target.hasAttribute('disabled') || this.pendingQuickActionPointerTarget !== target) {
      return null
    }

    this.pendingQuickActionPointerTarget = null
    this.suppressNextQuickActionClickTarget = target
    event.preventDefault()
    return target
  }

  private consumeSuppressedQuickActionClick(event: Event | undefined): boolean {
    if (!event) {
      return false
    }

    const target = event.currentTarget as HTMLElement | null
    if (!target || this.suppressNextQuickActionClickTarget !== target) {
      return false
    }

    this.suppressNextQuickActionClickTarget = null
    event.preventDefault()
    return true
  }

  private handleQuickInsertImagePointerUp(event: PointerEvent) {
    if (!this.finishQuickActionPointer(event)) {
      return
    }

    this.insertImageAtCurrentSelection()
  }

  private handleQuickInsertLinkPointerUp(event: PointerEvent) {
    if (!this.finishQuickActionPointer(event)) {
      return
    }

    this.insertFileLinkAtCurrentSelection()
  }

  private handleQuickTextActionClick(event: Event) {
    if (this.consumeSuppressedQuickActionClick(event)) {
      return
    }

    this.applyQuickTextActionFromTarget(event.currentTarget as HTMLElement | null)
  }

  private handleQuickTextActionPointerUp(event: PointerEvent) {
    const target = this.finishQuickActionPointer(event)
    if (!target) {
      return
    }

    this.applyQuickTextActionFromTarget(target)
  }

  private applyQuickTextActionFromTarget(target: HTMLElement | null) {
    const action = target?.dataset['quickAction'] as MarkdownQuickTextAction | undefined
    if (!action) {
      return
    }

    this.rememberRenderedViewportAnchor()
    markdownPreviewModel.applyMarkdownQuickAction(action, this.getCurrentEditorSelection())
  }

  private handleQuickOverflow(event: CustomEvent<{value: string | null; open: boolean}>) {
    const menu = event.currentTarget as HTMLElementTagNameMap['cv-menu-button']
    if (event.detail.open) {
      this.resetMenuSelection(menu)
      return
    }

    const action = event.detail.value as MarkdownQuickOverflowAction | null
    if (!action) {
      return
    }

    menu.open = false
    this.resetMenuSelection(menu)
    this.rememberRenderedViewportAnchor()
    if (action === 'undo') {
      markdownPreviewModel.undo()
      return
    }
    if (action === 'redo') {
      markdownPreviewModel.redo()
      return
    }

    markdownPreviewModel.applyMarkdownQuickAction(action, this.getCurrentEditorSelection())
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

  private resetMenuSelection(menu: HTMLElementTagNameMap['cv-menu-button']) {
    menu.value = ''
    for (const item of menu.querySelectorAll<HTMLElementTagNameMap['cv-menu-item']>('cv-menu-item')) {
      item.selected = false
      item.active = false
    }
  }

  private handleStaleOverflow(event: CustomEvent<{value: string | null; open: boolean}>) {
    const menu = event.currentTarget as HTMLElementTagNameMap['cv-menu-button']
    if (event.detail.open) {
      this.resetMenuSelection(menu)
      return
    }
    const value = event.detail.value
    menu.open = false
    this.resetMenuSelection(menu)
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

  private handleSourceInput(event: Event | CustomEvent<MarkdownSourceInputDetail>) {
    const source =
      'detail' in event && typeof event.detail?.source === 'string'
        ? event.detail.source
        : event.currentTarget instanceof MarkdownSourceEditor
          ? event.currentTarget.value
          : ''
    markdownPreviewModel.updateSource(source)
  }

  private handleSourceSelection(event: CustomEvent<MarkdownSourceSelectionDetail>) {
    markdownPreviewModel.updateEditorSelection(event.detail)
  }

  private handleSourceImageFiles(event: CustomEvent<MarkdownSourceImageFilesDetail>) {
    void markdownPreviewModel.insertImageFiles(event.detail.files, {
      selectionStart: event.detail.selectionStart,
      selectionEnd: event.detail.selectionEnd,
    })
  }

  private handleSourcePaste(event: ClipboardEvent) {
    if (event.defaultPrevented) {
      return
    }

    const files = this.getImageFiles(event.clipboardData?.files)
    if (files.length === 0) {
      return
    }

    event.preventDefault()
    void markdownPreviewModel.insertImageFiles(
      files,
      this.getCurrentEditorSelection() ?? {selectionStart: 0, selectionEnd: 0},
    )
  }

  private handleSourceDrop(event: DragEvent) {
    if (event.defaultPrevented) {
      return
    }

    const files = this.getImageFiles(event.dataTransfer?.files)
    if (files.length === 0) {
      return
    }

    event.preventDefault()
    void markdownPreviewModel.insertImageFiles(
      files,
      this.getCurrentEditorSelection() ?? {selectionStart: 0, selectionEnd: 0},
    )
  }

  private handleSourceDragOver(event: DragEvent) {
    if (!event.defaultPrevented && this.hasImageFile(event.dataTransfer?.items)) {
      event.preventDefault()
    }
  }

  private handleSourceCommand(event: CustomEvent<MarkdownSourceCommandDetail>) {
    if (event.detail.command === 'save' && markdownPreviewModel.canSave()) {
      void markdownPreviewModel.save()
    } else if (event.detail.command === 'undo' && markdownPreviewModel.canUndo()) {
      markdownPreviewModel.undo()
    } else if (event.detail.command === 'redo' && markdownPreviewModel.canRedo()) {
      markdownPreviewModel.redo()
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

  private openFileLinkCompletion(): void {
    const editor = this.renderRoot.querySelector<MarkdownSourceEditor>('.source-editor')
    editor?.openFileLinkCompletion()
  }

  private completeFileLinks(query: string) {
    return markdownPreviewModel.completeFileLinks(query)
  }

  private getCurrentEditorSelection(): MarkdownImageInsertionSelection | undefined {
    const editor = this.renderRoot.querySelector<MarkdownSourceEditor>('.source-editor')
    if (!editor) {
      return undefined
    }

    return editor.getSelection()
  }

  private handleContentScroll(event: Event) {
    if (
      !(event.currentTarget instanceof HTMLElement) ||
      this.viewportCaptureFrame ||
      this.viewportRestoreInProgress
    ) {
      return
    }

    const ownerWindow = this.ownerDocument.defaultView
    if (!ownerWindow) {
      this.rememberRenderedViewportAnchor()
      return
    }

    this.viewportCaptureFrame = ownerWindow.requestAnimationFrame(() => {
      this.viewportCaptureFrame = 0
      this.rememberRenderedViewportAnchor()
    })
  }

  private rememberRenderedViewportAnchor(): void {
    const context = this.renderedViewportContext
    if (!context || this.viewportRestoreInProgress) {
      return
    }

    const anchor = this.captureViewportAnchorForMode(context.mode, {preferFocus: false})
    if (anchor) {
      markdownPreviewModel.rememberViewportAnchor(context.fileId, anchor)
    }
  }

  private captureActiveViewportAnchor(): MarkdownViewportAnchor | null {
    const editor = this.renderRoot.querySelector<MarkdownSourceEditor>('.source-editor')
    return editor?.captureViewportAnchor() ?? this.capturePreviewViewportAnchor()
  }

  private captureViewportAnchorForMode(
    mode: MarkdownPreviewMode,
    options: {preferFocus?: boolean} = {},
  ): MarkdownViewportAnchor | null {
    if (mode === 'edit') {
      return (
        this.renderRoot
          .querySelector<MarkdownSourceEditor>('.source-editor')
          ?.captureViewportAnchor({preferSelection: options.preferFocus !== false}) ?? null
      )
    }

    return this.capturePreviewViewportAnchor({preferFocusedElement: options.preferFocus !== false})
  }

  private capturePreviewViewportAnchor(
    options: {preferFocusedElement?: boolean} = {},
  ): MarkdownViewportAnchor | null {
    const preview = this.renderRoot.querySelector<HTMLElement>('.rendered-markdown')
    if (!preview) {
      return null
    }

    const previewRect = preview.getBoundingClientRect()
    const focusedElement =
      this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : this.ownerDocument.activeElement
    if (
      options.preferFocusedElement !== false &&
      focusedElement instanceof HTMLElement &&
      focusedElement !== preview &&
      preview.contains(focusedElement)
    ) {
      const sourceBlock = focusedElement.closest<HTMLElement>(
        '[data-source-line-start][data-source-line-end]',
      )
      const lines = sourceBlock ? this.readSourceLines(sourceBlock) : null
      if (lines) {
        const state = markdownPreviewModel.state()
        const source = state.kind === 'ready' ? state.source : ''
        return {
          sourceLine: lines.start,
          sourceOffset: getMarkdownSourceOffsetForLine(source, lines.start),
          viewportOffset: focusedElement.getBoundingClientRect().top - previewRect.top,
          kind: 'focused-element',
        }
      }
    }

    const sourceBlock = this.findPreviewSourceBlockAtTop(preview, previewRect)
    const lines = sourceBlock ? this.readSourceLines(sourceBlock) : null
    if (!sourceBlock || !lines) {
      return null
    }

    const blockRect = sourceBlock.getBoundingClientRect()
    const blockProgress =
      blockRect.height > 0
        ? Math.min(1, Math.max(0, (previewRect.top - blockRect.top) / blockRect.height))
        : 0
    const sourceLine = lines.start + (lines.end - lines.start) * blockProgress
    const state = markdownPreviewModel.state()
    const source = state.kind === 'ready' ? state.source : ''
    return {
      sourceLine,
      sourceOffset: this.getSourceOffsetForLinePosition(source, sourceLine),
      viewportOffset: 0,
      kind: 'viewport-top',
    }
  }

  private findPreviewSourceBlockAtTop(preview: HTMLElement, previewRect: DOMRect): HTMLElement | null {
    const xPositions = [previewRect.left + 8, previewRect.left + previewRect.width / 2]
    const yPositions = [previewRect.top + 1, previewRect.top + 8, previewRect.top + 24]
    const pointRoot = this.renderRoot instanceof ShadowRoot ? this.renderRoot : this.ownerDocument
    const elementsFromPoint = pointRoot.elementsFromPoint?.bind(pointRoot)

    if (elementsFromPoint) {
      for (const y of yPositions) {
        for (const x of xPositions) {
          for (const target of elementsFromPoint(x, y)) {
            if (!(target instanceof HTMLElement) || !preview.contains(target)) {
              continue
            }
            const sourceBlock = target.closest<HTMLElement>('[data-source-line-start][data-source-line-end]')
            if (sourceBlock && preview.contains(sourceBlock)) {
              return sourceBlock
            }
          }
        }
      }
    }

    let containingTop: {element: HTMLElement; span: number; area: number} | null = null
    let nextBlock: {element: HTMLElement; top: number} | null = null
    for (const element of preview.querySelectorAll<HTMLElement>(
      '[data-source-line-start][data-source-line-end]',
    )) {
      const lines = this.readSourceLines(element)
      if (!lines) {
        continue
      }

      const rect = element.getBoundingClientRect()
      if (rect.bottom <= previewRect.top || rect.top >= previewRect.bottom) {
        continue
      }

      if (rect.top <= previewRect.top + 1 && rect.bottom > previewRect.top + 1) {
        const candidate = {
          element,
          span: lines.end - lines.start,
          area: rect.width * rect.height,
        }
        if (
          !containingTop ||
          candidate.span < containingTop.span ||
          (candidate.span === containingTop.span && candidate.area < containingTop.area)
        ) {
          containingTop = candidate
        }
      } else if (rect.top >= previewRect.top && (!nextBlock || rect.top < nextBlock.top)) {
        nextBlock = {element, top: rect.top}
      }
    }

    return containingTop?.element ?? nextBlock?.element ?? null
  }

  private getSourceOffsetForLinePosition(source: string, sourceLine: number): number | null {
    const lineIndex = Math.max(0, Math.floor(sourceLine))
    const lineStart = getMarkdownSourceOffsetForLine(source, lineIndex)
    if (lineStart === null) {
      return null
    }

    const nextLineStart = getMarkdownSourceOffsetForLine(source, lineIndex + 1) ?? source.length
    const lineLength = Math.max(0, nextLineStart - lineStart - (nextLineStart < source.length ? 1 : 0))
    const lineProgress = Math.min(1, Math.max(0, sourceLine - lineIndex))
    return lineStart + Math.round(lineLength * lineProgress)
  }

  private createPreviewSelectionViewportAnchor(
    source: string,
    sourceOffset: number | null,
    point: Point | null,
  ): MarkdownViewportAnchor | null {
    if (sourceOffset === null) {
      return this.capturePreviewViewportAnchor()
    }

    const offset = Math.min(source.length, Math.max(0, sourceOffset))
    const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
    const lineEndIndex = source.indexOf('\n', offset)
    const lineEnd = lineEndIndex < 0 ? source.length : lineEndIndex
    const sourceLine = source.slice(0, lineStart).split('\n').length - 1
    const lineProgress = lineEnd > lineStart ? (offset - lineStart) / (lineEnd - lineStart) : 0
    const preview = this.renderRoot.querySelector<HTMLElement>('.rendered-markdown')
    const fallbackAnchor = this.capturePreviewViewportAnchor()

    return {
      sourceLine: sourceLine + lineProgress,
      sourceOffset: offset,
      viewportOffset:
        point && preview
          ? point.y - preview.getBoundingClientRect().top
          : (fallbackAnchor?.viewportOffset ?? 0),
      kind: 'selection',
    }
  }

  private handlePreviewClick(event: MouseEvent) {
    markdownPreviewModel.handleRenderedPreviewClick(event)
  }

  private handlePreviewKeyDown(event: KeyboardEvent) {
    markdownPreviewModel.handleRenderedPreviewKeyDown(event)
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
    this.commitPreviewDoubleTap(event, {x: event.clientX, y: event.clientY})
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
    if (state.kind !== 'ready' || state.mode !== 'preview' || state.readOnlyReasonKey || state.errorKey) {
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

    this.commitPreviewDoubleTap(event, point)
  }

  private isPreviewDoubleTapCandidate(sourceBlock: HTMLElement | null, point: Point, now: number): boolean {
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

  private commitPreviewDoubleTap(event: Event, point: Point | null = null): void {
    const latestState = markdownPreviewModel.state()
    if (
      latestState.kind !== 'ready' ||
      latestState.mode !== 'preview' ||
      latestState.readOnlyReasonKey ||
      latestState.errorKey
    ) {
      return
    }

    const selectionStart = this.resolvePreviewEditSelectionStart(event, point, latestState)
    const viewportAnchor = this.createPreviewSelectionViewportAnchor(
      latestState.source,
      selectionStart,
      point,
    )
    this.preventPreviewDefault(event)
    this.clearPreviewSelection()
    markdownPreviewModel.setMode('edit', {focusEditor: true, selectionStart, viewportAnchor})
  }

  private resolvePreviewEditSelectionStart(
    event: Event,
    point: Point | null,
    state: MarkdownPreviewReadyState,
  ): number | null {
    const eventPoint = point ?? this.readEventPoint(event)
    const sourceBlock = eventPoint ? this.findSourceBlock(event, eventPoint.x, eventPoint.y) : null
    if (!sourceBlock) {
      return null
    }

    return (
      this.resolvePreviewTextPositionSelectionStart(sourceBlock, eventPoint, state.source) ??
      this.resolveSourceBlockLineStart(sourceBlock, state.source)
    )
  }

  private resolvePreviewTextPositionSelectionStart(
    sourceBlock: HTMLElement,
    point: Point | null,
    source: string,
  ): number | null {
    const textPosition =
      this.getPreviewSelectionTextPosition(sourceBlock) ??
      (point ? this.getPreviewCaretPositionFromPoint(sourceBlock, point) : null)
    if (!textPosition) {
      return null
    }

    const renderedOffset = this.getTextOffsetInElement(sourceBlock, textPosition.node, textPosition.offset)
    if (renderedOffset === null) {
      return null
    }

    const renderedText = sourceBlock.textContent ?? ''
    const word = this.getRenderedWordAtOffset(renderedText, renderedOffset)
    if (!word) {
      return null
    }

    const sourceRange = this.getSourceBlockRange(sourceBlock, source)
    if (!sourceRange) {
      return null
    }

    const relativeOffset = this.resolveRenderedWordSourceOffset(sourceRange.text, renderedText, word)
    return relativeOffset === null ? null : sourceRange.start + relativeOffset
  }

  private readEventPoint(event: Event): Point | null {
    return event instanceof MouseEvent ? {x: event.clientX, y: event.clientY} : null
  }

  private getPreviewSelectionTextPosition(sourceBlock: HTMLElement): {node: Node; offset: number} | null {
    const shadowSelection = (this.renderRoot as SelectionRoot).getSelection?.()
    const documentSelection = this.ownerDocument.getSelection?.()
    const selections =
      shadowSelection === documentSelection ? [shadowSelection] : [shadowSelection, documentSelection]

    for (const selection of selections) {
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        continue
      }

      const range = selection.getRangeAt(0)
      if (this.isNodeInElement(sourceBlock, range.startContainer)) {
        return {node: range.startContainer, offset: range.startOffset}
      }
    }

    return null
  }

  private getPreviewCaretPositionFromPoint(
    sourceBlock: HTMLElement,
    point: Point,
  ): {node: Node; offset: number} | null {
    const ownerDocument = this.ownerDocument as CaretPointDocument
    const shadowRoots = this.renderRoot instanceof ShadowRoot ? [this.renderRoot] : undefined

    try {
      const position = ownerDocument.caretPositionFromPoint?.(point.x, point.y, {shadowRoots})
      if (position && this.isNodeInElement(sourceBlock, position.offsetNode)) {
        return {node: position.offsetNode, offset: position.offset}
      }
    } catch {
      const position = ownerDocument.caretPositionFromPoint?.(point.x, point.y)
      if (position && this.isNodeInElement(sourceBlock, position.offsetNode)) {
        return {node: position.offsetNode, offset: position.offset}
      }
    }

    const range = ownerDocument.caretRangeFromPoint?.(point.x, point.y)
    if (range && this.isNodeInElement(sourceBlock, range.startContainer)) {
      return {node: range.startContainer, offset: range.startOffset}
    }

    return null
  }

  private isNodeInElement(element: HTMLElement, node: Node): boolean {
    return node === element || element.contains(node)
  }

  private getTextOffsetInElement(element: HTMLElement, node: Node, offset: number): number | null {
    if (!this.isNodeInElement(element, node)) {
      return null
    }

    const range = this.ownerDocument.createRange()
    try {
      range.setStart(element, 0)
      range.setEnd(node, offset)
      return range.toString().length
    } catch {
      return null
    } finally {
      range.detach()
    }
  }

  private getRenderedWordAtOffset(
    renderedText: string,
    offset: number,
  ): {start: number; text: string} | null {
    if (!renderedText) {
      return null
    }

    let index = Math.min(renderedText.length - 1, Math.max(0, Math.floor(offset)))
    if (!this.isMarkdownWordChar(renderedText[index] ?? '') && index > 0) {
      index -= 1
    }
    if (!this.isMarkdownWordChar(renderedText[index] ?? '')) {
      return null
    }

    let start = index
    while (start > 0 && this.isMarkdownWordChar(renderedText[start - 1] ?? '')) {
      start -= 1
    }

    let end = index + 1
    while (end < renderedText.length && this.isMarkdownWordChar(renderedText[end] ?? '')) {
      end += 1
    }

    return {start, text: renderedText.slice(start, end)}
  }

  private isMarkdownWordChar(char: string): boolean {
    return /^[\p{L}\p{N}_-]$/u.test(char)
  }

  private getSourceBlockRange(
    sourceBlock: HTMLElement,
    source: string,
  ): {start: number; text: string} | null {
    const lines = this.readSourceLines(sourceBlock)
    if (!lines) {
      return null
    }

    const start = getMarkdownSourceOffsetForLine(source, lines.start)
    if (start === null) {
      return null
    }

    const end = getMarkdownSourceOffsetForLine(source, lines.end) ?? source.length
    return {start, text: source.slice(start, end)}
  }

  private resolveSourceBlockLineStart(sourceBlock: HTMLElement, source: string): number | null {
    const lines = this.readSourceLines(sourceBlock)
    return lines ? getMarkdownSourceOffsetForLine(source, lines.start) : null
  }

  private resolveRenderedWordSourceOffset(
    sourceText: string,
    renderedText: string,
    word: {start: number; text: string},
  ): number | null {
    const renderedStart = renderedText ? sourceText.indexOf(renderedText) : -1
    if (renderedStart >= 0) {
      return renderedStart + word.start
    }

    const candidates = this.findSourceWordCandidates(sourceText, word.text)
    if (candidates.length === 0) {
      return null
    }

    if (candidates.length === 1 || renderedText.length === 0) {
      return candidates[0] ?? null
    }

    const estimatedOffset = Math.round((word.start / renderedText.length) * sourceText.length)
    return candidates.reduce((closest, candidate) =>
      Math.abs(candidate - estimatedOffset) < Math.abs(closest - estimatedOffset) ? candidate : closest,
    )
  }

  private findSourceWordCandidates(sourceText: string, word: string): number[] {
    const candidates: number[] = []
    let index = sourceText.indexOf(word)
    while (index >= 0) {
      const before = index > 0 ? (sourceText[index - 1] ?? '') : ''
      const after = sourceText[index + word.length] ?? ''
      if (!this.isMarkdownWordChar(before) && !this.isMarkdownWordChar(after)) {
        candidates.push(index)
      }
      index = sourceText.indexOf(word, index + Math.max(1, word.length))
    }

    return candidates
  }

  private applyEditorFocusRequest(): boolean {
    const request = markdownPreviewModel.editorFocusRequest()
    if (!request || request.id === this.lastEditorFocusRequestId) {
      return false
    }

    const editor = this.renderRoot.querySelector<MarkdownSourceEditor>('.source-editor')
    if (!editor) {
      return false
    }

    this.lastEditorFocusRequestId = request.id
    this.applyEditorFocusSelection(editor, request.selectionStart)
    this.reapplyEditorFocusSelectionOnNextFrame(request.id, request.selectionStart)
    return true
  }

  private applyEditorFocusSelection(editor: MarkdownSourceEditor, selectionStart: number | null): void {
    editor.focusAt(selectionStart)
  }

  private reapplyEditorFocusSelectionOnNextFrame(requestId: number, selectionStart: number | null): void {
    const requestAnimationFrame = this.ownerDocument.defaultView?.requestAnimationFrame
    if (!requestAnimationFrame) {
      return
    }

    requestAnimationFrame.call(this.ownerDocument.defaultView, () => {
      if (!this.isConnected || markdownPreviewModel.editorFocusRequest()?.id !== requestId) {
        return
      }

      const editor = this.renderRoot.querySelector<MarkdownSourceEditor>('.source-editor')
      if (editor) {
        this.applyEditorFocusSelection(editor, selectionStart)
      }
    })
  }

  private applyAnchorScrollRequest(): boolean {
    const request = markdownPreviewModel.anchorScrollRequest()
    if (!request || request.id === this.lastAnchorScrollRequestId) {
      return false
    }

    const target = Array.from(this.renderRoot.querySelectorAll<HTMLElement>('[id]')).find(
      (element) => element.id === request.anchor,
    )
    if (!target) {
      return false
    }

    this.lastAnchorScrollRequestId = request.id
    target.scrollIntoView({block: 'start'})
    this.rememberRenderedViewportAnchor()
    return true
  }

  private applyRememberedViewportAnchor(state: MarkdownPreviewReadyState): void {
    const anchor = markdownPreviewModel.getViewportAnchor(state.fileId)
    if (!anchor) {
      return
    }

    this.beginViewportRestore()

    if (state.mode === 'preview') {
      const preview = this.renderRoot.querySelector<HTMLElement>('.rendered-markdown')
      if (preview) {
        this.restorePreviewViewportAnchor(preview, anchor)
      }
      return
    }

    const editor = this.renderRoot.querySelector<MarkdownSourceEditor>('.source-editor')
    if (!editor) {
      return
    }

    editor.restoreViewportAnchor(anchor)
    void editor.updateComplete.then(() => {
      const ownerWindow = this.ownerDocument.defaultView
      if (!ownerWindow) {
        return
      }

      if (this.editorViewportRestoreFrame) {
        ownerWindow.cancelAnimationFrame(this.editorViewportRestoreFrame)
      }
      this.editorViewportRestoreFrame = ownerWindow.requestAnimationFrame(() => {
        this.editorViewportRestoreFrame = 0
        const latestState = markdownPreviewModel.state()
        if (
          this.isConnected &&
          editor.isConnected &&
          latestState.kind === 'ready' &&
          latestState.fileId === state.fileId &&
          latestState.mode === 'edit'
        ) {
          this.beginViewportRestore()
          editor.restoreViewportAnchor(anchor)
        }
      })
    })
  }

  private beginViewportRestore(): void {
    const ownerWindow = this.ownerDocument.defaultView
    if (!ownerWindow) {
      return
    }

    if (this.viewportRestoreReleaseFrame) {
      ownerWindow.cancelAnimationFrame(this.viewportRestoreReleaseFrame)
    }
    this.viewportRestoreInProgress = true
    this.viewportRestoreReleaseFrame = ownerWindow.requestAnimationFrame(() => {
      this.viewportRestoreReleaseFrame = ownerWindow.requestAnimationFrame(() => {
        this.viewportRestoreReleaseFrame = 0
        this.viewportRestoreInProgress = false
      })
    })
  }

  private restorePreviewViewportAnchor(preview: HTMLElement, anchor: MarkdownViewportAnchor): boolean {
    const target = this.findPreviewSourceBlockForLine(preview, anchor.sourceLine)
    if (!target) {
      return false
    }

    const lines = this.readSourceLines(target)
    if (!lines) {
      return false
    }

    const previewRect = preview.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const sourceSpan = lines.end - lines.start
    const blockProgress =
      sourceSpan > 0 ? Math.min(1, Math.max(0, (anchor.sourceLine - lines.start) / sourceSpan)) : 0
    const targetY = targetRect.top + targetRect.height * blockProgress
    const scrollDelta = targetY - previewRect.top - anchor.viewportOffset
    if (Math.abs(scrollDelta) > 1) {
      preview.scrollTop += scrollDelta
    }
    return true
  }

  private findPreviewSourceBlockForLine(preview: HTMLElement, sourceLine: number): HTMLElement | null {
    let closest: {element: HTMLElement; span: number; area: number} | null = null
    let preceding: {element: HTMLElement; start: number} | null = null

    for (const element of preview.querySelectorAll<HTMLElement>(
      '[data-source-line-start][data-source-line-end]',
    )) {
      const lines = this.readSourceLines(element)
      if (!lines) {
        continue
      }

      if (lines.start <= sourceLine && lines.start >= (preceding?.start ?? -1)) {
        preceding = {element, start: lines.start}
      }

      if (
        sourceLine < lines.start ||
        (lines.end > lines.start ? sourceLine >= lines.end : sourceLine > lines.end)
      ) {
        continue
      }

      const rect = element.getBoundingClientRect()
      const candidate = {
        element,
        span: lines.end - lines.start,
        area: rect.width * rect.height,
      }
      if (
        !closest ||
        candidate.span < closest.span ||
        (candidate.span === closest.span && candidate.area < closest.area)
      ) {
        closest = candidate
      }
    }

    return closest?.element ?? preceding?.element ?? null
  }

  private observePreviewImageLayout(state: MarkdownPreviewReadyState): void {
    this.previewImageResizeObserver?.disconnect()
    this.previewImageResizeObserver = null
    if (state.mode !== 'preview' || typeof ResizeObserver === 'undefined') {
      return
    }

    const preview = this.renderRoot.querySelector<HTMLElement>('.rendered-markdown')
    const images = preview?.querySelectorAll<HTMLImageElement>('img.cv-markdown-image') ?? []
    if (!preview || images.length === 0) {
      return
    }

    this.previewImageResizeObserver = new ResizeObserver(() => {
      const latestState = markdownPreviewModel.state()
      if (
        latestState.kind === 'ready' &&
        latestState.fileId === state.fileId &&
        latestState.mode === 'preview'
      ) {
        this.applyRememberedViewportAnchor(latestState)
      }
    })
    for (const image of images) {
      this.previewImageResizeObserver.observe(image)
    }
  }

  private observeActiveViewportLayout(state: MarkdownPreviewReadyState | null): void {
    const viewportElement =
      state?.mode === 'edit' ? this.renderRoot.querySelector<MarkdownSourceEditor>('.source-editor') : null
    if (viewportElement === this.observedViewportElement) {
      return
    }

    this.activeViewportResizeObserver?.disconnect()
    this.activeViewportResizeObserver = null
    this.observedViewportElement = viewportElement
    if (!viewportElement || typeof ResizeObserver === 'undefined') {
      return
    }

    this.activeViewportResizeObserver = new ResizeObserver(() => {
      this.activeViewportResizeObserver?.disconnect()
      this.activeViewportResizeObserver = null
      const latestState = markdownPreviewModel.state()
      if (
        latestState.kind === 'ready' &&
        latestState.mode === 'edit' &&
        this.observedViewportElement === viewportElement
      ) {
        this.applyRememberedViewportAnchor(latestState)
      }
    })
    this.activeViewportResizeObserver.observe(viewportElement)
  }

  private clearPreviewSelection(): void {
    const shadowSelection = (this.renderRoot as SelectionRoot).getSelection?.()
    shadowSelection?.removeAllRanges()

    const documentSelection = this.ownerDocument.getSelection?.()
    if (documentSelection !== shadowSelection) {
      documentSelection?.removeAllRanges()
    }
  }

  private syncRenderedTaskCheckboxStates(): void {
    const state = markdownPreviewModel.state()
    if (state.kind !== 'ready' || state.mode !== 'preview') {
      return
    }

    const preview = this.renderRoot.querySelector<HTMLElement>('.rendered-markdown')
    if (!preview) {
      return
    }

    for (const checkbox of preview.querySelectorAll<HTMLElement>('[data-cv-task-line]')) {
      const line = Number.parseInt(checkbox.dataset['cvTaskLine'] ?? '', 10)
      if (!Number.isInteger(line) || line < 0) {
        continue
      }

      const checked = markdownPreviewModel.getTaskListItemCheckedAtLine(line)
      if (checked === null) {
        continue
      }

      const checkedValue = checked ? 'true' : 'false'
      checkbox.setAttribute('aria-checked', checkedValue)
      checkbox.setAttribute('aria-label', checked ? 'Completed task' : 'Incomplete task')
      checkbox.dataset['cvTaskChecked'] = checkedValue
    }
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
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
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
      <cv-button
        unstyled
        class="mode-button"
        type="button"
        aria-pressed=${currentMode === mode ? 'true' : 'false'}
        aria-label=${label}
        @pointerdown=${this.handleModePointerDown}
        @click=${mode === 'preview' ? this.handlePreviewModeClick : this.handleEditModeClick}
      >
        ${label}
      </cv-button>
    `
  }

  private renderEditorQuickButton(item: MarkdownQuickActionItem) {
    const label = i18n(item.labelKey)

    return html`
      <button
        class="editor-quick-button"
        type="button"
        data-quick-action=${item.action}
        ?disabled=${!markdownPreviewModel.canApplyMarkdownQuickAction()}
        aria-label=${label}
        @pointerdown=${this.handleQuickActionPointerDown}
        @pointerup=${this.handleQuickTextActionPointerUp}
        @pointercancel=${this.handleQuickActionPointerCancel}
        @click=${this.handleQuickTextActionClick}
      >
        <cv-icon name=${item.icon}></cv-icon>
        <span>${label}</span>
      </button>
    `
  }

  private renderEditorQuickOverflow() {
    const quickActionDisabled = !markdownPreviewModel.canApplyMarkdownQuickAction()

    return html`
      <cv-menu-button
        class="editor-quick-overflow"
        variant="ghost"
        preset="icon-overflow"
        aria-label=${i18n('markdown:quick-actions')}
        preserve-focus-on-pointer-open
        @cv-input=${this.handleQuickOverflow}
      >
        <span slot="prefix" class="editor-quick-overflow-trigger">
          <cv-icon name="three-dots"></cv-icon>
        </span>
        ${MARKDOWN_QUICK_OVERFLOW_ACTIONS.map(
          (item) => html`
            <cv-menu-item
              slot="menu"
              value=${item.action}
              class="editor-quick-menu-item"
              ?disabled=${quickActionDisabled}
            >
              <cv-icon slot="prefix" name=${item.icon}></cv-icon>
              ${i18n(item.labelKey)}
            </cv-menu-item>
          `,
        )}
        <cv-menu-item
          slot="menu"
          value="undo"
          class="editor-quick-menu-item"
          ?disabled=${!markdownPreviewModel.canUndo()}
        >
          <cv-icon slot="prefix" name="undo-2"></cv-icon>
          ${i18n('markdown:undo')}
        </cv-menu-item>
        <cv-menu-item
          slot="menu"
          value="redo"
          class="editor-quick-menu-item"
          ?disabled=${!markdownPreviewModel.canRedo()}
        >
          <cv-icon slot="prefix" name="redo-2"></cv-icon>
          ${i18n('markdown:redo')}
        </cv-menu-item>
      </cv-menu-button>
    `
  }

  private renderEditorQuickBar(state: MarkdownPreviewReadyState) {
    if (state.mode !== 'edit' || state.readOnlyReasonKey || state.errorKey) {
      return nothing
    }

    const imageLabel = i18n(
      markdownPreviewModel.imageAttaching() ? 'markdown:attaching-image' : 'markdown:insert-image',
    )
    const linkLabel = i18n('markdown:insert-link')

    return html`
      <div
        class="editor-quick-bar"
        role="toolbar"
        aria-label=${i18n('markdown:quick-actions')}
        data-mobile-keyboard-preserve
      >
        <div class="editor-quick-group" data-quick-action-group="insert">
          <button
            class="editor-quick-button"
            type="button"
            ?disabled=${!markdownPreviewModel.canInsertImage()}
            aria-label=${imageLabel}
            @pointerdown=${this.handleQuickActionPointerDown}
            @pointerup=${this.handleQuickInsertImagePointerUp}
            @pointercancel=${this.handleQuickActionPointerCancel}
            @click=${this.handleInsertImageClick}
          >
            ${markdownPreviewModel.imageAttaching()
              ? html`<cv-spinner size="xs" label=${imageLabel}></cv-spinner>`
              : html`<cv-icon name="image-plus"></cv-icon>`}
            <span>${imageLabel}</span>
          </button>
          <button
            class="editor-quick-button"
            type="button"
            ?disabled=${!markdownPreviewModel.canInsertFileLink()}
            aria-label=${linkLabel}
            @pointerdown=${this.handleQuickActionPointerDown}
            @pointerup=${this.handleQuickInsertLinkPointerUp}
            @pointercancel=${this.handleQuickActionPointerCancel}
            @click=${this.handleInsertLinkClick}
          >
            <cv-icon name="link"></cv-icon>
            <span>${linkLabel}</span>
          </button>
          ${this.renderEditorQuickButton(MARKDOWN_QUICK_TABLE_ACTION)}
        </div>
        <div class="editor-quick-group" data-quick-action-group="format">
          ${MARKDOWN_QUICK_FORMAT_ACTIONS.map((item) => this.renderEditorQuickButton(item))}
        </div>
        <div class="editor-quick-group" data-quick-action-group="overflow">
          ${this.renderEditorQuickOverflow()}
        </div>
      </div>
    `
  }

  private renderToolbar(state: MarkdownPreviewReadyState) {
    const formatLabel = this.getFormatLabel(state)
    const insertLinkLabel = i18n('markdown:insert-link')
    const insertImageLabel = i18n(
      markdownPreviewModel.imageAttaching() ? 'markdown:attaching-image' : 'markdown:insert-image',
    )
    const renameLabel = i18n(
      markdownDocumentRenameModel.state.renaming() ? 'markdown:renaming' : 'button:rename',
    )

    return html`
      <div class="toolbar">
        <div class="mode-control" role="group" aria-label=${i18n('markdown:mode-group')}>
          ${this.renderModeButton('preview', state.mode)} ${this.renderModeButton('edit', state.mode)}
        </div>
        <div class="action-group toolbar-actions">
          <cv-button
            unstyled
            class="action-button insert-link-action"
            type="button"
            ?disabled=${!markdownPreviewModel.canInsertFileLink()}
            aria-label=${insertLinkLabel}
            @click=${this.handleInsertLinkClick}
          >
            <cv-icon slot="prefix" name="link" size="s"></cv-icon>
            <span>${insertLinkLabel}</span>
          </cv-button>
          <cv-button
            unstyled
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
          <cv-button
            unstyled
            class="action-button"
            type="button"
            ?disabled=${!markdownPreviewModel.canUndo()}
            aria-label=${i18n('markdown:undo')}
            @click=${this.handleUndoClick}
          >
            <cv-icon slot="prefix" name="undo-2" size="s"></cv-icon>
            <span>${i18n('markdown:undo')}</span>
          </cv-button>
          <cv-button
            unstyled
            class="action-button"
            type="button"
            ?disabled=${!markdownPreviewModel.canRedo()}
            aria-label=${i18n('markdown:redo')}
            @click=${this.handleRedoClick}
          >
            <cv-icon slot="prefix" name="redo-2" size="s"></cv-icon>
            <span>${i18n('markdown:redo')}</span>
          </cv-button>
          <cv-button
            unstyled
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
          <cv-button
            unstyled
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
        <cv-callout
          class="markdown-status-callout"
          variant="warning"
          density="compact"
          role="status"
          aria-live="polite"
        >
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
        <markdown-source-editor
          class="source-editor"
          aria-label=${i18n('markdown:editor-label')}
          .source=${state.source}
          .fileLinkCompletionProvider=${this.completeFileLinks}
          .focusRequest=${markdownPreviewModel.editorFocusRequest()}
          .noteLinkCompletions=${markdownPreviewModel.noteLinkCompletions()}
          .selectionRequest=${markdownPreviewModel.editorSelectionRequest()}
          editor-label=${i18n('markdown:editor-label')}
          @dragover=${this.handleSourceDragOver}
          @drop=${this.handleSourceDrop}
          @input=${this.handleSourceInput}
          @markdown-source-command=${this.handleSourceCommand}
          @markdown-source-image-files=${this.handleSourceImageFiles}
          @markdown-source-input=${this.handleSourceInput}
          @markdown-source-selection=${this.handleSourceSelection}
          @paste=${this.handleSourcePaste}
          @scroll=${this.handleContentScroll}
        ></markdown-source-editor>
      `
    }

    return html`
      <div
        class="rendered-markdown"
        tabindex="0"
        aria-label=${i18n('markdown:preview-label')}
        @click=${this.handlePreviewClick}
        @keydown=${this.handlePreviewKeyDown}
        @scroll=${this.handleContentScroll}
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
            <cv-button
              unstyled
              class="action-button primary"
              type="button"
              @click=${this.handleDirtySaveClick}
            >
              <cv-icon slot="prefix" name="save" size="s"></cv-icon>
              <span>${i18n('markdown:dirty:save')}</span>
            </cv-button>
            <cv-button
              unstyled
              class="action-button warning"
              type="button"
              @click=${this.handleDirtyDiscardClick}
            >
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
    void markdownPreviewModel.anchorScrollRequest()

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
    const contentClass = state.mode === 'edit' ? 'content content--edit' : 'content'
    return html`
      <div class="markdown-preview" @keydown=${this.handleKeyboard}>
        ${this.renderToolbar(state)} ${this.renderStatus(state)}
        <div class=${contentClass}>${this.renderContent(state)}</div>
        ${this.renderEditorQuickBar(state)}
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
