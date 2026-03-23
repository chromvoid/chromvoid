import {describe, expect, it} from 'vitest'

import type {Entry} from '@project/passmanager'

import {PMEntryMobileModel} from '../../src/features/passmanager/components/card/entry/entry-mobile.model'

describe('PMEntryMobileModel', () => {
  it('builds mobile summary data from the shared entry render model', () => {
    const model = new PMEntryMobileModel()
    const entry = {
      title: '1cCloud',
      username: 'andry_diego@mail.ru',
      urls: [
        {match: 'domain', value: 'https://1ccloud.ru'},
        {match: 'regex', value: '^internal$'},
        {match: 'never', value: 'https://hidden.invalid'},
      ],
      otps: () => [{id: 'otp-1'}, {id: 'otp-2'}],
      sshKeys: [{id: 'ssh-1'}],
    } as unknown as Entry

    const data = model.getEntryData(entry)

    expect(data.title).toBe('1cCloud')
    expect(data.username).toBe('andry_diego@mail.ru')
    expect(data.hasOtps).toBe(true)
    expect(data.otpCount).toBe(2)
    expect(data.hasUrls).toBe(true)
    expect(data.websiteCount).toBe(2)
    expect(data.visibleUrls).toEqual([
      {
        value: 'https://1ccloud.ru',
        openable: true,
        href: 'https://1ccloud.ru',
      },
      {
        value: '^internal$',
        openable: false,
        href: '',
      },
    ])
    expect(data.hasSshKeys).toBe(true)
    expect(data.avatarBg).toMatch(/^oklch\(/)
  })
})
