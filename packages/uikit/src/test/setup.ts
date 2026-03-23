const originalAttachInternals = (HTMLElement.prototype as any).attachInternals as
  | ((...args: unknown[]) => any)
  | undefined

Object.defineProperty(HTMLElement.prototype, 'attachInternals', {
  configurable: true,
  value: function (...args: unknown[]) {
    const host = this as HTMLElement
    const internals =
      (originalAttachInternals ? originalAttachInternals.apply(host, args) : null) ?? {}

    let validityFlags: ValidityStateFlags =
      ((internals as {validity?: ValidityState}).validity as ValidityStateFlags | undefined) ?? {}
    let validationMessage =
      ((internals as {validationMessage?: string}).validationMessage as string | undefined) ?? ''

    if (typeof internals.setFormValue !== 'function') {
      internals.setFormValue = () => {}
    }

    if (typeof internals.setValidity !== 'function') {
      internals.setValidity = (flags: ValidityStateFlags = {}, message = '') => {
        validityFlags = flags
        validationMessage = message
        internals.validity = flags
        internals.validationMessage = message
      }
    }

    if (typeof internals.checkValidity !== 'function') {
      internals.checkValidity = () => !Object.values(validityFlags).some(Boolean)
    }

    if (typeof internals.reportValidity !== 'function') {
      internals.reportValidity = () => !Object.values(validityFlags).some(Boolean)
    }

    if (!('form' in internals)) {
      Object.defineProperty(internals, 'form', {
        configurable: true,
        enumerable: true,
        get() {
          const explicitTarget = host.getAttribute('form')
          if (explicitTarget) {
            const owner = host.ownerDocument?.getElementById(explicitTarget)
            return owner instanceof HTMLFormElement ? owner : null
          }

          return host.closest('form')
        },
      })
    }

    if (!('labels' in internals)) internals.labels = []
    if (!('validity' in internals)) internals.validity = validityFlags
    if (!('validationMessage' in internals)) internals.validationMessage = validationMessage
    if (!('willValidate' in internals)) internals.willValidate = true
    if (!('states' in internals)) internals.states = new Set<string>()

    return internals
  },
})
