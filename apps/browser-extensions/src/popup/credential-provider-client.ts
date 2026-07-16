import {isSuccess} from '@chromvoid/scheme'
import type {
  CommandFnResult,
  CommandName,
  CommandRequest,
  CredentialCandidate,
  CredentialOneTimeCode,
  ProviderContext,
  ProviderStatus,
  RpcResult,
} from '@chromvoid/scheme'

import {autofillOtpOptions} from './otp-selection'

type GatewayRpc = {
  call<T>(command: string, data: Record<string, unknown>, timeoutMs?: number): Promise<RpcResult<T>>
  pairWithPin(pin: string, timeoutMs?: number): Promise<boolean>
  probeReachable(timeoutMs?: number): Promise<boolean>
}

type CredentialProviderCommand = Extract<CommandName, `credential_provider:${string}`>
export type WebProviderContext = Extract<ProviderContext, {kind: 'web'}>

export type SitePassword = {
  credentialId: string
  username: string
  password: string
}

export class CredentialProviderClientError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly command: string,
  ) {
    super(message)
    this.name = 'CredentialProviderClientError'
  }
}

const unwrap = <T>(command: string, response: RpcResult<T>): T => {
  if (isSuccess(response)) {
    return response.result
  }

  throw new CredentialProviderClientError(response.error, response.code, command)
}

const normalizeHostname = (hostname: string): string => {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '')
}

export const providerContextFromUrl = (value: string | undefined): WebProviderContext | undefined => {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined
    }

    const domain = normalizeHostname(url.hostname)
    if (!domain) {
      return undefined
    }

    return {kind: 'web', origin: url.origin, domain}
  } catch {
    return undefined
  }
}

export class CredentialProviderClient {
  constructor(private readonly gateway: GatewayRpc) {}

  async status(): Promise<ProviderStatus> {
    const result = await this.call('credential_provider:status', {})
    if (typeof result.enabled !== 'boolean' || typeof result.vault_open !== 'boolean') {
      throw new CredentialProviderClientError(
        'Credential provider returned an invalid status payload',
        null,
        'credential_provider:status',
      )
    }
    return result
  }

  pairWithPin(pin: string): Promise<boolean> {
    return this.gateway.pairWithPin(pin)
  }

  probeReachable(timeoutMs = 1200): Promise<boolean> {
    return this.gateway.probeReachable(timeoutMs)
  }

  async listForContext(context: WebProviderContext): Promise<CredentialCandidate[]> {
    const result = await this.call('credential_provider:list', {context})
    if (!Array.isArray(result.candidates)) {
      throw new CredentialProviderClientError(
        'Credential provider returned an invalid candidate list',
        null,
        'credential_provider:list',
      )
    }
    return result.candidates
  }

  async searchAll(query: string): Promise<CredentialCandidate[]> {
    const normalized = query.trim()
    if (!normalized) {
      return []
    }

    const result = await this.call('credential_provider:search', {query: normalized})
    if (!Array.isArray(result.candidates)) {
      throw new CredentialProviderClientError(
        'Credential provider returned an invalid search payload',
        null,
        'credential_provider:search',
      )
    }
    return result.candidates
  }

  async readPasswordForSite(context: WebProviderContext, credentialId: string): Promise<SitePassword> {
    await this.confirmForSite(context, credentialId)

    const secret = await this.withProviderSession((providerSession) =>
      this.call('credential_provider:getSecret', {
        provider_session: providerSession,
        credential_id: credentialId,
        context,
      }),
    )

    if (secret.credential_id !== credentialId || typeof secret.password !== 'string' || !secret.password) {
      throw new CredentialProviderClientError(
        'Password is unavailable for this credential',
        'secret_unavailable',
        'credential_provider:getSecret',
      )
    }

    return {
      credentialId: secret.credential_id,
      username: secret.username,
      password: secret.password,
    }
  }

  async readOneTimeCodeForSite(
    context: WebProviderContext,
    credentialId: string,
    otpId: string,
  ): Promise<CredentialOneTimeCode> {
    const candidate = await this.confirmForSite(context, credentialId)
    const hasOtp = autofillOtpOptions(candidate.otp_options ?? []).some((otp) => otp.id === otpId)
    if (!hasOtp) {
      throw new CredentialProviderClientError(
        'One-time-code profile is unavailable for this credential',
        'otp_unavailable',
        'credential_provider:getOneTimeCode',
      )
    }

    const code = await this.withProviderSession((providerSession) =>
      this.call('credential_provider:getOneTimeCode', {
        provider_session: providerSession,
        credential_id: credentialId,
        otp_id: otpId,
        context,
      }),
    )

    if (code.credential_id !== credentialId || code.otp_id !== otpId || !code.code) {
      throw new CredentialProviderClientError(
        'Credential provider returned an invalid one-time code',
        null,
        'credential_provider:getOneTimeCode',
      )
    }
    return code
  }

  private async confirmForSite(
    context: WebProviderContext,
    credentialId: string,
  ): Promise<CredentialCandidate> {
    const candidates = await this.listForContext(context)
    const candidate = candidates.find((item) => item.credential_id === credentialId)
    if (!candidate) {
      throw new CredentialProviderClientError(
        'Credential is not available for the current site',
        'credential_not_allowed',
        'credential_provider:list',
      )
    }
    return candidate
  }

  private async withProviderSession<T>(read: (providerSession: string) => Promise<T>): Promise<T> {
    const opened = await this.call('credential_provider:session:open', {})
    if (!opened.provider_session) {
      throw new CredentialProviderClientError(
        'Credential provider returned an invalid session',
        null,
        'credential_provider:session:open',
      )
    }

    let readFailed = false
    try {
      return await read(opened.provider_session)
    } catch (error) {
      readFailed = true
      throw error
    } finally {
      try {
        await this.call('credential_provider:session:close', {provider_session: opened.provider_session})
      } catch (error) {
        if (!readFailed) {
          throw error
        }
      }
    }
  }

  private async call<C extends CredentialProviderCommand>(
    command: C,
    data: CommandRequest<C>,
  ): Promise<CommandFnResult<C>> {
    return unwrap(
      command,
      await this.gateway.call<CommandFnResult<C>>(command, data as Record<string, unknown>),
    )
  }
}
