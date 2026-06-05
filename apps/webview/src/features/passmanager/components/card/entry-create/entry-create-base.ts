import {createAfterRenderScheduler, html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import type {CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import type {CVSwitchChangeEvent} from '@chromvoid/uikit/components/cv-switch'
import type {CVTextareaInputEvent} from '@chromvoid/uikit/components/cv-textarea'
import {
  consumeAndroidPasswordSavePrefill,
  finishAndroidPasswordSave,
} from 'root/features/passmanager/models/android-password-save-prefill'
import {pmCredentialTagsModel} from 'root/features/passmanager/models/pm-credential-tags.model'
import {isPassmanagerReadOnlyOrMissing} from 'root/features/passmanager/models/pm-root.adapter'
import type {
  PMEntrySshCommentInputEvent,
  PMEntrySshKeyTypeChangeEvent,
} from '../entry-ssh/entry-ssh-generator'
import {
  getSelectedTagIdsFromEvent,
  type PMEntryTagsComboboxType,
  renderEntryTagsEditor,
} from '../entry-tags/entry-tags-editor'
import {
  PMEntryCreateModel,
  type PMEntryCreatePaymentCardField,
  type PMEntryCreateValidationField,
} from './entry-create.model'

export abstract class PMEntryCreateBase extends ReatomLitElement {
  static properties = {
    hideBack: {type: Boolean, attribute: 'hide-back'},
  }

  declare hideBack: boolean

  protected readonly model = new PMEntryCreateModel()
  private readonly afterRenderScheduler = createAfterRenderScheduler(this)

  constructor() {
    super()
    this.hideBack = false
  }

  protected changeSwitch(e: CVSwitchChangeEvent) {
    this.model.setUseOtp(e.detail.checked)
  }

  protected onTitleInput(e: CVInputInputEvent) {
    this.model.setTitle(e.detail.value)
  }

  protected selectLoginEntryType() {
    this.model.setEntryType('login')
  }

  protected selectPaymentCardEntryType() {
    this.model.setEntryType('payment_card')
  }

  protected onUsernameInput(e: CVInputInputEvent) {
    this.model.setUsername(e.detail.value)
  }

  protected onPasswordInput(e: CVInputInputEvent) {
    this.model.setPassword(e.detail.value)
  }

  protected onUrlsInput(e: CVInputInputEvent) {
    this.model.setWebsite(e.detail.value)
  }

  protected onNoteInput(e: CVTextareaInputEvent) {
    this.model.setNote(e.detail.value)
  }

  protected onCardholderInput(e: CVInputInputEvent) {
    this.model.setCardholderName(e.detail.value)
  }

  protected onCardNumberInput(e: CVInputInputEvent) {
    this.model.setCardNumber(e.detail.value)
  }

  protected onCardExpMonthInput(e: CVInputInputEvent) {
    this.model.setCardExpMonth(e.detail.value)
  }

  protected onCardExpYearInput(e: CVInputInputEvent) {
    this.model.setCardExpYear(e.detail.value)
  }

  protected onCardCvvInput(e: CVInputInputEvent) {
    this.model.setCardCvv(e.detail.value)
  }

  protected onPaymentCardFaceInput(event: Event): void {
    const field = (event.currentTarget as HTMLElement | null)?.dataset['paymentCardField'] as
      | PMEntryCreatePaymentCardField
      | undefined
    if (!field) return

    const target = event.target as (HTMLInputElement & {value?: string}) | null
    const detailValue = (event as CustomEvent<{value?: string}>).detail?.value
    const value = typeof detailValue === 'string' ? detailValue : (target?.value ?? '')

    this.model.setPaymentCardField(field, value)
  }

  protected onIconChange(event: CustomEvent<{iconRef: string | undefined}>): void {
    this.model.setIconRef(event.detail.iconRef)
  }

  protected onTagsSelect(event: Event): void {
    this.model.setTagsFromKeys(getSelectedTagIdsFromEvent(event))
  }

  protected onManageTags(event: Event): void {
    event.preventDefault()
    pmCredentialTagsModel.openManageSheet()
  }

  protected onSshKeyTypeChange(event: PMEntrySshKeyTypeChangeEvent): void {
    this.model.setSshKeyType(event.detail.keyType)
  }

  protected onSshGenCommentInput(event: PMEntrySshCommentInputEvent): void {
    this.model.setSshComment(event.detail.value)
  }

  protected async onSubmit(e: Event) {
    e.preventDefault()

    const submitResult = await this.model.submit()
    if (submitResult.ok) {
      void finishAndroidPasswordSave('saved')
      return
    }

    if (submitResult.field) {
      this.focusValidationField(submitResult.field)
      return
    }

    if (submitResult.reason === 'missing_title') {
      this.focusTitleInput()
      return
    }

    if (submitResult.reason === 'missing_login_locator') {
      this.focusInputByName('username')
      return
    }

    if (submitResult.reason === 'invalid_website') {
      this.focusInputByName('urls')
      return
    }

    if (submitResult.reason === 'missing_password') {
      this.focusInputByName('password')
      return
    }
  }

  public override connectedCallback(): void {
    super.connectedCallback()
    this.setAttribute('theme', 'dark')
    this.model.reset()
    const prefill = consumeAndroidPasswordSavePrefill()
    if (prefill) {
      this.model.applyPrefill(prefill)
    }
    this.scheduleInitialViewportPreparation()
  }

  public override disconnectedCallback(): void {
    this.afterRenderScheduler.cancel()
    super.disconnectedCallback()
  }

  protected generate() {
    this.model.generatePassword()
  }

  protected onSshSwitchChange(e: CVSwitchChangeEvent) {
    this.model.setUseSsh(e.detail.checked)
  }

  protected onUseNoteChange(e: CVSwitchChangeEvent) {
    this.model.setUseNote(e.detail.checked)
  }

  protected onGenerateSsh() {
    this.model.requestSshGeneration()
  }

  protected onSshGenerateRequest(): void {
    this.onGenerateSsh()
  }

  protected getTagsEditorMaxTagsVisible(): number {
    return 3
  }

  protected getTagsEditorComboboxType(): PMEntryTagsComboboxType {
    return 'editable'
  }

  protected getTagsEditorPlaceholder(): string {
    return i18n('tags:existing_placeholder')
  }

  protected renderTagsEditor(): TemplateResult {
    return renderEntryTagsEditor(
      {
        tags: this.model.tags(),
        options: pmCredentialTagsModel.availableTags(),
        comboboxType: this.getTagsEditorComboboxType(),
        disabled: isPassmanagerReadOnlyOrMissing(),
        maxTagsVisible: this.getTagsEditorMaxTagsVisible(),
        placeholder: this.getTagsEditorPlaceholder(),
      },
      {
        onSelectExistingTagIds: this.onTagsSelect,
        onManageTags: this.onManageTags,
      },
    )
  }

  protected focusTitleInput(preventScroll = false) {
    const workspaceHeader = this.shadowRoot?.querySelector<HTMLElement & {focusTitleInput?: () => void}>(
      'pm-workspace-header',
    )
    if (workspaceHeader?.focusTitleInput) {
      workspaceHeader.focusTitleInput()
      return
    }

    const titleField = this.shadowRoot?.querySelector<HTMLElement>('[name="title"]')
    if (!titleField) return

    if (titleField.tagName.toLowerCase() === 'cv-input') {
      const nativeInput = (
        titleField as HTMLElement & {shadowRoot?: ShadowRoot}
      ).shadowRoot?.querySelector<HTMLInputElement>('input')
      if (nativeInput) {
        try {
          nativeInput.focus(preventScroll ? {preventScroll: true} : undefined)
        } catch {
          nativeInput.focus()
        }
      }
      return
    }

    try {
      titleField.focus(preventScroll ? {preventScroll: true} : undefined)
    } catch {
      titleField.focus()
    }
  }

  protected prepareInitialViewport(): void {}

  private focusValidationField(field: PMEntryCreateValidationField): void {
    if (field === 'title') {
      this.focusTitleInput()
      return
    }

    this.focusInputByName(field)
  }

  private focusInputByName(name: string): void {
    const field = this.getFieldFocusSelectors(name)
      .map((selector) => this.shadowRoot?.querySelector<HTMLElement>(selector) ?? null)
      .find((element): element is HTMLElement => Boolean(element))
    if (!field) return

    const nativeField = this.getNativeField(field)
    if (nativeField) {
      try {
        nativeField.focus({preventScroll: false})
      } catch {
        nativeField.focus()
      }
      return
    }

    try {
      field.focus({preventScroll: false})
    } catch {
      field.focus()
    }
  }

  private getFieldFocusSelectors(name: string): string[] {
    switch (name) {
      case 'cardholderName':
        return ['[name="cardholderName"]', '[name="payment-card-cardholder"]']
      case 'cardNumber':
        return ['[name="cardNumber"]', '[name="payment-card-number"]']
      case 'cardExpMonth':
        return ['[name="cardExpMonth"]', '[name="payment-card-exp-month"]']
      case 'cardExpYear':
        return ['[name="cardExpYear"]', '[name="payment-card-exp-year"]']
      default:
        return [`[name="${name}"]`]
    }
  }

  private getNativeField(field: HTMLElement): HTMLElement | null {
    const tagName = field.tagName.toLowerCase()
    if (tagName !== 'cv-input' && tagName !== 'cv-textarea') {
      return null
    }

    return field.shadowRoot?.querySelector<HTMLElement>('input, textarea') ?? null
  }

  private scheduleInitialViewportPreparation(): void {
    this.afterRenderScheduler.schedule(() => {
      this.prepareInitialViewport()
    })
  }

  protected render(): TemplateResult | typeof nothing {
    return html`
      <form @submit=${this.onSubmit}>
        <cv-switch size="small" @cv-change=${this.changeSwitch} ?checked=${this.model.useOtp()}></cv-switch>
        ${this.model.useOtp() ? html`<pm-entry-otp-create short .model=${this.model.otp}></pm-entry-otp-create>` : null}
        <cv-switch size="small" @cv-change=${this.onSshSwitchChange} ?checked=${this.model.useSsh()}></cv-switch>
        ${this.model.showSshGenerator() ? html`<pm-entry-ssh-generator></pm-entry-ssh-generator>` : null}
      </form>
    `
  }
}
