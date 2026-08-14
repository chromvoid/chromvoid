import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVField} from '@chromvoid/uikit/components/cv-field'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVInput, type CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {CVSelect, type CVSelectChangeEvent} from '@chromvoid/uikit/components/cv-select'
import {CVSelectOption} from '@chromvoid/uikit/components/cv-select-option'
import {createAfterRenderScheduler, html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'
import {repeat} from 'lit/directives/repeat.js'

import {i18n} from '@project/passmanager/i18n'
import type {UrlMatch} from '@project/passmanager/types'

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

type PMEntryWebsiteEditorControlSize = 'medium' | 'large'
type PMEntryWebsiteEditorPresentation = 'stacked' | 'workbench'

export class PMEntryWebsiteEditor extends ReatomLitElement {
  static elementName = 'pm-entry-website-editor'

  static properties = {
    model: {attribute: false},
    disabled: {type: Boolean, reflect: true},
    contextDescription: {type: String, attribute: 'context-description'},
    controlSize: {type: String, attribute: 'control-size', reflect: true},
    presentation: {type: String, reflect: true},
  }

  declare model: PMEntryWebsiteEditorModel
  declare disabled: boolean
  declare contextDescription: string
  declare controlSize: PMEntryWebsiteEditorControlSize
  declare presentation: PMEntryWebsiteEditorPresentation

  private readonly afterRenderScheduler = createAfterRenderScheduler(this)

  constructor() {
    super()
    this.model = new PMEntryWebsiteEditorModel()
    this.disabled = false
    this.contextDescription = ''
    this.controlSize = 'medium'
    this.presentation = 'stacked'
  }

  static define(): void {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
    CVButton.define()
    CVField.define()
    CVIcon.define()
    CVInput.define()
    CVSelectOption.define()
    CVSelect.define()
  }

  static styles = [
    css`
      :host {
        display: block;
        container: website-editor / inline-size;
      }

      fieldset {
        display: grid;
        min-inline-size: 0;
        margin: 0;
        padding: 0;
        border: 0;
        gap: var(--cv-space-2);
      }

      .editor-body {
        display: grid;
        min-inline-size: 0;
        gap: var(--cv-space-2);
      }

      legend {
        padding: 0;
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
        line-height: 1.3;
        margin-block-end: var(--cv-space-1);
      }

      .context-description {
        margin: 0;
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
        line-height: 1.45;
      }

      .rows {
        display: grid;
        min-inline-size: 0;
        gap: var(--cv-space-2);
      }

      .row {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
        min-inline-size: 0;
        gap: var(--cv-space-2);
      }

      .row.removable {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      cv-input,
      cv-select {
        inline-size: 100%;
      }

      cv-select {
        --cv-select-inline-size: 100%;
      }

      :host([control-size='large']) cv-input {
        --cv-input-border-radius: var(--cv-radius-2);
        --cv-input-border-color: var(--cv-color-border-muted);
        --cv-input-background: var(--cv-color-surface-2);
        --cv-input-placeholder-color: var(--cv-color-text-subtle);
      }

      :host([control-size='large']) cv-select {
        --cv-select-border-radius: var(--cv-radius-2);
        --cv-select-background: var(--cv-color-surface-2);
      }

      .remove-website {
        inline-size: 36px;
        --cv-button-padding-inline: 0;
        --cv-button-text-color: var(--cv-color-text-muted);
      }

      .remove-website::part(base) {
        border-color: var(--cv-color-border);
        background: var(--cv-color-surface);
      }

      .remove-website:hover::part(base) {
        border-color: var(--cv-color-danger-border, var(--cv-color-danger));
        background: var(--cv-color-danger-surface, var(--cv-color-surface-highlight));
        color: var(--cv-color-danger);
      }

      .remove-website::part(base):focus-visible {
        outline: 2px solid var(--cv-color-danger);
        outline-offset: 2px;
      }

      .remove-website cv-icon {
        font-size: 16px;
      }

      :host([control-size='large']) .remove-website {
        inline-size: 44px;
      }

      :host([control-size='large']) .remove-website::part(base) {
        min-block-size: 44px;
        border-color: var(--cv-color-border-muted);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-2);
      }

      .add-website {
        justify-self: start;
        margin-block-start: var(--cv-space-1);
      }

      .advanced-settings {
        min-inline-size: 0;
        margin-block-start: var(--cv-space-2);
      }

      .advanced-settings summary {
        display: flex;
        align-items: center;
        min-block-size: 36px;
        inline-size: 100%;
        box-sizing: border-box;
        gap: var(--cv-space-2);
        padding: var(--cv-space-2) var(--cv-space-3);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-sm);
        background: var(--cv-color-surface);
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-sm);
        cursor: pointer;
        list-style: none;
      }

      .advanced-settings summary::-webkit-details-marker {
        display: none;
      }

      .advanced-settings summary:hover,
      .advanced-settings[open] summary {
        border-color: var(--cv-color-border-strong);
        color: var(--cv-color-text);
      }

      .advanced-settings summary:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 2px;
      }

      .advanced-settings[open] summary {
        border-end-start-radius: 0;
        border-end-end-radius: 0;
      }

      .advanced-summary-label {
        flex: 1 1 auto;
        min-inline-size: 0;
        font-weight: var(--cv-font-weight-medium);
      }

      .advanced-summary-icon,
      .advanced-summary-chevron {
        flex: 0 0 auto;
        font-size: 16px;
      }

      .advanced-summary-chevron {
        color: var(--cv-color-text-muted);
      }

      .advanced-settings[open] .advanced-summary-chevron {
        transform: rotate(180deg);
      }

      .advanced-list {
        display: grid;
        min-inline-size: 0;
        border: 1px solid var(--cv-color-border-strong);
        border-block-start: 0;
        border-end-start-radius: var(--cv-radius-sm);
        border-end-end-radius: var(--cv-radius-sm);
        background: var(--cv-color-surface-2);
        overflow: hidden;
      }

      .match-rule {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(9rem, 40%);
        align-items: center;
        min-inline-size: 0;
        gap: var(--cv-space-3);
        padding: var(--cv-space-3);
      }

      .match-rule + .match-rule {
        border-block-start: 1px solid var(--cv-color-border);
      }

      .match-rule-copy {
        display: grid;
        min-inline-size: 0;
        gap: var(--cv-space-1);
      }

      .match-rule-website {
        overflow: hidden;
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-medium);
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .match-rule-description {
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
        line-height: 1.35;
      }

      :host([disabled]) .advanced-settings summary {
        pointer-events: none;
        opacity: 0.55;
      }

      :host([presentation='workbench']) fieldset {
        grid-template-columns: var(
          --pm-entry-workbench-field-columns,
          8rem minmax(0, 1fr)
        );
        align-items: start;
        column-gap: var(--pm-entry-workbench-column-gap, var(--cv-space-4));
        row-gap: var(--pm-entry-workbench-field-row-gap, 0px);
      }

      :host([presentation='workbench']) legend {
        display: flex;
        align-items: center;
        min-block-size: var(--pm-entry-workbench-label-min-block-size, 36px);
        margin: 0;
        color: var(--cv-color-text-secondary);
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-medium);
      }

      :host([presentation='workbench']) .editor-body {
        grid-column: var(--pm-entry-workbench-control-column, 2);
      }

      @container website-editor (width < 420px) {
        .match-rule {
          grid-template-columns: minmax(0, 1fr);
          gap: var(--cv-space-2);
        }
      }
    `,
  ]

  override disconnectedCallback(): void {
    this.afterRenderScheduler.cancel()
    super.disconnectedCallback()
  }

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
    const errors = this.model.rowErrors()
    const descriptionId = this.contextDescription ? 'entry-websites-description' : nothing

    return html`
      <fieldset aria-describedby=${descriptionId} ?disabled=${this.disabled}>
        <legend>${i18n('website:editor_title')}</legend>
        <div class="editor-body">
          ${this.contextDescription
            ? html`<p id="entry-websites-description" class="context-description">
                ${this.contextDescription}
              </p>`
            : nothing}
          <div class="rows">
            ${repeat(
              rows,
              (row) => row.id,
              (row, index) => this.renderRow(row, index, errors[row.id] ?? ''),
            )}
          </div>
          <cv-button
            class="add-website"
            type="button"
            size="small"
            variant="default"
            outline
            ?disabled=${this.disabled}
            @click=${this.handleAdd}
          >
            <cv-icon slot="prefix" name="plus" aria-hidden="true"></cv-icon>
            ${i18n('website:add')}
          </cv-button>
          ${this.model.hasAdvancedMatching() ? this.renderAdvancedSettings(rows) : nothing}
        </div>
      </fieldset>
    `
  }

  private renderRow(row: PMEntryWebsiteEditorRow, index: number, error: string) {
    const label = this.getRowLabel(index)
    return html`
      <div class=${index > 0 ? 'row removable' : 'row'} role="group" aria-label=${label}>
        <cv-field ?invalid=${Boolean(error)}>
          <cv-input
            data-row-id=${row.id}
            .size=${this.controlSize}
            aria-label=${label}
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
        ${index > 0
          ? html`
              <cv-button
                class="remove-website"
                data-row-id=${row.id}
                type="button"
                variant="ghost"
                title=${i18n('website:remove')}
                aria-label=${`${i18n('website:remove')}: ${label}`}
                ?disabled=${this.disabled}
                @click=${this.handleRemove}
              >
                <cv-icon name="trash" aria-hidden="true"></cv-icon>
              </cv-button>
            `
          : nothing}
      </div>
    `
  }

  private renderAdvancedSettings(rows: readonly PMEntryWebsiteEditorRow[]) {
    return html`
      <details class="advanced-settings">
        <summary tabindex=${this.disabled ? -1 : nothing}>
          <cv-icon class="advanced-summary-icon" name="sliders" aria-hidden="true"></cv-icon>
          <span class="advanced-summary-label">${i18n('website:settings')}</span>
          <cv-icon class="advanced-summary-chevron" name="chevron-down" aria-hidden="true"></cv-icon>
        </summary>
        <div class="advanced-list">
          ${rows.map(
            (row, index) => {
              const label = this.getRowLabel(index)
              const descriptionId = `website-match-description-${row.id}`
              return html`
                <div class="match-rule">
                  <div class="match-rule-copy">
                    <span class="match-rule-website" dir="ltr" title=${row.value || label}
                      >${row.value || label}</span
                    >
                    <span id=${descriptionId} class="match-rule-description"
                      >${i18n(MATCH_DESCRIPTIONS[row.match])}</span
                    >
                  </div>
                  <cv-select
                    data-row-id=${row.id}
                    .size=${this.controlSize}
                    aria-label=${`${label}: ${i18n('website:match_title')}`}
                    aria-describedby=${descriptionId}
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
                </div>
              `
            },
          )}
        </div>
      </details>
    `
  }

  private getRowLabel(index: number): string {
    return index === 0 ? i18n('website:title') : `${i18n('website:item')} ${index + 1}`
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

  private handleRemove(event: Event): void {
    const focusRowId = this.model.remove(this.rowIdFromEvent(event))
    if (focusRowId) this.scheduleRowFocus(focusRowId)
  }

  private handleAdd(): void {
    this.scheduleRowFocus(this.model.add())
  }

  private scheduleRowFocus(rowId: string): void {
    this.afterRenderScheduler.schedule(() => this.focusRow(rowId))
  }
}
