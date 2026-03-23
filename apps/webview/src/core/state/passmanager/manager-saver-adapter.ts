import type {ManagerSaver, OTPGetParams, OTPSecretsGateway, PasswordsRepository} from '@project/passmanager'
import {SAVE_KEY} from '@project/passmanager/src/consts'
import type {Logger} from '../../logger'
import {defaultLogger} from '../../logger'

export class ManagerSaverAdapter implements ManagerSaver {
  constructor(
    private readonly repo: PasswordsRepository,
    private readonly secrets: OTPSecretsGateway,
    private readonly logger: Logger = defaultLogger,
  ) {}

  async save(_key: string, value: File): Promise<boolean> {
    try {
      try {
        this.logger.debug('[PassManager][Adapter.save] begin', {
          key: _key,
          name: value?.name,
          size: value?.size,
          type: value?.type,
        })
      } catch {}
      if (_key === SAVE_KEY) {
        try {
          this.logger.debug('[PassManager][Adapter.save] SAVE_KEY → repo.saveRoot')
        } catch {}
        const ok = await this.repo.saveRoot(value)
        try {
          this.logger.debug('[PassManager][Adapter.save] SAVE_KEY result', {ok})
        } catch {}
        return ok
      }
      try {
        this.logger.debug('[PassManager][Adapter.save] ignored non-root key', {key: _key})
      } catch {}
      return true
    } catch {
      if (value?.name === 'PASSWORDMANAGER') {
        try {
          this.logger.debug('[PassManager][Adapter.save] fallback → repo.saveRoot')
        } catch {}
        const ok = await this.repo.saveRoot(value)
        try {
          this.logger.debug('[PassManager][Adapter.save] fallback result', {ok})
        } catch {}
        return ok
      }
      try {
        this.logger.debug('[PassManager][Adapter.save] fallback ignored', {key: _key})
      } catch {}
      return true
    }
  }

  async read<T = unknown>(_key: string): Promise<T | undefined> {
    try {
      if (_key === SAVE_KEY) {
        return this.repo.readRoot<T>()
      }
      return undefined
    } catch {
      return undefined
    }
  }

  async remove(_key: string): Promise<boolean> {
    return this.repo.removeRoot()
  }

  getOTP(data: OTPGetParams): Promise<string | undefined> {
    return this.secrets.getOTP(data)
  }

  getOTPSeckey(id: string): Promise<string | undefined> {
    return this.secrets.getOTPSeckey(id)
  }

  removeOTP(id: string): Promise<boolean> {
    return this.secrets.removeOTP(id)
  }

  async saveOTP(id: string, secret: string): Promise<boolean> {
    try {
      this.logger.debug('[PassManager][Adapter.saveOTP] begin', {
        id,
        secretLen: typeof secret === 'string' ? secret.length : 0,
      })
    } catch {}
    const ok = await this.secrets.saveOTP(id, secret)
    try {
      this.logger.debug('[PassManager][Adapter.saveOTP] result', {id, ok})
    } catch {}
    return ok
  }

  async readEntryPassword(entryId: string): Promise<string | undefined> {
    try {
      this.logger.debug('[PassManager][Adapter.readEntryPassword] begin', {entryId})
    } catch {}
    const out = await this.repo.readEntryPassword(entryId)
    try {
      this.logger.debug('[PassManager][Adapter.readEntryPassword] result', {
        entryId,
        ok: typeof out === 'string',
      })
    } catch {}
    return out
  }

  async readEntryNote(entryId: string): Promise<string | undefined> {
    try {
      this.logger.debug('[PassManager][Adapter.readEntryNote] begin', {entryId})
    } catch {}
    const out = await this.repo.readEntryNote(entryId)
    try {
      this.logger.debug('[PassManager][Adapter.readEntryNote] result', {entryId, ok: typeof out === 'string'})
    } catch {}
    return out
  }

  async saveEntryPassword(entryId: string, password: string | null): Promise<boolean> {
    try {
      this.logger.debug('[PassManager][Adapter.saveEntryPassword] begin', {
        entryId,
        length: password?.length ?? null,
      })
    } catch {}
    const ok = await this.repo.saveEntryPassword(entryId, password)
    try {
      this.logger.debug('[PassManager][Adapter.saveEntryPassword] result', {entryId, ok})
    } catch {}
    return ok
  }

  async saveEntryNote(entryId: string, note: string | null): Promise<boolean> {
    try {
      this.logger.debug('[PassManager][Adapter.saveEntryNote] begin', {entryId, length: note?.length ?? null})
    } catch {}
    const ok = await this.repo.saveEntryNote(entryId, note)
    try {
      this.logger.debug('[PassManager][Adapter.saveEntryNote] result', {entryId, ok})
    } catch {}
    return ok
  }

  async removeEntryPassword(entryId: string): Promise<boolean> {
    try {
      this.logger.debug('[PassManager][Adapter.removeEntryPassword] begin', {entryId})
    } catch {}
    const ok = await this.repo.removeEntryPassword(entryId)
    try {
      this.logger.debug('[PassManager][Adapter.removeEntryPassword] result', {entryId, ok})
    } catch {}
    return ok
  }

  async removeEntryNote(entryId: string): Promise<boolean> {
    try {
      this.logger.debug('[PassManager][Adapter.removeEntryNote] begin', {entryId})
    } catch {}
    const ok = await this.repo.removeEntryNote(entryId)
    try {
      this.logger.debug('[PassManager][Adapter.removeEntryNote] result', {entryId, ok})
    } catch {}
    return ok
  }

  async readEntrySshPrivateKey(entryId: string, keyId: string): Promise<string | undefined> {
    try {
      this.logger.debug('[PassManager][Adapter.readEntrySshPrivateKey] begin', {entryId, keyId})
    } catch {}
    const out = await this.repo.readEntrySshPrivateKey(entryId, keyId)
    try {
      this.logger.debug('[PassManager][Adapter.readEntrySshPrivateKey] result', {
        entryId,
        keyId,
        ok: typeof out === 'string',
      })
    } catch {}
    return out
  }

  async readEntrySshPublicKey(entryId: string, keyId: string): Promise<string | undefined> {
    try {
      this.logger.debug('[PassManager][Adapter.readEntrySshPublicKey] begin', {entryId, keyId})
    } catch {}
    const out = await this.repo.readEntrySshPublicKey(entryId, keyId)
    try {
      this.logger.debug('[PassManager][Adapter.readEntrySshPublicKey] result', {
        entryId,
        keyId,
        ok: typeof out === 'string',
      })
    } catch {}
    return out
  }

  async getIcon(iconRef: string): Promise<{iconRef: string; mimeType: string; contentBase64: string}> {
    if (!this.repo.getIcon) {
      throw new Error('PassManager icon repository is not available')
    }
    const out = await this.repo.getIcon(iconRef)
    return out
  }

  async saveEntrySshPrivateKey(entryId: string, keyId: string, key: string | null): Promise<boolean> {
    try {
      this.logger.debug('[PassManager][Adapter.saveEntrySshPrivateKey] begin', {
        entryId,
        keyId,
        length: key?.length ?? null,
      })
    } catch {}
    const ok = await this.repo.saveEntrySshPrivateKey(entryId, keyId, key)
    try {
      this.logger.debug('[PassManager][Adapter.saveEntrySshPrivateKey] result', {entryId, keyId, ok})
    } catch {}
    return ok
  }

  async saveEntrySshPublicKey(entryId: string, keyId: string, key: string | null): Promise<boolean> {
    try {
      this.logger.debug('[PassManager][Adapter.saveEntrySshPublicKey] begin', {
        entryId,
        keyId,
        length: key?.length ?? null,
      })
    } catch {}
    const ok = await this.repo.saveEntrySshPublicKey(entryId, keyId, key)
    try {
      this.logger.debug('[PassManager][Adapter.saveEntrySshPublicKey] result', {entryId, keyId, ok})
    } catch {}
    return ok
  }

  async removeEntrySshPrivateKey(entryId: string, keyId: string): Promise<boolean> {
    try {
      this.logger.debug('[PassManager][Adapter.removeEntrySshPrivateKey] begin', {entryId, keyId})
    } catch {}
    const ok = await this.repo.removeEntrySshPrivateKey(entryId, keyId)
    try {
      this.logger.debug('[PassManager][Adapter.removeEntrySshPrivateKey] result', {entryId, keyId, ok})
    } catch {}
    return ok
  }

  async removeEntrySshPublicKey(entryId: string, keyId: string): Promise<boolean> {
    try {
      this.logger.debug('[PassManager][Adapter.removeEntrySshPublicKey] begin', {entryId, keyId})
    } catch {}
    const ok = await this.repo.removeEntrySshPublicKey(entryId, keyId)
    try {
      this.logger.debug('[PassManager][Adapter.removeEntrySshPublicKey] result', {entryId, keyId, ok})
    } catch {}
    return ok
  }

  saveEntryMeta(data: Parameters<ManagerSaver['saveEntryMeta']>[0]): Promise<boolean> {
    return this.repo.saveEntryMeta(data)
  }

  removeEntry(id: string): Promise<boolean> {
    return this.repo.removeEntry(id)
  }
}
