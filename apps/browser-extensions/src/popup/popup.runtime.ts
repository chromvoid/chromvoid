import {GatewayRpcClient} from '../gateway/rpc-client'
import {PopupMessenger} from '../messenger'
import {openExtensionTab, queryActiveTab} from '../runtime/webextension-api'
import {CredentialProviderClient} from './credential-provider-client'
import {createPopupModel} from './popup.model'

const provider = new CredentialProviderClient(new GatewayRpcClient())
const messenger = new PopupMessenger()

export const popupModel = createPopupModel({
  provider,
  getActiveTab: queryActiveTab,
  sendPassword: (tabId, data) => messenger.sendToTab(tabId, 'fill_form', data),
  sendOtp: (tabId, data) => messenger.sendToTab(tabId, 'fill_otp', data),
  writeClipboard: async (value) => {
    if (!navigator.clipboard) {
      throw new Error('Clipboard is unavailable')
    }
    await navigator.clipboard.writeText(value)
  },
  openTab: (url) => openExtensionTab(url),
  subscribeFocus: (listener) => {
    window.addEventListener('focus', listener)
    return () => window.removeEventListener('focus', listener)
  },
  subscribeVisible: (listener) => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        listener()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  },
})
