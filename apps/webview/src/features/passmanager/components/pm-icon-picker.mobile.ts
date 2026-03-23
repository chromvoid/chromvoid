import {state} from '@statx/core'

import {css, html, nothing} from 'lit'

import {i18n} from '@project/passmanager'
import {ICON_ACCEPT, PMIconPickerBase, pmIconPickerBaseStyles} from './pm-icon-picker.base'

const pmIconPickerMobileStyles = css`
  .icon-row {
    grid-template-columns: 36px 1fr;
    gap: var(--cv-space-2);
  }

  .icon-preview {
    width: 36px;
    height: 36px;
    --pm-avatar-image-padding: 4px;
    --pm-avatar-icon-size: 20px;
  }

  .icon-actions {
    flex-wrap: nowrap;
  }

  .icon-actions cv-button {
    width: auto;
    flex: 1;
    --cv-button-min-height: 30px;
    --cv-button-padding-inline: var(--cv-space-2);
    --cv-button-font-size: var(--cv-font-size-xs);
  }

  cv-dialog {
    display: none;
  }

  cv-dialog[open] {
    display: inline-block;
  }

  cv-dialog::part(trigger) {
    display: none;
  }

  cv-dialog::part(content) {
    max-width: 360px;
  }

  .dialog-library {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: var(--cv-space-2);
    padding: var(--cv-space-2) 0;
  }

  .dialog-library-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    border-radius: var(--cv-radius-2);
    border: 1px solid var(--cv-color-border);
    background: var(--cv-color-surface-2);
    transition:
      border-color var(--cv-duration-normal),
      background-color var(--cv-duration-normal);
    cursor: pointer;
    padding: 0;
  }

  .dialog-library-item.selected {
    border-color: var(--cv-color-primary-dark);
    background: var(--cv-color-primary-subtle);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--cv-color-primary) 35%, transparent);
  }

  .dialog-library-item:active {
    transform: scale(0.95);
  }

  .dialog-library-item-preview {
    width: 30px;
    height: 30px;
    --pm-avatar-radius: 6px;
    --pm-avatar-image-fit: contain;
    --pm-avatar-image-padding: 3px;
    --pm-avatar-icon-size: 18px;
  }

  .dialog-empty {
    text-align: center;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    padding: var(--cv-space-4) 0;
  }

  .dialog-error {
    color: var(--cv-color-danger);
    font-size: var(--cv-font-size-xs);
    padding: var(--cv-space-2) 0;
  }

  .dialog-footer {
    display: flex;
    gap: var(--cv-space-2);
  }

  .dialog-footer cv-button {
    flex: 1;
    width: auto;
  }
`

export class PMIconPickerMobile extends PMIconPickerBase {
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = [pmIconPickerBaseStyles, pmIconPickerMobileStyles]

  private dialogOpen = state(false)

  private openDialog() {
    this.dialogOpen.set(true)
  }

  private closeDialog() {
    this.dialogOpen.set(false)
  }

  private onDialogChange(e: CustomEvent<{open: boolean}>) {
    this.dialogOpen.set(e.detail.open)
  }

  private onDialogIconClick(event: Event) {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return
    const iconRef = (target.dataset['iconRef'] ?? '').trim()
    if (!iconRef) return
    this.onPickStoredIcon(iconRef)
    this.closeDialog()
  }

  private renderDialog() {
    const currentRef = this.getIconRef() ?? ''
    const icons = this.storedIcons()
    const isLoading = this.isLoadingIcons()
    const listError = this.iconListError()

    return html`
      <cv-dialog
        .open=${this.dialogOpen()}
        @cv-change=${this.onDialogChange}
        .closeOnOutsidePointer=${true}
      >
        <span slot="title">${i18n('icon:saved')}</span>
        ${icons.length > 0
          ? html`
              <div class="dialog-library" role="listbox" aria-label=${i18n('icon:saved')}>
                ${icons.map((icon) => {
                  const selected = icon.iconRef === currentRef
                  return html`
                    <button
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
                    </button>
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
        <div slot="footer" class="dialog-footer">
          <cv-button
            type="button"
            size="small"
            variant="default"
            @click=${this.onIconReset}
            ?disabled=${!this.hasIcon()}
          >
            ${i18n('button:reset')}
          </cv-button>
          <cv-button type="button" size="small" variant="default" @click=${this.onReloadIcons}>
            ${i18n('button:refresh')}
          </cv-button>
        </div>
      </cv-dialog>
    `
  }

  protected override render() {
    return html`
      <div class="icon-row">
        <pm-avatar-icon class="icon-preview" .iconRef=${this.iconRef} .icon=${this.icon}></pm-avatar-icon>
        <div class="icon-actions">
          <cv-button type="button" size="small" variant="default" @click=${this.onPickIcon}
            >${i18n('button:upload')}</cv-button
          >
          <cv-button type="button" size="small" variant="default" @click=${this.openDialog}
            >${i18n('icon:choose')}</cv-button
          >
        </div>
      </div>
      <input id="icon-file" type="file" accept=${ICON_ACCEPT} @change=${this.onIconFileChange} hidden />
      ${this.iconError() ? html`<div class="icon-error">${this.iconError()}</div>` : nothing}
      ${this.renderDialog()}
    `
  }
}
