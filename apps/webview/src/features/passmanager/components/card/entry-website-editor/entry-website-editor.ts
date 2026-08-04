import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVField} from '@chromvoid/uikit/components/cv-field'
import {CVInput, type CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {CVSelect, type CVSelectChangeEvent} from '@chromvoid/uikit/components/cv-select'
import {CVSelectOption} from '@chromvoid/uikit/components/cv-select-option'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'
import {repeat} from 'lit/directives/repeat.js'

import {i18n} from '@project/passmanager/i18n'
import type {UrlMatch} from '@project/passmanager/types'
import {isOpenableUrlRule} from '@project/passmanager/urls'

import {PMEntryWebsiteEditorModel, type PMEntryWebsiteEditorRow} from './entry-website-editor.model'

const MATCH_MODES: readonly UrlMatch[] = ['base_domain', 'host', 'starts_with', 'exact', 'regex', 'never']

const MATCH_LABELS = {
  base_domain: 'website:match:base_domain',
  host: 'website:match:host',
  starts_with: 'website:match:starts_with',
  exact: 'website:match:exact',
  regex: 'website:match:regex',
  never: 'website:match:never',
} as const

const MATCH_DESCRIPTIONS = {
  base_domain: 'website:match:base_domain_description',
  host: 'website:match:host_description',
  starts_with: 'website:match:starts_with_description',
  exact: 'website:match:exact_description',
  regex: 'website:match:regex_description',
  never: 'website:match:never_description',
} as const

export class PMEntryWebsiteEditor extends ReatomLitElement {
  static elementName = 'pm-entry-website-editor'

  static properties = {
    model: {attribute: false},
    disabled: {type: Boolean, reflect: true},
    contextDescription: {type: String, attribute: 'context-description'},
  }

  declare model: PMEntryWebsiteEditorModel
  declare disabled: boolean
  declare contextDescription: string

  constructor() {
    super()
    this.model = new PMEntryWebsiteEditorModel()
    this.disabled = false
    this.contextDescription = ''
  }

  static define(): void {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
    CVButton.define()
    CVField.define()
    CVInput.define()
    CVSelectOption.define()
    CVSelect.define()
  }

  static styles = [
    css`
      :host {
        display: block;
        container-type: inline-size;
      }

      fieldset {
        display: grid;
        min-inline-size: 0;
        margin: 0;
        padding: 0;
        border: 0;
        gap: var(--cv-space-3);
      }

      legend {
        padding: 0;
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
      }

      .description,
      .match-description {
        margin: 0;
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
        line-height: 1.45;
      }

      .context-description {
        display: block;
        margin-block-start: var(--cv-space-1);
      }

      .rows {
        display: grid;
      }

      .row {
        display: grid;
        min-inline-size: 0;
        padding-block: var(--cv-space-3);
        border-block-end: 1px solid var(--cv-color-border);
        gap: var(--cv-space-2);
      }

      .row:first-child {
        padding-block-start: 0;
      }

      .field-label {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--cv-space-2);
      }

      .primary-marker {
        color: var(--cv-color-primary);
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-semibold);
      }

      cv-input,
      cv-select {
        inline-size: 100%;
      }

      cv-select {
        --cv-select-inline-size: 100%;
      }

      details {
        min-inline-size: 0;
      }

      summary {
        inline-size: fit-content;
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
        cursor: pointer;
      }

      summary:hover {
        color: var(--cv-color-text);
      }

      summary:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 3px;
        border-radius: var(--cv-radius-xs);
      }

      .settings {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: end;
        gap: var(--cv-space-2);
        padding-block-start: var(--cv-space-2);
      }

      .match-description {
        grid-column: 1 / -1;
      }

      .row-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cv-space-2);
      }

      :host([disabled]) summary {
        pointer-events: none;
        opacity: 0.55;
      }

      @container (max-width: 30rem) {
        .settings {
          grid-template-columns: minmax(0, 1fr);
          align-items: stretch;
        }

        .settings cv-button {
          justify-self: start;
        }
      }
    `,
  ]

  focusFirstInvalid(): boolean {
    const rowId = this.model.firstInvalidRowId()
    if (!rowId) return false
    return this.focusRow(rowId)
  }

  focusFirst(): boolean {
    const rowId = this.model.rows()[0]?.id
    return rowId ? this.focusRow(rowId) : false
  }

  private focusRow(rowId: string): boolean {
    const input = this.shadowRoot?.querySelector<CVInput>(`cv-input[data-row-id="${rowId}"]`)
    input?.focus()
    return Boolean(input)
  }

  protected override render() {
    const rows = this.model.rows()
    const primaryRowId = this.model.primaryRowId()
    const errors = this.model.rowErrors()

    return html`
      <fieldset aria-describedby="entry-websites-description" ?disabled=${this.disabled}>
        <legend>${i18n('website:editor_title')}</legend>
        <p id="entry-websites-description" class="description">
          ${i18n('website:description')}
          ${this.contextDescription
            ? html`<span class="context-description">${this.contextDescription}</span>`
            : nothing}
        </p>
        <div class="rows">
          ${repeat(
            rows,
            (row) => row.id,
            (row, index) => this.renderRow(row, index, row.id === primaryRowId, errors[row.id] ?? ''),
          )}
        </div>
        <cv-button
          type="button"
          size="small"
          variant="default"
          ?disabled=${this.disabled}
          @click=${this.handleAdd}
        >
          ${i18n('website:add')}
        </cv-button>
      </fieldset>
    `
  }

  private renderRow(row: PMEntryWebsiteEditorRow, index: number, isPrimary: boolean, error: string) {
    const label = isPrimary ? i18n('website:primary_label') : `${i18n('website:item')} ${index + 1}`
    return html`
      <div class="row" role="group" aria-label=${label}>
        <cv-field ?invalid=${Boolean(error)}>
          <span slot="label" class="field-label">
            ${label}
            ${isPrimary
              ? html`<span class="primary-marker">${i18n('website:primary_marker')}</span>`
              : nothing}
          </span>
          <cv-input
            data-row-id=${row.id}
            inputmode=${row.match === 'regex' ? nothing : 'url'}
            autocomplete="url"
            .value=${row.value}
            placeholder=${row.match === 'regex'
              ? i18n('website:regex_placeholder')
              : i18n('website:placeholder')}
            ?disabled=${this.disabled}
            ?invalid=${Boolean(error)}
            @cv-input=${this.handleValueInput}
            @cv-blur=${this.handleBlur}
            @paste=${this.handlePaste}
          ></cv-input>
          ${error ? html`<span slot="error">${error}</span>` : nothing}
        </cv-field>
        <details>
          <summary tabindex=${this.disabled ? -1 : nothing}>${i18n('website:settings')}</summary>
          <div class="settings">
            <cv-field>
              <span slot="label">${i18n('website:match_title')}</span>
              <cv-select
                data-row-id=${row.id}
                .value=${row.match}
                ?disabled=${this.disabled}
                @cv-change=${this.handleMatchChange}
              >
                ${MATCH_MODES.map(
                  (match) => html`
                    <cv-select-option .value=${match}>${i18n(MATCH_LABELS[match])}</cv-select-option>
                  `,
                )}
              </cv-select>
            </cv-field>
            ${isOpenableUrlRule(row) && !isPrimary
              ? html`
                  <cv-button
                    data-row-id=${row.id}
                    type="button"
                    size="small"
                    variant="default"
                    ?disabled=${this.disabled}
                    @click=${this.handleMakePrimary}
                  >
                    ${i18n('website:make_primary')}
                  </cv-button>
                `
              : nothing}
            <p class="match-description">${i18n(MATCH_DESCRIPTIONS[row.match])}</p>
          </div>
        </details>
        <div class="row-actions">
          <cv-button
            data-row-id=${row.id}
            type="button"
            size="small"
            variant="ghost"
            ?disabled=${this.disabled}
            @click=${this.handleRemove}
          >
            ${i18n('website:remove')}
          </cv-button>
        </div>
      </div>
    `
  }

  private rowIdFromEvent(event: Event): string {
    return (event.currentTarget as HTMLElement).dataset['rowId'] ?? ''
  }

  private handleValueInput(event: CVInputInputEvent): void {
    this.model.updateValue(this.rowIdFromEvent(event), event.detail.value)
  }

  private handleBlur(event: Event): void {
    this.model.markTouched(this.rowIdFromEvent(event))
  }

  private handlePaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (this.model.pasteMultiline(this.rowIdFromEvent(event), text)) {
      event.preventDefault()
    }
  }

  private handleMatchChange(event: CVSelectChangeEvent): void {
    const match = event.detail.value
    if (!match || !MATCH_MODES.includes(match as UrlMatch)) return
    this.model.updateMatch(this.rowIdFromEvent(event), match as UrlMatch)
  }

  private handleMakePrimary(event: Event): void {
    this.model.makePrimary(this.rowIdFromEvent(event))
  }

  private handleRemove(event: Event): void {
    this.model.remove(this.rowIdFromEvent(event))
  }

  private handleAdd(): void {
    this.model.add()
  }
}
