import {Result} from '@project/utils/src/result'

import type {ApiRouter, ApiRoutes} from './types/api-scheme'

type FSApiErrorType = 'TIMEOUT' | 'API_ERROR'

class ApiError extends Error {
  type: FSApiErrorType
  reason: unknown
  constructor(error: FSApiErrorType, reason?: unknown) {
    super(error)
    this.type = error
    this.reason = reason
  }
}

export class ChromVoidApi {
  static sessionName = 'stor-session'
  static defaultBase = 'http://chromvoid.local/'
  private base = ChromVoidApi.defaultBase
  session = ''
  mock?: {
    fetch: <T extends ApiRoutes>(url: T, req: ApiRouter[T]['request'], method: 'POST' | 'GET') => Promise<any>
  }
  constructor(_base: string) {
    // this.setBase(base)
  }
  setBase(base: string) {
    if (!base.endsWith('/')) {
      base += '/'
    }
    this.base = base
  }
  private getUrl(url: string, method: 'POST' | 'GET', req: Record<string, unknown>) {
    if (method === 'GET') {
      const paramsString = Object.keys(req)
        .reduce((acc, key) => {
          acc.push(`${key}=${(req as any)[key]}`)
          return acc
        }, [] as Array<string>)
        .join('&')
      return this.base + (paramsString ? `${url}/?${paramsString}` : url + '/')
    }
    return this.base + url + '/'
  }

  private getBody(method: 'POST' | 'GET', req: Record<string, unknown>) {
    if (method === 'POST') {
      const body = new FormData()
      Object.keys(req).forEach((key) => {
        body.append(key, (req as any)[key])
      })
      return body
    }
    return undefined
  }

  private async fetch<T extends ApiRoutes>(
    url: T,
    req: ApiRouter[T]['request'],
    method: 'POST' | 'GET' = 'GET',
    timeout = 20000,
  ): Promise<Result<ApiRouter[T]['response'], ApiError>> {
    if (this.mock) {
      return this.mock.fetch(url, req, method) as Promise<Result<ApiRouter[T]['response'], ApiError>>
    }
    const target = this.getUrl(url, method, req)
    const body = this.getBody(method, req)

    try {
      const res = await fetch(target, {
        method,
        body,

        headers: {
          ...(method === 'POST' && this.session ? {'stor-session': this.session} : undefined),
        },
        signal: AbortSignal.timeout(timeout),
      })

      if (res.ok) {
        let result = await res.text()
        try {
          return Result.success<ApiRouter[T]['response'], ApiError>(JSON.parse(result))
        } catch {
          return Result.success<ApiRouter[T]['response'], ApiError>(result)
        }
      }

      return Result.failure<ApiError, number>(new ApiError('API_ERROR', res.status))
    } catch (e) {
      return Result.failure<ApiError, number>(new ApiError('API_ERROR', (e as Error).message))
    }
  }

  private postMethods: Array<ApiRoutes> = [
    'api.unlockstorage',
    'api.lockstorage',
    'api.userinit',
    'api.changemasterpwd',
    'api.erasedevice',
    'api.backupdevice',
    'api.restoredevice',
    'api.extinitstorage',
    'api.read',
    'api.write',
    'api.saveotp',
    'api.removeotp',
    'api.getotp',
    'api.getotpseckey',
    'api.start',
    'api.setipandhostname',
    'api.checksession',
  ]

  call<T extends ApiRoutes>(url: T, req: ApiRouter[T]['request'] = {}, timeout = 15000) {
    if (this.postMethods.includes(url)) {
      return this.fetch(url, req, 'POST', 20000)
    }
    return this.fetch(url, req, 'GET', timeout)
  }
}
