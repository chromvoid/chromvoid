import {queryActiveTab} from './runtime/webextension-api'

export const getCurrentTab = () => {
  return queryActiveTab()
}
