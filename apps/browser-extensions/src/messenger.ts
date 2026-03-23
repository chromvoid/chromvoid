import type {FullChromVoidState} from '@chromvoid/scheme'

import {addOnRuntimeMessageListener, sendRuntimeMessage, sendTabMessage} from './runtime/webextension-api'
import {getCurrentTab} from './utils'

export type UserData = {
  username: string
  id: string
}
export type FillPassword = UserData & {password: string}
export type FillOTP = UserData & {otp: string}

export type SWEventData = {
  isLockLoading: boolean
  isDeviceWaiting: boolean
  errorInit: string | undefined
  state: FullChromVoidState | undefined
  session: string | undefined
}

type BackgroundEventBus = {
  actions: {
    data: SWEventData
  }
  events: {
    on_popup_opened: void
    on_popup_closed: void
    request_state: void
    clear: void
  }
}

type PopupEventBus = {
  actions: {
    fill_form: FillPassword
    fill_otp: FillOTP
    on_popup_opened: void
    on_popup_closed: void
    request_state: void
    clear: void
  }
  events: {
    data: SWEventData
    response_records: UserData[]
  }
}

type InjectableEventBus = {
  actions: {}
  events: {
    fill_form: FillPassword
    fill_otp: FillOTP
  }
}

type IncomingMessage = {
  action: string
  data: unknown
}

const isIncomingMessage = (value: unknown): value is IncomingMessage => {
  return typeof value === 'object' && value !== null && 'action' in value
}

const createMessenger = <T extends BackgroundEventBus | InjectableEventBus | PopupEventBus>(from: string) =>
  class Messenger {
    private listeners: {
      action: keyof T['events']
      fn: (message: any) => void
    }[] = []

    constructor() {
      addOnRuntimeMessageListener((message, _sender) => {
        if (!isIncomingMessage(message)) {
          return
        }

        this.listeners.forEach((item) => {
          if (message.action === item.action) {
            item.fn(message.data)
          }
        })
      })
    }

    on<E extends keyof T['events']>(action: E, fn: (message: T['events'][E]) => void) {
      this.listeners.push({action, fn})
      return () => {
        this.listeners = this.listeners.filter((item) => item.fn !== fn)
      }
    }

    send<K extends keyof T['actions']>(action: K, data: T['actions'][K]) {
      return sendRuntimeMessage({
        action,
        data,
        from,
      })
    }

    async sendToActiveTab<K extends keyof T['actions']>(action: K, data: T['actions'][K]) {
      try {
        const tab = await getCurrentTab()
        if (tab?.id) {
          return sendTabMessage(tab.id, {
            action,
            from,
            data,
          })
        }

        return undefined
      } catch {
        return undefined
      }
    }
  }

export const PopupMessenger = createMessenger<PopupEventBus>('popup_script')
export const BackgroundMessenger = createMessenger<BackgroundEventBus>('server_script')
export const InjectingMessenger = createMessenger<InjectableEventBus>('inject_script')
