import type {SshKeyType} from '@project/passmanager/types'
import {getAppContext} from 'root/shared/services/app-context'

export type PassmanagerSshKeygenResult = {
  key_id: string
  public_key_openssh: string
  fingerprint: string
  key_type: string
}

type PassmanagerSshKeygenResponse = {
  ok: boolean
  result?: PassmanagerSshKeygenResult
  error?: string
}

export async function passmanagerSshKeygen(params: {
  entryId: string
  keyType: SshKeyType
  comment: string
}): Promise<PassmanagerSshKeygenResult> {
  const {ws} = getAppContext()
  const response = (await ws.sendPassmanager('passmanager:ssh:keygen', {
    entry_id: params.entryId,
    key_type: params.keyType,
    comment: params.comment,
  })) as PassmanagerSshKeygenResponse

  if (!response?.ok || !response.result) {
    throw new Error(response?.error || 'passmanager:ssh:keygen failed')
  }

  return response.result
}
