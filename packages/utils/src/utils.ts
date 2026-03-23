export const fetchWithTimeout = async (resource: string, options?: RequestInit & {timeout: number}) => {
  const {timeout, ...init} = options ?? {timeout: 8000}

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  const response = await fetch(resource, {
    ...init,
    signal: controller.signal,
  })
  clearTimeout(id)

  return response
}

export const createTimestamp = () => Math.round(Date.now() / 1000)
export const crypto = globalThis.crypto || globalThis.msCrypto

declare global {
  var msCrypto: Crypto
}

export function invariant(condition: any, message: string): asserts condition {
  if (condition === undefined) {
    throw new Error(message)
  }
}
export function shallowClone<T extends Record<string, unknown>>(obj: T): T {
  return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj))
}

export function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
export const getFormData = <T>(form: HTMLFormElement): T => {
  const formData = new FormData(form)
  const data = Object.fromEntries(formData)
  return data as T
}
