import {state} from '@statx/core'
import type {State} from '@statx/core'
import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {i18n} from '@project/passmanager'
import {type PMStoredIcon, pmIconStore} from '../models/pm-icon-store'

export type PMIconPickerOnChange = (iconRef: string | undefined) => void

export const ICON_ACCEPT = 'image/png,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon'

export const pmIconPickerBaseStyles = css`
  :host {
    display: block;
  }

  .icon-row {
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: var(--cv-space-3);
    align-items: center;
  }

  .icon-preview {
    width: 48px;
    height: 48px;
    --pm-avatar-radius: var(--cv-radius-2);
    --pm-avatar-image-fit: contain;
    --pm-avatar-image-padding: 6px;
    --pm-avatar-contrast: var(--pm-avatar-contrast-base);
    --pm-avatar-shadow-opacity: 30%;
    --pm-avatar-icon-size: 24px;
  }

  .icon-actions {
    display: flex;
    gap: var(--cv-space-2);
    flex-wrap: wrap;
  }

  .icon-error {
    margin-top: 4px;
    color: var(--cv-color-danger);
    font-size: var(--cv-font-size-xs);
  }

  .icon-library-wrap {
    margin-top: var(--cv-space-3);
    display: grid;
    gap: var(--cv-space-2);
  }

  .icon-library-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-2);
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
  }

  .icon-library {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
    gap: var(--cv-space-1);
  }

  .icon-library-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    border-radius: var(--cv-radius-2);
    border: 1px solid var(--cv-color-border);
    background: var(--cv-color-surface-2);
    transition:
      border-color var(--cv-duration-normal),
      background-color var(--cv-duration-normal),
      transform var(--cv-duration-fast);
    cursor: pointer;
    padding: 0;
  }

  .icon-library-item:hover {
    border-color: var(--cv-color-border-accent);
    background: var(--cv-color-bg);
    transform: translateY(-1px);
  }

  .icon-library-item.selected {
    border-color: var(--cv-color-primary-dark);
    background: var(--cv-color-primary-subtle);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--cv-color-primary) 35%, transparent);
  }

  .icon-library-item-preview {
    width: 26px;
    height: 26px;
    --pm-avatar-radius: 6px;
    --pm-avatar-image-fit: contain;
    --pm-avatar-image-padding: 3px;
    --pm-avatar-icon-size: 16px;
  }

  .icon-library-note {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
  }
`

export abstract class PMIconPickerBase extends XLitElement {
  static elementName = 'pm-icon-picker' as const

  static properties = {
    iconRef: {attribute: false},
    icon: {type: String},
    onChange: {type: Function, attribute: false},
  }

  private _iconRef: string | undefined | State<string | undefined> = undefined
  private _icon = 'person-circle'
  declare onChange?: PMIconPickerOnChange

  protected iconError = state('')
  protected iconListError = state('')
  protected isLoadingIcons = state(false)
  protected storedIcons = state<PMStoredIcon[]>([])

  get iconRef() {
    return this._iconRef
  }

  set iconRef(value: string | undefined | State<string | undefined>) {
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
    void this.loadStoredIcons()
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

  protected onPickIcon() {
    const input = this.shadowRoot?.querySelector<HTMLInputElement>('#icon-file')
    input?.click()
  }

  protected onIconReset() {
    this.iconError.set('')
    this.fireChange(undefined)
  }

  protected onPickStoredIcon(iconRef: string) {
    this.iconError.set('')
    this.fireChange(iconRef)
  }

  protected onStoredIconClick(event: Event) {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return
    const iconRef = (target.dataset['iconRef'] ?? '').trim()
    if (!iconRef) return
    this.onPickStoredIcon(iconRef)
  }

  protected onReloadIcons() {
    void this.loadStoredIcons()
  }

  protected async onIconFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    this.iconError.set('')
    try {
      const iconRef = await pmIconStore.uploadIcon(file)
      this.addStoredIcon(iconRef)
      this.fireChange(iconRef)
      void this.loadStoredIcons()
    } catch (error) {
      this.iconError.set(error instanceof Error ? error.message : String(error))
    }
    input.value = ''
  }

  private addStoredIcon(iconRef: string) {
    const ref = iconRef.trim()
    if (!ref) return
    const current = this.storedIcons()
    if (current.some((icon) => icon.iconRef === ref)) return

    this.storedIcons.set([
      {
        iconRef: ref,
        mimeType: 'image/png',
        width: 0,
        height: 0,
        bytes: 0,
        createdAt: 0,
        updatedAt: 0,
      },
      ...current,
    ])
  }

  private async loadStoredIcons() {
    this.isLoadingIcons.set(true)
    this.iconListError.set('')
    try {
      const icons = await pmIconStore.listIcons()
      this.storedIcons.set(icons)
    } catch (error) {
      this.iconListError.set(error instanceof Error ? error.message : String(error))
    } finally {
      this.isLoadingIcons.set(false)
    }
  }

  protected fireChange(iconRef: string | undefined) {
    const iconRefSource = this.iconRef
    if (
      typeof iconRefSource === 'function' &&
      'set' in iconRefSource &&
      typeof iconRefSource.set === 'function'
    ) {
      iconRefSource.set(iconRef)
    }

    this.onChange?.(iconRef)
    this.dispatchEvent(
      new CustomEvent('pm-icon-change', {
        detail: {iconRef},
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected renderIconLibrary() {
    const currentRef = this.getIconRef() ?? ''
    const icons = this.storedIcons()
    const hasIcons = icons.length > 0
    const isLoading = this.isLoadingIcons()
    const listError = this.iconListError()

    if (!hasIcons && !isLoading && !listError) {
      return nothing
    }

    return html`
      <div class="icon-library-wrap">
        <div class="icon-library-header">
          <span>${i18n('icon:saved')}</span>
          <cv-button type="button" size="small" variant="default" @click=${this.onReloadIcons}
            >${i18n('button:refresh')}</cv-button
          >
        </div>
        ${hasIcons
          ? html`
              <div class="icon-library" role="listbox" aria-label=${i18n('icon:saved')}>
                ${icons.map((icon) => {
                  const selected = icon.iconRef === currentRef
                  return html`
                    <button
                      type="button"
                      role="option"
                      class=${selected ? 'icon-library-item selected' : 'icon-library-item'}
                      aria-selected=${selected}
                      data-icon-ref=${icon.iconRef}
                      title=${icon.iconRef}
                      @click=${this.onStoredIconClick}
                    >
                      <pm-avatar-icon
                        class="icon-library-item-preview"
                        .iconRef=${icon.iconRef}
                        .icon=${this.icon}
                      ></pm-avatar-icon>
                    </button>
                  `
                })}
              </div>
            `
          : nothing}
        ${isLoading ? html`<div class="icon-library-note">${i18n('icon:loading')}</div>` : nothing}
        ${listError ? html`<div class="icon-error">${listError}</div>` : nothing}
      </div>
    `
  }

  protected render() {
    return html`
      <div class="icon-row">
        <pm-avatar-icon class="icon-preview" .iconRef=${this.iconRef} .icon=${this.icon}></pm-avatar-icon>
        <div class="icon-actions">
          <cv-button type="button" size="small" variant="default" @click=${this.onPickIcon}
            >${i18n('button:upload')}</cv-button
          >
          <cv-button
            type="button"
            size="small"
            variant="default"
            @click=${this.onIconReset}
            ?disabled=${!this.hasIcon()}
          >
            ${i18n('button:reset')}
          </cv-button>
        </div>
      </div>
      <input id="icon-file" type="file" accept=${ICON_ACCEPT} @change=${this.onIconFileChange} hidden />
      ${this.renderIconLibrary()}
      ${this.iconError() ? html`<div class="icon-error">${this.iconError()}</div>` : nothing}
    `
  }
}
