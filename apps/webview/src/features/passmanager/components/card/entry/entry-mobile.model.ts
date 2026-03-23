import {Entry} from '@project/passmanager'
import type {PMEntryActionUrl} from '../../../models/entry.model'
import {PMEntryModel} from './entry.model'

export type MobileEntryModelData = {
  entryTitleText: string
  entryAvatarLetter: string
  title: string
  username: string
  avatarBg: string
  hasOtps: boolean
  otpCount: number
  hasUrls: boolean
  websiteCount: number
  hasSshKeys: boolean
  visibleUrls: PMEntryActionUrl[]
}

export class PMEntryMobileModel extends PMEntryModel {
  override getEntryData(card: Entry): MobileEntryModelData {
    const base = super.getEntryData(card)
    const otpCount = card.otps().length
    return {
      entryTitleText: base.entryTitleText,
      entryAvatarLetter: base.entryAvatarLetter,
      title: base.entryTitleText,
      username: card.username || '—',
      avatarBg: base.avatarBg,
      hasOtps: base.hasOtps,
      otpCount,
      hasUrls: base.hasUrls,
      websiteCount: base.visibleUrls.length,
      hasSshKeys: card.sshKeys.length > 0,
      visibleUrls: base.visibleUrls,
    }
  }
}
