import {atom, computed, wrap, type Atom, type Computed} from '@reatom/core'

import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'

import {parsePairingOffer, type PairingOffer} from './remote-hosts-flow.contract'

export type RemoteDesktopPairingField = 'offer' | 'pin'

export type RemoteDesktopPairingSubmitResult =
  | {status: 'success'}
  | {status: 'validation_error'; firstInvalid: RemoteDesktopPairingField}
  | {status: 'backend_error'; error: string}
  | {status: 'busy'}

export interface RemoteDesktopPairingModelOptions {
  deviceLabel?: Atom<string>
  submitPairing?: (input: {offer: PairingOffer; pin: string; deviceLabel: string}) => Promise<unknown>
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getOfferValidationError(value: string): string | null {
  try {
    parsePairingOffer(value)
    return null
  } catch (error) {
    return getErrorText(error)
  }
}

function getPinValidationError(value: string): string | null {
  const pin = value.trim()
  if (!pin) return i18n('network-pair:error-pin-required')
  if (!/^\d{6}$/.test(pin)) return i18n('network-pair:error-pin-format')
  return null
}

export class RemoteDesktopPairingModel {
  readonly offerInput = atom('', 'remote.desktopPairing.offerInput')
  readonly pinInput = atom('', 'remote.desktopPairing.pinInput')
  readonly deviceLabel: Atom<string>
  readonly submitAttempted = atom(false, 'remote.desktopPairing.submitAttempted')
  readonly busy = atom(false, 'remote.desktopPairing.busy')
  readonly backendError = atom<string | null>(null, 'remote.desktopPairing.backendError')

  readonly currentDeviceLabel: Computed<string>
  readonly offerValidationError: Computed<string | null>
  readonly pinValidationError: Computed<string | null>
  readonly offerError: Computed<string | null>
  readonly pinError: Computed<string | null>
  readonly firstInvalid: Computed<RemoteDesktopPairingField | null>

  private readonly submitPairingCommand: NonNullable<RemoteDesktopPairingModelOptions['submitPairing']>

  constructor(options: RemoteDesktopPairingModelOptions = {}) {
    this.deviceLabel = options.deviceLabel ?? atom('', 'remote.desktopPairing.deviceLabel')
    this.submitPairingCommand =
      options.submitPairing ??
      ((input) =>
        tauriInvoke<unknown>('desktop_pair_mobile_host', {
          offer: input.offer,
          pin: input.pin,
          deviceLabel: input.deviceLabel,
        }))

    this.currentDeviceLabel = computed(
      () => this.deviceLabel().trim() || i18n('network-pair:default-device-desktop'),
      'remote.desktopPairing.currentDeviceLabel',
    )
    this.offerValidationError = computed(
      () => getOfferValidationError(this.offerInput()),
      'remote.desktopPairing.offerValidationError',
    )
    this.pinValidationError = computed(
      () => getPinValidationError(this.pinInput()),
      'remote.desktopPairing.pinValidationError',
    )
    this.offerError = computed(
      () => (this.submitAttempted() ? this.offerValidationError() : null),
      'remote.desktopPairing.offerError',
    )
    this.pinError = computed(
      () => (this.submitAttempted() ? this.pinValidationError() : null),
      'remote.desktopPairing.pinError',
    )
    this.firstInvalid = computed<RemoteDesktopPairingField | null>(() => {
      if (this.offerValidationError()) return 'offer'
      if (this.pinValidationError()) return 'pin'
      return null
    }, 'remote.desktopPairing.firstInvalid')
  }

  setOfferInput(value: string): void {
    this.offerInput.set(value)
    this.backendError.set(null)
  }

  setPinInput(value: string): void {
    this.pinInput.set(value.replace(/\s+/g, ''))
    this.backendError.set(null)
  }

  setDeviceLabel(value: string): void {
    this.deviceLabel.set(value)
    this.backendError.set(null)
  }

  async submit(): Promise<RemoteDesktopPairingSubmitResult> {
    if (this.busy()) return {status: 'busy'}

    this.submitAttempted.set(true)
    this.backendError.set(null)

    const firstInvalid = this.firstInvalid()
    if (firstInvalid) return {status: 'validation_error', firstInvalid}

    this.busy.set(true)
    try {
      await wrap(
        this.submitPairingCommand({
          offer: parsePairingOffer(this.offerInput()),
          pin: this.pinInput().trim(),
          deviceLabel: this.currentDeviceLabel(),
        }),
      )
      return {status: 'success'}
    } catch (error) {
      const message = getErrorText(error)
      this.backendError.set(message)
      return {status: 'backend_error', error: message}
    } finally {
      this.busy.set(false)
    }
  }

  reset(): void {
    this.offerInput.set('')
    this.pinInput.set('')
    this.submitAttempted.set(false)
    this.backendError.set(null)
  }
}
