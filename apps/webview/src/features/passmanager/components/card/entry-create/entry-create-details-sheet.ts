import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVTextarea, type CVTextareaInputEvent} from '@chromvoid/uikit/components/cv-textarea'
import {createAfterRenderScheduler, html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {pmCredentialTagsModel} from 'root/features/passmanager/models/pm-credential-tags.model'
import {isPassmanagerReadOnlyOrMissing} from 'root/features/passmanager/models/pm-root.adapter'
import {PMIconPickerInline} from '../../pm-icon-picker.inline'
import {PMEntryOTPCreate} from '../entry-otp-create/entry-otp-create'
import {
  getSelectedTagIdsFromEvent,
  renderEntryTagsEditor,
} from '../entry-tags/entry-tags-editor'
import {pmEntryTagsStyles} from '../entry-tags/entry-tags.styles'
import {
  PMEntryCreateModel,
  type PMEntryCreateDetailsView,
  type PMEntryCreateOptionalDetail,
} from './entry-create.model'

const DETAIL_PRESENTATION: Record<
  PMEntryCreateOptionalDetail,
  {icon: string; labelKey: string; descriptionKey: string}
> = {
  icon: {
    icon: 'image',
    labelKey: 'entry:create:detail-icon',
    descriptionKey: 'entry:create:detail-icon-description',
  },
  tags: {
    icon: 'tag',
    labelKey: 'tags:title',
    descriptionKey: 'entry:create:detail-tags-description',
  },
  otp: {
    icon: 'shield-check',
    labelKey: 'entry:create:detail-otp',
    descriptionKey: 'otp:description',
  },
  note: {
    icon: 'sticky-note',
    labelKey: 'note:use',
    descriptionKey: 'note:description',
  },
}

const detailsSheetStyles = css`
  :host {
    display: contents;
  }

  cv-bottom-sheet {
    --cv-bottom-sheet-middle-height: min(72dvh, 600px);
    --cv-bottom-sheet-header-padding: 0 var(--cv-space-4) var(--cv-space-3);
  }

  cv-bottom-sheet::part(body) {
    padding: 0 var(--cv-space-4) var(--cv-space-4);
  }

  cv-bottom-sheet::part(footer) {
    padding: 0 var(--cv-space-4) max(var(--cv-space-4), env(safe-area-inset-bottom));
    border-block-start: 1px solid var(--cv-color-border-muted);
    background: var(--cv-color-surface);
  }

  .detail-list {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface-2);
  }

  .detail-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--cv-space-3);
    min-block-size: 68px;
    padding: var(--cv-space-3);
    border: 0;
    border-block-end: 1px solid var(--cv-color-border);
    color: var(--cv-color-text);
    background: transparent;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .detail-row:last-child {
    border-block-end: 0;
  }

  .detail-row:hover {
    background: var(--cv-color-surface-highlight);
  }

  .detail-row:focus-visible,
  .back-action:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: -2px;
  }

  .detail-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--cv-radius-2);
    color: var(--cv-color-primary);
    background: var(--cv-color-primary-surface);
  }

  .detail-copy {
    display: grid;
    gap: 3px;
    min-inline-size: 0;
  }

  .detail-label {
    color: var(--cv-color-text-strong);
    font-weight: var(--cv-font-weight-semibold);
  }

  .detail-status {
    overflow: hidden;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-trailing {
    display: inline-flex;
    align-items: center;
    gap: var(--cv-space-2);
    color: var(--cv-color-text-muted);
  }

  .configured-mark {
    color: var(--cv-color-success);
  }

  .detail-editor {
    display: grid;
    gap: var(--cv-space-4);
    min-block-size: 0;
  }

  .back-action {
    display: inline-flex;
    align-items: center;
    gap: var(--cv-space-2);
    justify-self: start;
    min-block-size: 44px;
    padding: 0 var(--cv-space-2);
    border: 0;
    border-radius: var(--cv-radius-2);
    color: var(--cv-color-primary);
    background: transparent;
    font: inherit;
    font-weight: var(--cv-font-weight-semibold);
    cursor: pointer;
  }

  cv-textarea,
  pm-icon-picker-inline,
  pm-entry-otp-create {
    inline-size: 100%;
  }

  cv-textarea::part(textarea) {
    min-block-size: 180px;
  }

  .sheet-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--cv-space-2);
    inline-size: 100%;
    padding-block-start: var(--cv-space-3);
  }

  .sheet-actions.has-remove {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sheet-actions cv-button::part(base) {
    inline-size: 100%;
    min-block-size: 48px;
  }

  @supports (-webkit-touch-callout: none) {
    cv-textarea::part(textarea) {
      font-size: 16px;
    }
  }
`

export class PMEntryCreateDetailsSheet extends ReatomLitElement {
  static elementName = 'pm-entry-create-details-sheet' as const

  static properties = {
    model: {attribute: false},
  }

  static styles = [pmEntryTagsStyles, detailsSheetStyles]

  declare model: PMEntryCreateModel

  private readonly afterRenderScheduler = createAfterRenderScheduler(this)

  constructor() {
    super()
    this.model = new PMEntryCreateModel()
  }

  static define() {
    CVBottomSheet.define()
    CVButton.define()
    CVTextarea.define()
    PMEntryOTPCreate.define()
    PMIconPickerInline.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override disconnectedCallback(): void {
    this.afterRenderScheduler.cancel()
    super.disconnectedCallback()
  }

  private handleSheetChange(event: CustomEvent<{open?: boolean}>): void {
    if (event.target !== event.currentTarget || event.detail.open !== false) return
    this.model.closeDetailsSheet()
  }

  private handleDetailClick(event: MouseEvent): void {
    const detail = (event.currentTarget as HTMLElement | null)?.dataset['detail'] as
      | PMEntryCreateOptionalDetail
      | undefined
    if (!detail) return
    this.model.openDetailsEditor(detail)
    this.afterRenderScheduler.schedule(() => this.focusBackAction())
  }

  private handleBack(): void {
    const detail = this.getActiveDetail()
    this.model.closeDetailsEditor()
    if (detail) {
      this.afterRenderScheduler.schedule(() => this.focusDetailRow(detail))
    }
  }

  private async handleDone(): Promise<void> {
    const detail = this.getActiveDetail()
    if (!detail) {
      this.model.closeDetailsSheet()
      return
    }

    if (detail === 'otp' && !(await this.model.confirmOtpEditor())) return
    if (detail !== 'otp') this.model.closeDetailsEditor()
    this.afterRenderScheduler.schedule(() => this.focusDetailRow(detail))
  }

  private async handleRemove(): Promise<void> {
    const detail = this.getActiveDetail()
    if (!detail || !(await this.model.requestRemoveOptionalDetail(detail))) return
    this.afterRenderScheduler.schedule(() => this.focusDetailRow(detail))
  }

  private handleIconChange(event: CustomEvent<{iconRef: string | undefined}>): void {
    this.model.setIconRef(event.detail.iconRef)
  }

  private handleTagsSelect(event: Event): void {
    this.model.setTagsFromKeys(getSelectedTagIdsFromEvent(event))
  }

  private handleNoteInput(event: CVTextareaInputEvent): void {
    this.model.setNote(event.detail.value)
  }

  private getActiveDetail(): PMEntryCreateOptionalDetail | null {
    const view = this.model.detailsSheetView()
    return view === 'hub' ? null : view
  }

  private focusBackAction(): void {
    this.shadowRoot?.querySelector<HTMLElement>('[data-detail-back]')?.focus()
  }

  private focusDetailRow(detail: PMEntryCreateOptionalDetail): void {
    this.shadowRoot?.querySelector<HTMLElement>(`[data-detail="${detail}"]`)?.focus()
  }

  private getDetailStatus(detail: PMEntryCreateOptionalDetail): string {
    if (!this.model.optionalDetailHasData(detail)) {
      return i18n('entry:create:detail-status-empty' as never)
    }

    switch (detail) {
      case 'tags':
        return i18n('tags:selected_count' as never, {count: this.model.tags().length})
      case 'otp':
        return this.model.otp.label().trim() || i18n('entry:create:detail-status-set' as never)
      default:
        return i18n('entry:create:detail-status-set' as never)
    }
  }

  private renderHub(): TemplateResult {
    return html`
      <div class="detail-list" data-details-hub>
        ${this.model.supportedOptionalDetails().map((detail) => {
          const presentation = DETAIL_PRESENTATION[detail]
          const label = i18n(presentation.labelKey as never)
          const configured = this.model.optionalDetailHasData(detail)
          const status = this.getDetailStatus(detail)

          return html`
            <button
              class="detail-row"
              type="button"
              data-detail=${detail}
              aria-label=${`${label}: ${status}`}
              @click=${this.handleDetailClick}
            >
              <span class="detail-icon"><cv-icon name=${presentation.icon} aria-hidden="true"></cv-icon></span>
              <span class="detail-copy">
                <span class="detail-label">${label}</span>
                <span class="detail-status">${status}</span>
              </span>
              <span class="detail-trailing" aria-hidden="true">
                ${configured
                  ? html`<cv-icon class="configured-mark" name="check-circle-2"></cv-icon>`
                  : nothing}
                <cv-icon name="chevron-right"></cv-icon>
              </span>
            </button>
          `
        })}
      </div>
    `
  }

  private renderEditor(view: Exclude<PMEntryCreateDetailsView, 'hub'>): TemplateResult {
    return html`
      <div class="detail-editor" data-detail-editor=${view}>
        <button class="back-action" type="button" data-detail-back @click=${this.handleBack}>
          <cv-icon name="chevron-left" aria-hidden="true"></cv-icon>
          ${i18n('button:back')}
        </button>
        ${this.renderEditorBody(view)}
      </div>
    `
  }

  private renderEditorBody(detail: PMEntryCreateOptionalDetail): TemplateResult {
    switch (detail) {
      case 'icon':
        return html`
          <pm-icon-picker-inline
            .iconRef=${this.model.iconRef()}
            .icon=${this.model.entryType() === 'payment_card' ? 'credit-card' : 'person-circle'}
            @pm-icon-change=${this.handleIconChange}
          ></pm-icon-picker-inline>
        `
      case 'tags':
        return renderEntryTagsEditor(
          {
            tags: this.model.tags(),
            options: pmCredentialTagsModel.availableTags(),
            comboboxType: 'select-only',
            disabled: isPassmanagerReadOnlyOrMissing(),
            maxTagsVisible: 1,
            placeholder: i18n('tags:select_placeholder' as never),
            showManage: false,
          },
          {
            onSelectExistingTagIds: this.handleTagsSelect,
          },
        )
      case 'otp':
        return html`<pm-entry-otp-create layout="card" .model=${this.model.otp}></pm-entry-otp-create>`
      case 'note':
        return html`
          <cv-textarea
            name="note"
            rows="8"
            placeholder=${i18n('note:placeholder')}
            .value=${this.model.note()}
            @cv-input=${this.handleNoteInput}
          ></cv-textarea>
        `
    }
  }

  private renderFooter(view: PMEntryCreateDetailsView): TemplateResult {
    const detail = view === 'hub' ? null : view
    const canRemove = detail ? this.model.optionalDetailHasData(detail) : false
    return html`
      <div class=${canRemove ? 'sheet-actions has-remove' : 'sheet-actions'} slot="footer">
        ${canRemove
          ? html`
              <cv-button type="button" variant="danger" size="large" @click=${this.handleRemove}>
                ${i18n('button:remove')}
              </cv-button>
            `
          : nothing}
        <cv-button
          type="button"
          variant="primary"
          preset="action-primary"
          size="large"
          .disabled=${isPassmanagerReadOnlyOrMissing()}
          @click=${this.handleDone}
        >
          ${i18n('button:done')}
        </cv-button>
      </div>
    `
  }

  protected override render(): TemplateResult {
    const view = this.model.detailsSheetView()
    const qrScannerActive = view === 'otp' && this.model.otp.qrScannerScanning()
    const otpAdvanced = view === 'otp' && this.model.otp.view() === 'advanced'
    const presentation = view === 'hub' ? null : DETAIL_PRESENTATION[view]

    return html`
      <cv-bottom-sheet
        .open=${this.model.detailsSheetOpen()}
        .closable=${!qrScannerActive}
        .closeOnEscape=${!qrScannerActive}
        .closeOnOutsidePointer=${!qrScannerActive}
        .closeOnOutsideFocus=${!qrScannerActive}
        .dragToClose=${!qrScannerActive}
        detents="middle expanded"
        .detent=${view === 'hub' ? 'middle' : 'expanded'}
        @cv-change=${this.handleSheetChange}
      >
        <span slot="title">
          ${otpAdvanced
            ? i18n('otp:advanced' as never)
            : presentation
              ? i18n(presentation.labelKey as never)
              : i18n('entry:create:add-details' as never)}
        </span>
        ${otpAdvanced
          ? nothing
          : html`
              <span slot="description">
                ${presentation
                  ? i18n(presentation.descriptionKey as never)
                  : i18n('entry:create:add-details-description' as never)}
              </span>
            `}
        ${view === 'hub' ? this.renderHub() : this.renderEditor(view)} ${this.renderFooter(view)}
      </cv-bottom-sheet>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-entry-create-details-sheet': PMEntryCreateDetailsSheet
  }
}
