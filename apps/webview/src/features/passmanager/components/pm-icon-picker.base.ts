import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {PMIconPickerModel, type PMIconPickerUploadPhase} from './pm-icon-picker.model'

export type PMIconPickerOnChange = (iconRef: string | undefined) => void

export const ICON_ACCEPT = 'image/png,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon'

export const pmIconPickerBaseStyles = css`
  :host {
    display: block;
  }

  .icon-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--pm-icon-picker-trigger-inline-size, var(--pm-icon-picker-trigger-size, 56px));
    block-size: var(--pm-icon-picker-trigger-block-size, var(--pm-icon-picker-trigger-size, 56px));
    padding: 0;
    border: 1px solid var(--pm-icon-picker-trigger-border, var(--cv-color-border-strong));
    border-radius: var(--pm-icon-picker-trigger-radius, var(--cv-radius-3, 14px));
    background: var(--pm-icon-picker-trigger-bg, var(--cv-gradient-surface));
    box-shadow:
      inset 0 1px 0 var(--cv-alpha-white-22),
      var(--pm-icon-picker-trigger-shadow, 0 14px 30px var(--cv-alpha-black-20));
    cursor: pointer;
    transition:
      transform var(--cv-duration-fast),
      border-color var(--cv-duration-normal),
      background-color var(--cv-duration-normal);
  }

  .icon-trigger--with-label {
    justify-content: flex-start;
    gap: var(--pm-icon-picker-trigger-label-gap, var(--cv-space-3));
    padding-inline: var(--pm-icon-picker-trigger-label-padding-inline, var(--cv-space-3));
  }

  .icon-trigger:hover {
    border-color: var(--pm-icon-picker-trigger-hover-border, var(--cv-color-border-accent));
    transform: translateY(-1px);
  }

  .icon-trigger:focus-visible {
    outline: 2px solid var(--cv-color-primary-dark);
    outline-offset: 2px;
  }

  .icon-preview {
    width: var(--pm-icon-picker-preview-size, var(--pm-avatar-picker-preview-size));
    height: var(--pm-icon-picker-preview-size, var(--pm-avatar-picker-preview-size));
    --pm-avatar-radius: var(--pm-avatar-picker-radius);
    --pm-avatar-image-fit: contain;
    --pm-avatar-image-padding: var(--pm-avatar-picker-preview-image-padding);
    --pm-avatar-icon-size: var(--pm-avatar-picker-preview-icon-size);
    --pm-avatar-icon-color: var(--cv-color-text-strong);
  }

  .icon-trigger-label {
    overflow: hidden;
    min-width: 0;
    color: var(--pm-icon-picker-trigger-label-color, var(--cv-color-text));
    font-size: var(--pm-icon-picker-trigger-label-font-size, var(--cv-font-size-sm));
    font-weight: var(--pm-icon-picker-trigger-label-font-weight, var(--cv-font-weight-semibold));
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :is(cv-dialog, cv-bottom-sheet) {
    display: none;
    --cv-dialog-overlay-color: var(--cv-color-overlay);
  }

  :is(cv-dialog, cv-bottom-sheet)[open] {
    display: inline-block;
  }

  :is(cv-dialog, cv-bottom-sheet)::part(trigger) {
    display: none;
  }

  :is(cv-dialog, cv-bottom-sheet)::part(content) {
    max-width: min(400px, calc(100vw - var(--cv-space-4)));
    overflow: hidden;
    border-color: var(--cv-color-border-strong);
    background: var(--cv-gradient-surface);
    box-shadow:
      0 -24px 64px var(--cv-alpha-black-50),
      inset 0 1px 0 var(--cv-alpha-white-8);
  }

  cv-bottom-sheet::part(handle) {
    padding-block: var(--cv-space-3) var(--cv-space-1);
  }

  cv-bottom-sheet::part(grabber) {
    width: 56px;
    height: 5px;
    background: var(--cv-gradient-divider-subtle);
  }

  :is(cv-dialog, cv-bottom-sheet)::part(header) {
    align-items: center;
    padding: var(--cv-space-2) var(--cv-space-5) var(--cv-space-3);
    border-block-end: 1px solid var(--cv-color-border-faint);
    background: var(--cv-gradient-surface);
  }

  :is(cv-dialog, cv-bottom-sheet)::part(title) {
    font-size: var(--cv-font-size-lg);
    font-weight: var(--cv-font-weight-semibold);
    letter-spacing: 0;
  }

  :is(cv-dialog, cv-bottom-sheet)::part(header-close) {
    width: 36px;
    height: 36px;
    border-radius: var(--cv-radius-2);
    color: var(--cv-color-text-muted);
  }

  :is(cv-dialog, cv-bottom-sheet)::part(header-close):hover {
    color: var(--cv-color-text);
    background: var(--cv-color-surface-highlight);
  }

  :is(cv-dialog, cv-bottom-sheet)::part(body) {
    padding: var(--cv-space-4) var(--cv-space-5) var(--cv-space-5);
  }

  .dialog-body {
    display: grid;
    gap: var(--cv-space-4);
  }

  .dialog-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--cv-space-2);
  }

  .dialog-actions cv-button {
    min-width: 0;
    width: 100%;
    --cv-button-min-height: 44px;
    --cv-button-padding-inline: var(--cv-space-2);
    --cv-button-gap: var(--cv-space-1);
    --cv-button-font-size: var(--cv-font-size-xs);
    --cv-button-font-weight: var(--cv-font-weight-semibold);
    --cv-button-border-radius: var(--cv-radius-2);
  }

  .dialog-actions cv-button::part(base) {
    box-shadow: inset 0 1px 0 var(--cv-alpha-white-8);
  }

  .dialog-actions cv-icon {
    width: 16px;
    height: 16px;
  }

  .dialog-upload-progress {
    display: grid;
    gap: var(--cv-space-2);
    padding: var(--cv-space-3);
    border: 1px solid var(--cv-color-primary-border);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-primary-subtle);
    box-shadow: inset 0 1px 0 var(--cv-alpha-white-8);
  }

  .dialog-upload-progress-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .dialog-upload-progress-label {
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
    line-height: 1.35;
  }

  .dialog-upload-progress-file {
    overflow: hidden;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dialog-upload-progress-track {
    position: relative;
    overflow: hidden;
    height: 5px;
    border-radius: var(--cv-radius-pill);
    background: var(--cv-color-surface-2);
  }

  .dialog-upload-progress-bar {
    position: absolute;
    inset-block: 0;
    inset-inline: 0;
    border-radius: inherit;
    background: var(--cv-gradient-progress-primary);
    background-size: 220% 100%;
    opacity: 0.9;
    animation: pm-icon-upload-progress 1.1s linear infinite;
  }

  @keyframes pm-icon-upload-progress {
    from {
      background-position: 220% 0;
    }

    to {
      background-position: 0 0;
    }
  }

  .dialog-library-block {
    display: grid;
    gap: var(--cv-space-3);
  }

  .dialog-library-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-2);
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .dialog-library-count {
    min-width: 24px;
    padding: 2px var(--cv-space-2);
    border-radius: var(--cv-radius-pill);
    border: 1px solid var(--cv-color-border-faint);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text-muted);
    font-size: 0.6875rem;
    line-height: 1.45;
    text-align: center;
  }

  .dialog-library {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
    gap: var(--cv-space-3);
  }

  .dialog-library-item {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 58px;
    aspect-ratio: 1;
    border-radius: var(--cv-radius-3);
    border: 1px solid var(--cv-color-border);
    background: var(--cv-gradient-surface-deep);
    box-shadow: inset 0 1px 0 var(--cv-alpha-white-6);
    transition:
      border-color var(--cv-duration-normal),
      background-color var(--cv-duration-normal),
      box-shadow var(--cv-duration-normal),
      transform var(--cv-duration-fast);
    cursor: pointer;
    padding: 0;
  }

  .dialog-library-item:hover {
    border-color: var(--cv-color-border-accent);
    background: var(--cv-color-bg);
    transform: translateY(-1px);
  }

  .dialog-library-item.selected {
    border-color: var(--cv-color-primary-dark);
    background: var(--cv-color-primary-subtle);
    box-shadow:
      inset 0 0 0 1px var(--cv-color-primary-border-strong),
      0 0 0 3px var(--cv-color-primary-ring);
  }

  .dialog-library-item.selected::after {
    content: '';
    position: absolute;
    inset-block-start: 7px;
    inset-inline-end: 7px;
    width: 8px;
    height: 8px;
    border-radius: var(--cv-radius-pill);
    background: var(--cv-color-primary);
    box-shadow: 0 0 0 2px var(--cv-color-bg);
  }

  .dialog-library-item-preview {
    width: var(--pm-avatar-picker-dialog-preview-size);
    height: var(--pm-avatar-picker-dialog-preview-size);
    --pm-avatar-radius: var(--pm-avatar-picker-radius);
    --pm-avatar-image-fit: contain;
    --pm-avatar-image-padding: var(--pm-avatar-picker-dialog-image-padding);
    --pm-avatar-icon-size: var(--pm-avatar-picker-dialog-icon-size);
  }

  .dialog-empty {
    text-align: center;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    padding: var(--cv-space-5) var(--cv-space-3);
    border: 1px dashed var(--cv-color-border-muted);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface-glass-subtle);
  }

  .dialog-error {
    color: var(--cv-color-danger);
    font-size: var(--cv-font-size-xs);
    padding: var(--cv-space-3);
    border: 1px solid var(--cv-color-danger-border);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-danger-surface);
  }

  @media (prefers-reduced-motion: reduce) {
    .dialog-upload-progress-bar {
      animation: none;
      opacity: 0.78;
    }
  }

  @media (max-width: 420px) {
    :is(cv-dialog, cv-bottom-sheet)::part(content) {
      max-width: 100vw;
    }

    :is(cv-dialog, cv-bottom-sheet)::part(header) {
      padding-inline: var(--cv-space-4);
    }

    :is(cv-dialog, cv-bottom-sheet)::part(body) {
      padding-inline: var(--cv-space-4);
    }

    .dialog-library {
      grid-template-columns: repeat(auto-fill, minmax(54px, 1fr));
      gap: var(--cv-space-2);
    }
  }
`

type PMIconRefSource = string | undefined | (() => string | undefined)

export abstract class PMIconPickerBase extends ReatomLitElement {
  static elementName = 'pm-icon-picker'

  static properties = {
    iconRef: {attribute: false},
    icon: {type: String},
    triggerLabel: {type: String, attribute: 'trigger-label'},
    onChange: {type: Function, attribute: false},
  }

  private _iconRef: PMIconRefSource = undefined
  private _icon = 'person-circle'
  declare triggerLabel: string
  declare onChange?: PMIconPickerOnChange

  protected readonly iconPickerModel = new PMIconPickerModel()

  constructor() {
    super()
    this.triggerLabel = ''
  }

  get iconRef() {
    return this._iconRef
  }

  set iconRef(value: PMIconRefSource) {
    const next = typeof value === 'string' || typeof value === 'function' ? value : undefined
    if (next === this._iconRef) return
    const prev = this._iconRef
    this._iconRef = next
    this.requestUpdate('iconRef', prev)
  }

  get icon() {
    return this._icon
  }

  set icon(value: string) {
    const next = typeof value === 'string' ? value : ''
    if (next === this._icon) return
    const prev = this._icon
    this._icon = next
    this.requestUpdate('icon', prev)
  }

  override connectedCallback() {
    super.connectedCallback()
    this.iconPickerModel.connect()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.iconPickerModel.disconnect()
  }

  public openChooser() {
    this.iconPickerModel.openChooser()
  }

  protected shouldRenderTrigger(): boolean {
    return true
  }

  protected getIconRef(): string | undefined {
    const ref = this.iconRef
    if (typeof ref === 'function') {
      return ref()
    }
    return ref
  }

  protected hasIcon(): boolean {
    return !!this.getIconRef()
  }

  protected isIconUploading(): boolean {
    return this.iconPickerModel.isUploading()
  }

  protected onPickIcon() {
    if (this.isIconUploading()) return
    const input = this.shadowRoot?.querySelector<HTMLInputElement>('#icon-file')
    input?.click()
  }

  protected onTriggerClick() {
    this.openChooser()
  }

  protected onDialogChange(e: CustomEvent<{open?: boolean}>) {
    if (e.target !== e.currentTarget) return
    if (typeof e.detail.open !== 'boolean') return
    this.iconPickerModel.setDialogOpen(e.detail.open)
  }

  protected closeDialog() {
    this.iconPickerModel.closeDialog()
  }

  protected onDialogIconClick(event: Event) {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return
    const iconRef = (target.dataset['iconRef'] ?? '').trim()
    if (!iconRef) return
    const pickedRef = this.iconPickerModel.pickStoredIcon(iconRef)
    if (pickedRef) {
      this.fireChange(pickedRef)
    }
    this.closeDialog()
  }

  protected onIconReset() {
    this.fireChange(this.iconPickerModel.resetIcon())
  }

  protected onDialogReset() {
    if (this.isIconUploading()) return
    this.onIconReset()
    this.closeDialog()
  }

  protected onPickStoredIcon(iconRef: string) {
    const pickedRef = this.iconPickerModel.pickStoredIcon(iconRef)
    if (pickedRef) {
      this.fireChange(pickedRef)
    }
  }

  protected onReloadIcons() {
    this.iconPickerModel.reloadIcons()
  }

  protected async onIconFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    if (this.isIconUploading()) {
      input.value = ''
      return
    }
    try {
      const iconRef = await this.iconPickerModel.uploadFile(file)
      if (iconRef) {
        this.fireChange(iconRef)
      }
    } finally {
      input.value = ''
    }
  }

  private getUploadStatusLabel(phase: PMIconPickerUploadPhase): string {
    switch (phase) {
      case 'preparing':
        return i18n('icon:upload:preparing')
      case 'uploading':
        return i18n('icon:upload:uploading')
      case 'refreshing':
        return i18n('icon:upload:refreshing')
      default:
        return ''
    }
  }

  protected fireChange(iconRef: string | undefined) {
    this.onChange?.(iconRef)
    this.dispatchEvent(
      new CustomEvent('pm-icon-change', {
        detail: {iconRef},
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected renderTrigger() {
    const triggerLabel = this.triggerLabel.trim()
    return html`
      <cv-button
        unstyled
        class=${triggerLabel ? 'icon-trigger icon-trigger--with-label' : 'icon-trigger'}
        type="button"
        aria-label=${i18n('icon:choose')}
        title=${i18n('icon:title')}
        @click=${this.onTriggerClick}
      >
        <pm-avatar-icon class="icon-preview" .iconRef=${this.iconRef} .icon=${this.icon}></pm-avatar-icon>
        ${triggerLabel ? html`<span class="icon-trigger-label">${triggerLabel}</span>` : nothing}
      </cv-button>
    `
  }

  protected renderDialogBody() {
    const currentRef = this.getIconRef() ?? ''
    const icons = this.iconPickerModel.storedIcons()
    const isLoading = this.iconPickerModel.isLoadingIcons()
    const listError = this.iconPickerModel.iconListError()
    const uploadError = this.iconPickerModel.iconError()
    const uploadState = this.iconPickerModel.iconUploadState()
    const isUploadingIcon = uploadState.phase !== 'idle'
    const uploadLabel = this.getUploadStatusLabel(uploadState.phase)

    return html`
      <div class="dialog-body" aria-busy=${isUploadingIcon ? 'true' : 'false'}>
        <div class="dialog-actions">
          <cv-button
            type="button"
            size="small"
            variant="primary"
            .loading=${isUploadingIcon}
            ?disabled=${isUploadingIcon}
            @click=${this.onPickIcon}
          >
            <cv-icon slot="prefix" name="upload" size="s" aria-hidden="true"></cv-icon>
            ${i18n('button:upload')}
          </cv-button>
          <cv-button
            type="button"
            size="small"
            variant="default"
            @click=${this.onDialogReset}
            ?disabled=${isUploadingIcon || !this.hasIcon()}
          >
            <cv-icon slot="prefix" name="rotate-ccw" size="s" aria-hidden="true"></cv-icon>
            ${i18n('button:reset')}
          </cv-button>
          <cv-button
            type="button"
            size="small"
            variant="default"
            @click=${this.onReloadIcons}
            ?disabled=${isUploadingIcon}
          >
            <cv-icon slot="prefix" name="refresh-cw" size="s" aria-hidden="true"></cv-icon>
            ${i18n('button:refresh')}
          </cv-button>
        </div>

        ${isUploadingIcon
          ? html`
              <div class="dialog-upload-progress" role="status" aria-live="polite">
                <div class="dialog-upload-progress-copy">
                  <span class="dialog-upload-progress-label">${uploadLabel}</span>
                  ${uploadState.fileName
                    ? html`<span class="dialog-upload-progress-file" title=${uploadState.fileName}>
                        ${uploadState.fileName}
                      </span>`
                    : nothing}
                </div>
                <div class="dialog-upload-progress-track" aria-hidden="true">
                  <span class="dialog-upload-progress-bar"></span>
                </div>
              </div>
            `
          : nothing}

        <div class="dialog-library-block">
          <div class="dialog-library-header">
            <span>${i18n('icon:saved')}</span>
            ${icons.length > 0 ? html`<span class="dialog-library-count">${icons.length}</span>` : nothing}
          </div>

          ${icons.length > 0
            ? html`
                <div class="dialog-library" role="listbox" aria-label=${i18n('icon:saved')}>
                  ${icons.map((icon) => {
                    const selected = icon.iconRef === currentRef
                    return html`
                      <cv-button
                        unstyled
                        type="button"
                        role="option"
                        class=${selected ? 'dialog-library-item selected' : 'dialog-library-item'}
                        aria-selected=${selected}
                        data-icon-ref=${icon.iconRef}
                        title=${icon.iconRef}
                        @click=${this.onDialogIconClick}
                      >
                        <pm-avatar-icon
                          class="dialog-library-item-preview"
                          .iconRef=${icon.iconRef}
                          .icon=${this.icon}
                        ></pm-avatar-icon>
                      </cv-button>
                    `
                  })}
                </div>
              `
            : nothing}
          ${isLoading ? html`<div class="dialog-empty">${i18n('icon:loading')}</div>` : nothing}
          ${!isLoading && icons.length === 0 && !listError
            ? html`<div class="dialog-empty">${i18n('icon:empty')}</div>`
            : nothing}
          ${listError ? html`<div class="dialog-error">${listError}</div>` : nothing}
          ${uploadError ? html`<div class="dialog-error">${uploadError}</div>` : nothing}
        </div>
      </div>
    `
  }

  protected renderDialogContent(): TemplateResult {
    return html`
      <span slot="title">${i18n('icon:title')}</span>
      ${this.renderDialogBody()}
    `
  }

  protected abstract renderDialog(): TemplateResult

  protected render() {
    return html`
      ${this.shouldRenderTrigger() ? this.renderTrigger() : nothing}
      <input id="icon-file" type="file" accept=${ICON_ACCEPT} @change=${this.onIconFileChange} hidden />
      ${this.renderDialog()}
    `
  }
}
