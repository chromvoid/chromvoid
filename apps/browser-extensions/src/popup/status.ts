import {i18n} from './i18n'

export type PopupRuntimeStatus = {
  gatewayConnected: boolean
  gatewayReachable: boolean | undefined
  providerEnabled: boolean | undefined
  vaultOpen: boolean | undefined
}

export const resolvePopupStatusError = ({
  gatewayConnected,
  gatewayReachable,
  providerEnabled,
  vaultOpen,
}: PopupRuntimeStatus): string | undefined => {
  if (!gatewayConnected) {
    if (gatewayReachable) {
      return i18n('error.gatewayUnauthorized')
    }
    return i18n('error.gatewayOffline')
  }
  if (providerEnabled === false) {
    return i18n('error.providerDisabled')
  }
  if (vaultOpen === false) {
    return i18n('error.vaultLocked')
  }
  return undefined
}
