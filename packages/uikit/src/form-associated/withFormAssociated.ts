type Constructor<T = object> = abstract new (...args: any[]) => T

export interface FormAssociatedValidity {
  flags?: ValidityStateFlags
  message?: string
  anchor?: HTMLElement
}

export const withFormAssociated = <
  TBase extends Constructor<HTMLElement & {requestUpdate(): void}>,
>(
  Base: TBase,
) => {
  abstract class FormAssociatedElement extends Base {
    static readonly formAssociated = true

    protected readonly internals: ElementInternals
    private _formDisabled = false

    constructor(...args: any[]) {
      super(...args)
      this.internals = this.attachInternals()
    }

    protected get formDisabled(): boolean {
      return this._formDisabled
    }

    formDisabledCallback(disabled: boolean): void {
      this._formDisabled = disabled
      this.onFormDisabledChanged(disabled)
      this.syncFormAssociatedState()
      this.requestUpdate()
    }

    formResetCallback(): void {
      this.onFormReset()
      this.syncFormAssociatedState()
      this.requestUpdate()
    }

    formStateRestoreCallback(state: string | File | FormData | null): void {
      this.onFormStateRestore(state)
      this.syncFormAssociatedState()
      this.requestUpdate()
    }

    get form(): HTMLFormElement | null {
      return this.internals.form
    }

    get validity(): ValidityState {
      return this.internals.validity
    }

    get validationMessage(): string {
      return this.internals.validationMessage
    }

    get willValidate(): boolean {
      return !this.isFormAssociatedDisabled()
    }

    checkValidity(): boolean {
      this.syncFormAssociatedState()
      return this.internals.checkValidity()
    }

    reportValidity(): boolean {
      this.syncFormAssociatedState()
      return this.internals.reportValidity()
    }

    protected syncFormAssociatedState(): void {
      if (this.isFormAssociatedDisabled()) {
        this.internals.setFormValue(null)
        this.internals.setValidity({})
        return
      }

      this.internals.setFormValue(this.getFormAssociatedValue())
      const validity = this.getFormAssociatedValidity()
      const flags = validity.flags ?? {}
      if (Object.keys(flags).length === 0) {
        this.internals.setValidity({})
        return
      }

      this.internals.setValidity(flags, validity.message, validity.anchor)
    }

    protected onFormDisabledChanged(_disabled: boolean): void {}

    protected onFormReset(): void {}

    protected onFormStateRestore(_state: string | File | FormData | null): void {}

    protected getFormAssociatedValidity(): FormAssociatedValidity {
      return {flags: {}}
    }

    protected abstract isFormAssociatedDisabled(): boolean

    protected abstract getFormAssociatedValue(): string | File | FormData | null
  }

  return FormAssociatedElement
}
