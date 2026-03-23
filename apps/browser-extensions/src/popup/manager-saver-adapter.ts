import type {ManagerSaver, OTPGetParams} from '@project/passmanager'
import type {CredentialCandidate, CredentialSecret, ProviderContext, RpcResult} from '@chromvoid/scheme'

const ROOT_KEY = 'PASSWORDMANAGER'

const normalizeDomain = (input: string | undefined): string | undefined => {
  if (!input) {
    return undefined
  }

  const trimmed = input.trim()
  if (!trimmed) {
    return undefined
  }

  try {
    const normalized = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname
      .toLowerCase()
      .replace(/^www\./, '')
    return normalized || undefined
  } catch {
    return undefined
  }
}

const buildRootPayload = (candidates: CredentialCandidate[]) => {
  const now = Date.now()
  return {
    version: 2,
    createdTs: now,
    updatedTs: now,
    folders: [],
    entries: candidates.map((candidate) => {
      const domain = normalizeDomain(candidate.domain)
      return {
        id: candidate.credential_id,
        title: candidate.label || candidate.credential_id,
        username: candidate.username || '',
        urls: domain ? [{value: `https://${domain}`, match: 'base_domain'}] : [],
        otps: [{id: 'default', label: 'default'}],
        folderPath: null,
      }
    }),
  }
}

type GatewayRpc = {
  call<T>(command: string, data: Record<string, unknown>, timeoutMs?: number): Promise<RpcResult<T>>
}

const isRpcSuccess = <T>(value: RpcResult<T>): value is {ok: true; result: T} => {
  return value.ok === true
}

class ExtensionManagerSaver implements ManagerSaver {
  constructor(
    private readonly gateway: GatewayRpc,
    private readonly getCurrentUrl: () => string | undefined,
  ) {}

  private resolveContext(): ProviderContext | undefined {
    const value = this.getCurrentUrl()
    if (!value) {
      return undefined
    }

    try {
      const url = new URL(value)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return undefined
      }

      const domain = normalizeDomain(url.hostname)
      if (!domain) {
        return undefined
      }

      return {
        kind: 'web',
        origin: url.toString(),
        domain,
      }
    } catch {
      return undefined
    }
  }

  private async listCandidates(context: ProviderContext): Promise<CredentialCandidate[]> {
    const response = await this.gateway.call<{candidates: CredentialCandidate[]}>(
      'credential_provider:list',
      {context},
    )
    if (!isRpcSuccess(response)) {
      return []
    }

    const candidates = response.result?.candidates
    return Array.isArray(candidates) ? candidates : []
  }

  private async openProviderSession(): Promise<string | undefined> {
    const opened = await this.gateway.call<{provider_session: string}>('credential_provider:session:open', {})
    if (!isRpcSuccess(opened)) {
      return undefined
    }

    const token = opened.result?.provider_session
    return typeof token === 'string' && token ? token : undefined
  }

  private async readCredentialSecret(entryId: string): Promise<CredentialSecret | undefined> {
    const context = this.resolveContext()
    if (!context) {
      return undefined
    }

    void (await this.listCandidates(context))

    const providerSession = await this.openProviderSession()
    if (!providerSession) {
      return undefined
    }

    const secretResponse = await this.gateway.call<CredentialSecret>('credential_provider:getSecret', {
      provider_session: providerSession,
      credential_id: entryId,
      context,
    })

    if (!isRpcSuccess(secretResponse)) {
      return undefined
    }

    return secretResponse.result
  }

  async save(_key: string, _value: File): Promise<boolean> {
    return false
  }

  async read<T = unknown>(key: string): Promise<T | undefined> {
    if (key === ROOT_KEY) {
      const context = this.resolveContext()
      if (!context) {
        return undefined
      }

      const candidates = await this.listCandidates(context)
      return buildRootPayload(candidates) as T
    }

    return undefined
  }

  async remove(_key: string): Promise<boolean> {
    return false
  }

  async getOTP(data: OTPGetParams): Promise<string | undefined> {
    const entryId = data.entryId || data.id
    if (!entryId) {
      return undefined
    }

    const secret = await this.readCredentialSecret(entryId)
    return typeof secret?.otp === 'string' && secret.otp ? secret.otp : undefined
  }

  async getOTPSeckey(_id: string): Promise<string | undefined> {
    return undefined
  }

  async removeOTP(_id: string): Promise<boolean> {
    return false
  }

  async saveOTP(_id: string, _secret: string): Promise<boolean> {
    return false
  }

  readEntryPassword(entryId: string): Promise<string | undefined> {
    return (async () => {
      const secret = await this.readCredentialSecret(entryId)
      return typeof secret?.password === 'string' && secret.password ? secret.password : undefined
    })()
  }

  async readEntryNote(_entryId: string): Promise<string | undefined> {
    return undefined
  }

  async readEntrySshPrivateKey(_entryId: string, _keyId: string): Promise<string | undefined> {
    return undefined
  }

  async readEntrySshPublicKey(_entryId: string, _keyId: string): Promise<string | undefined> {
    return undefined
  }

  async saveEntryPassword(_entryId: string, _password: string): Promise<boolean> {
    return false
  }

  async saveEntryNote(_entryId: string, _note: string): Promise<boolean> {
    return false
  }

  async removeEntryPassword(_entryId: string): Promise<boolean> {
    return false
  }

  async removeEntryNote(_entryId: string): Promise<boolean> {
    return false
  }

  async saveEntrySshPrivateKey(_entryId: string, _keyId: string, _key: string): Promise<boolean> {
    return false
  }

  async saveEntrySshPublicKey(_entryId: string, _keyId: string, _key: string): Promise<boolean> {
    return false
  }

  async removeEntrySshPrivateKey(_entryId: string, _keyId: string): Promise<boolean> {
    return false
  }

  async removeEntrySshPublicKey(_entryId: string, _keyId: string): Promise<boolean> {
    return false
  }

  async saveEntryMeta(_data: Parameters<ManagerSaver['saveEntryMeta']>[0]): Promise<boolean> {
    return false
  }

  async removeEntry(_id: string): Promise<boolean> {
    return false
  }
}

export const createExtensionManagerSaver = (
  gateway: GatewayRpc,
  getCurrentUrl: () => string | undefined,
): ManagerSaver => {
  return new ExtensionManagerSaver(gateway, getCurrentUrl)
}
