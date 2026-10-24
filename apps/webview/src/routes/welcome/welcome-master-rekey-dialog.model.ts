import {atom} from '@reatom/core'
import {i18n} from 'root/i18n'

export type WelcomeMasterRekeyDialogResult = {
  currentPassword: string
  newMasterPassword: string
}

type MasterRekeyDialogState = WelcomeMasterRekeyDialogResult & {
  confirmPassword: string
  error: string | null
}

export class WelcomeMasterRekeyDialogModel {
  readonly state = atom<MasterRekeyDialogState>({
    currentPassword: '',
    newMasterPassword: '',
    confirmPassword: '',
    error: null,
  })

  setCurrentPassword(value: string): void {
    this.patch({currentPassword: value, error: null})
  }

  setNewMasterPassword(value: string): void {
    this.patch({newMasterPassword: value, error: null})
  }

  setConfirmPassword(value: string): void {
    this.patch({confirmPassword: value, error: null})
  }

  submit(): WelcomeMasterRekeyDialogResult | null {
    const state = this.state()
    if (!state.currentPassword) {
      this.patch({error: i18n('welcome:master-required')})
      return null
    }
    if (!state.newMasterPassword) {
      this.patch({error: i18n('welcome:master-required')})
      return null
    }
    if (state.newMasterPassword.length < 12) {
      this.patch({error: i18n('welcome:master-too-short')})
      return null
    }
    if (state.newMasterPassword === state.currentPassword) {
      this.patch({error: i18n('changepwd:same-password')})
      return null
    }
    if (state.newMasterPassword !== state.confirmPassword) {
      this.patch({error: i18n('welcome:master-mismatch')})
      return null
    }

    return {
      currentPassword: state.currentPassword,
      newMasterPassword: state.newMasterPassword,
    }
  }

  private patch(next: Partial<MasterRekeyDialogState>): void {
    this.state.set({...this.state(), ...next})
  }
}
