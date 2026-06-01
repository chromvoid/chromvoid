import {SAVE_KEY} from '@project/passmanager/consts'
import type {PasswordsRepository, OTPSecretsGateway} from '@project/passmanager/ports'
import type {
  ManagerSaver,
  OTPGetParams,
  PassManagerSecretSlot,
  PassManagerSaveEntryMetaPayload,
} from '@project/passmanager/types'
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

  async readEntrySecret(entryId: string, slot: PassManagerSecretSlot): Promise<string | undefined> {
    try {
      this.logger.debug('[PassManager][Adapter.readEntrySecret] begin', {entryId, slot})
    } catch {}
    const out = await this.repo.readEntrySecret(entryId, slot)
    try {
      this.logger.debug('[PassManager][Adapter.readEntrySecret] result', {
        entryId,
        slot,
        ok: typeof out === 'string',
      })
    } catch {}
    return out
  }

  async saveEntrySecret(
    entryId: string,
    slot: PassManagerSecretSlot,
    value: string | null,
  ): Promise<boolean> {
    try {
      this.logger.debug('[PassManager][Adapter.saveEntrySecret] begin', {
        entryId,
        slot,
        length: value?.length ?? null,
      })
    } catch {}
    const ok = await this.repo.saveEntrySecret(entryId, slot, value)
    try {
      this.logger.debug('[PassManager][Adapter.saveEntrySecret] result', {entryId, slot, ok})
    } catch {}
    return ok
  }

  async removeEntrySecret(entryId: string, slot: PassManagerSecretSlot): Promise<boolean> {
    try {
      this.logger.debug('[PassManager][Adapter.removeEntrySecret] begin', {entryId, slot})
    } catch {}
    const ok = await this.repo.removeEntrySecret(entryId, slot)
    try {
      this.logger.debug('[PassManager][Adapter.removeEntrySecret] result', {entryId, slot, ok})
    } catch {}
    return ok
  }

  async readEntryPassword(entryId: string): Promise<string | undefined> {
    return this.readEntrySecret(entryId, 'password')
  }

  async readEntryNote(entryId: string): Promise<string | undefined> {
    return this.readEntrySecret(entryId, 'note')
  }

  async saveEntryPassword(entryId: string, password: string | null): Promise<boolean> {
    return this.saveEntrySecret(entryId, 'password', password)
  }

  async saveEntryNote(entryId: string, note: string | null): Promise<boolean> {
    return this.saveEntrySecret(entryId, 'note', note)
  }

  async removeEntryPassword(entryId: string): Promise<boolean> {
    return this.removeEntrySecret(entryId, 'password')
  }

  async removeEntryNote(entryId: string): Promise<boolean> {
    return this.removeEntrySecret(entryId, 'note')
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

  async getIcon(iconRef: string): Promise<{
    iconRef: string
    mimeType: string
    backgroundColor?: string
    contentBase64: string
  }> {
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

  saveEntryMeta(data: PassManagerSaveEntryMetaPayload): Promise<boolean> {
    return this.repo.saveEntryMeta(data)
  }

  moveEntryToGroup(entryId: string, targetGroupPath: string | undefined): Promise<boolean> {
    return this.repo.moveEntryToGroup(entryId, targetGroupPath)
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

  removeEntry(id: string): Promise<boolean> {
    return this.repo.removeEntry(id)
  }
}
