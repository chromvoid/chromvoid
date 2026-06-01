import {atom} from '@reatom/core'

export class WelcomeSharedModel {
  readonly busy = atom(false)
  readonly errorText = atom<string | null>(null)
  readonly shakeError = atom(false)

  setBusy(value: boolean, error: string | null = null): void {
    this.busy.set(value)
    this.errorText.set(error)
    if (error) {
      this.triggerShake()
    }
  }

  setError(error: string | null): void {
    this.errorText.set(error)
    if (error) {
      this.triggerShake()
    }
  }

  clearError(): void {
    this.errorText.set(null)
  }

  private triggerShake(): void {
    this.shakeError.set(true)
    window.setTimeout(() => {
      this.shakeError.set(false)
    }, 500)
  }
}
