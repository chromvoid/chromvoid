import {defaultLogger} from 'root/core/logger'

export type TransientBackHandler = () => boolean

type TransientBackRegistration = {
  id: symbol
  order: number
  priority: number
  handler: TransientBackHandler
}

type RegisterTransientBackOptions = {
  priority?: number
}

class TransientBackModel {
  private order = 0
  private readonly registrations: TransientBackRegistration[] = []

  register(handler: TransientBackHandler, options: RegisterTransientBackOptions = {}): () => void {
    const registration = {
      id: Symbol('transient-back-handler'),
      order: this.order++,
      priority: options.priority ?? 0,
      handler,
    }
    this.registrations.push(registration)

    return () => {
      const index = this.registrations.findIndex((item) => item.id === registration.id)
      if (index >= 0) {
        this.registrations.splice(index, 1)
      }
    }
  }

  consumeBack(): boolean {
    const ordered = [...this.registrations].sort((a, b) => b.priority - a.priority || b.order - a.order)

    for (const registration of ordered) {
      if (!this.registrations.includes(registration)) {
        continue
      }

      try {
        if (registration.handler()) {
          return true
        }
      } catch (error) {
        defaultLogger.warn('[TransientBack] handler failed', error)
      }
    }

    return false
  }
}

export const transientBackModel = new TransientBackModel()
