import {html, ReatomLitElement, watch} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'

import {markdownDocumentRenameModel} from '../models/markdown-document-rename.model'
import type {MarkdownPreviewData} from '../models/markdown-preview.model'

export class MarkdownDocumentPage extends ReatomLitElement {
  static define() {
    if (!customElements.get('markdown-document-page')) {
      customElements.define('markdown-document-page', this as unknown as CustomElementConstructor)
    }
  }

  static get properties() {
    return {
      data: {type: Object},
      pending: {type: Boolean},
    }
  }

  declare data: MarkdownPreviewData | null
  declare pending: boolean
  private readonly keyboardHandler = this.handleKeyboard.bind(this)
  private titleRenameFocused = false

  static styles = [
    css`
      :host {
        display: block;
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 0;
        color: var(--cv-color-text);
      }

      .page {
        box-sizing: border-box;
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 0;
        display: flex;
        flex-direction: column;
        gap: var(--app-spacing-4);
        padding: var(--app-spacing-5);
      }

      .header {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: var(--app-spacing-3);
        min-inline-size: 0;
      }

      .back-button {
        flex: 0 0 auto;
        inline-size: 40px;
        block-size: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-tertiary-glass);
        color: var(--cv-color-text);
        cursor: pointer;
      }

      .back-button:focus-visible {
        outline: 2px solid var(--cv-color-accent);
        outline-offset: 2px;
      }

      .title-wrap {
        flex: 1 1 auto;
        min-inline-size: 0;
        display: grid;
        gap: 3px;
      }

      .eyebrow {
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-semibold);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .title {
        overflow: hidden;
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-xl);
        font-weight: var(--cv-font-weight-semibold);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .title-button {
        box-sizing: border-box;
        min-inline-size: 0;
        max-inline-size: 100%;
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        border: 0;
        border-radius: var(--cv-radius-2);
        padding: 2px 4px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        text-align: start;
      }

      .title-button:focus-visible {
        outline: 2px solid var(--cv-color-accent);
        outline-offset: 2px;
      }

      .title-button .title {
        min-inline-size: 0;
      }

      .title-button cv-icon {
        flex: 0 0 auto;
        color: var(--cv-color-text-muted);
      }

      .title-form {
        min-inline-size: 0;
        display: grid;
        gap: 4px;
      }

      .title-input-row {
        min-inline-size: 0;
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
      }

      .title-input {
        box-sizing: border-box;
        inline-size: min(420px, 100%);
        min-inline-size: 0;
        border: 1px solid var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface);
        color: var(--cv-color-text);
        padding: 5px 8px;
        font: inherit;
        font-size: var(--cv-font-size-xl);
        font-weight: var(--cv-font-weight-semibold);
      }

      .title-input:focus {
        outline: none;
      }

      .title-input:focus-visible {
        border-color: var(--cv-color-accent);
        box-shadow: 0 0 0 2px var(--cv-color-accent-ring);
      }

      .title-input[aria-invalid='true'] {
        border-color: var(--cv-color-danger);
      }

      .title-spinner {
        flex: 0 0 auto;
      }

      .title-error {
        color: var(--cv-color-danger);
        font-size: var(--cv-font-size-xs);
        line-height: 1.3;
      }

      .body {
        flex: 1;
        min-block-size: 0;
        display: grid;
      }

      .pending {
        min-block-size: 320px;
        display: grid;
        place-items: center;
        gap: var(--app-spacing-3);
        color: var(--cv-color-text-muted);
      }

      @media (max-width: 720px) {
        .page {
          padding-inline: 0;
          padding-block-start: var(--app-spacing-3);
          padding-block-end: 0;
          gap: var(--app-spacing-3);
        }

        .header {
          display: none;
        }

        .title {
          font-size: var(--cv-font-size-lg);
        }
      }
    `,
  ]

  constructor() {
    super()
    this.data = null
    this.pending = false
  }

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener('keydown', this.keyboardHandler)
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.keyboardHandler)
    markdownDocumentRenameModel.reset()
    super.disconnectedCallback()
  }

  protected updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (changedProperties.has('data')) {
      markdownDocumentRenameModel.cancelInlineRename()
    }

    const editing = markdownDocumentRenameModel.state.editing()
    if (editing && !this.titleRenameFocused) {
      const input = this.renderRoot.querySelector<HTMLInputElement>('.title-input')
      input?.focus()
      input?.select()
    }
    this.titleRenameFocused = editing
  }

  private handleClose() {
    this.dispatchEvent(new CustomEvent('close', {bubbles: true, composed: true}))
  }

  private handleKeyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      this.handleClose()
    }
  }

  private handleTitleRenameClick() {
    const title = this.data?.fileName
    if (title) {
      markdownDocumentRenameModel.startInlineRename(title)
    }
  }

  private handleTitleInput(event: InputEvent) {
    const target = event.target as HTMLInputElement | null
    markdownDocumentRenameModel.updateDraftName(target?.value ?? '')
  }

  private handleTitleSubmit(event: SubmitEvent) {
    event.preventDefault()
    void markdownDocumentRenameModel.commitInlineRename(this.data)
  }

  private handleTitleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') {
      return
    }

    event.stopPropagation()
    markdownDocumentRenameModel.cancelInlineRename()
  }

  private handleTitleBlur() {
    if (!markdownDocumentRenameModel.state.editing()) {
      return
    }

    void markdownDocumentRenameModel.commitInlineRename(this.data)
  }

  private renderTitle(title: string) {
    if (markdownDocumentRenameModel.state.editing()) {
      const validationError = markdownDocumentRenameModel.state.validationError()
      const renaming = markdownDocumentRenameModel.state.renaming()

      return html`
        <form class="title-form" @submit=${this.handleTitleSubmit}>
          <div class="title-input-row">
            <input
              class="title-input"
              type="text"
              .value=${watch(markdownDocumentRenameModel.state.draftName)}
              ?disabled=${renaming}
              aria-label=${i18n('markdown:rename-label' as never)}
              aria-invalid=${validationError ? 'true' : 'false'}
              @input=${this.handleTitleInput}
              @keydown=${this.handleTitleKeydown}
              @blur=${this.handleTitleBlur}
            />
            ${renaming
              ? html`<cv-spinner class="title-spinner" size="xs" label=${i18n('markdown:renaming' as never)}></cv-spinner>`
              : nothing}
          </div>
          ${validationError ? html`<div class="title-error" role="alert">${validationError}</div>` : nothing}
        </form>
      `
    }

    const label = i18n('markdown:rename' as never)
    return html`
      <button
        class="title-button"
        type="button"
        aria-label=${label}
        title=${label}
        ?disabled=${!markdownDocumentRenameModel.state.canRename()}
        @click=${this.handleTitleRenameClick}
      >
        <span class="title">${title}</span>
        <cv-icon name="pencil" size="xs" aria-hidden="true"></cv-icon>
      </button>
    `
  }

  private renderBody() {
    if (this.pending) {
      return html`
        <div class="pending" role="status" aria-live="polite">
          <cv-spinner size="m" label=${i18n('loading')}></cv-spinner>
        </div>
      `
    }

    if (!this.data) {
      return nothing
    }

    return html`<markdown-preview .data=${this.data} @close=${this.handleClose}></markdown-preview>`
  }

  protected render() {
    const title = this.data?.fileName ?? i18n('loading')

    return html`
      <section class="page" aria-label=${title}>
        <header class="header">
          <cv-button unstyled class="back-button" type="button" @click=${this.handleClose} aria-label=${i18n('button:back')}>
            <cv-icon name="arrow-left" size="s"></cv-icon>
          </cv-button>
          <div class="title-wrap">
            <div class="eyebrow">Markdown</div>
            ${this.renderTitle(title)}
          </div>
        </header>
        <div class="body">${this.renderBody()}</div>
      </section>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'markdown-document-page': MarkdownDocumentPage
  }
}
