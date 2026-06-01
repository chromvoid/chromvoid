import {strToU8, zipSync} from 'fflate'
import {describe, expect, it} from 'vitest'

import {parse1Password1PUX} from './1password.js'

function create1PuxFile(
  exportData: unknown,
  files: Record<string, string | Uint8Array> = {},
  name = 'vault.1pux',
): File {
  const archive = zipSync({
    'export.attributes': strToU8(JSON.stringify({version: 1})),
    'export.data': strToU8(JSON.stringify(exportData)),
    ...Object.fromEntries(
      Object.entries(files).map(([path, content]) => [
        path,
        typeof content === 'string' ? strToU8(content) : content,
      ]),
    ),
  })

  return createBinaryFile(new Uint8Array(archive), name)
}

function createBinaryFile(bytes: Uint8Array, name: string): File {
  const buffer = new ArrayBuffer(bytes.byteLength)
  const copy = new Uint8Array(buffer)
  copy.set(bytes)
  const file = new File([buffer], name, {type: 'application/octet-stream'})
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => buffer.slice(0),
  })
  return file
}

function createBaseExport(items: unknown[], vaultOverrides: Record<string, unknown> = {}) {
  return {
    accounts: [
      {
        vaults: [
          {
            attrs: {
              uuid: 'vault-1',
              name: 'Personal',
              ...vaultOverrides,
            },
            items,
          },
        ],
      },
    ],
  }
}

describe('1Password 1PUX parser', () => {
  it('parses a login item with urls, notes, custom fields, otp, and icons', async () => {
    const file = create1PuxFile(
      createBaseExport(
        [
          {
            uuid: 'item-1',
            categoryUuid: '001',
            details: {
              loginFields: [
                {designation: 'username', value: 'user@test.com'},
                {designation: 'password', fieldType: 'P', value: {concealed: 'secret123'}},
                {
                  title: 'One-time password',
                  value: 'otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30',
                },
              ],
              notesPlain: 'Imported from 1Password',
              sections: [
                {
                  title: 'Security',
                  fields: [{title: 'Recovery Key', value: 'abc-def'}],
                },
              ],
            },
            overview: {
              title: 'GitHub',
              subtitle: 'Personal account',
              url: 'https://github.com',
              urls: [
                {label: 'Primary URL', url: 'https://github.com', mode: 'default'},
                {label: 'Gist URL', url: 'https://gist.github.com', mode: 'host'},
              ],
              tags: ['Work', 'Client', 'Work'],
              icons: [{fileName: 'item-icon.png'}],
            },
          },
        ],
        {avatar: 'vault-icon.png'},
      ),
      {
        'files/item-icon.png': new Uint8Array([137, 80, 78, 71]),
        'files/vault-icon.png': new Uint8Array([137, 80, 78, 71]),
      },
    )

    const result = await parse1Password1PUX(file)

    expect(result.warnings).toEqual([])
    expect(result.folders).toMatchObject([
      {
        id: 'vault-1',
        name: 'Personal',
        path: 'Personal',
        icon: {mimeType: 'image/png'},
      },
    ])
    expect(result.entries).toMatchObject([
      {
        id: 'item-1',
        type: 'login',
        name: 'GitHub',
        username: 'user@test.com',
        password: 'secret123',
        folder: 'Personal',
        notes: 'Imported from 1Password\n\nPersonal account',
        customFields: [{key: 'Security: Recovery Key', value: 'abc-def'}],
        tags: ['Work', 'Client'],
        urls: [
          {value: 'https://github.com', match: 'base_domain'},
          {value: 'https://gist.github.com', match: 'host'},
        ],
        otp: {
          secret: 'JBSWY3DPEHPK3PXP',
          label: 'GitHub',
          type: 'TOTP',
        },
        icon: {mimeType: 'image/png'},
      },
    ])
    expect(result.entries[0]?.icon?.contentBase64).toBeTruthy()
    expect(result.folders[0]?.icon?.contentBase64).toBeTruthy()
  })

  it('parses password items as login entries when they include a password', async () => {
    const file = create1PuxFile(
      createBaseExport([
        {
          uuid: 'password-1',
          categoryUuid: '005',
          details: {
            password: 'generated-password',
          },
          overview: {
            title: 'Standalone Password',
          },
        },
      ]),
    )

    const result = await parse1Password1PUX(file)

    expect(result.entries).toMatchObject([
      {
        id: 'password-1',
        type: 'login',
        name: 'Standalone Password',
        password: 'generated-password',
      },
    ])
  })

  it('parses secure note items', async () => {
    const file = create1PuxFile(
      createBaseExport([
        {
          uuid: 'note-1',
          categoryUuid: '003',
          details: {
            notesPlain: 'Secret note body',
          },
          overview: {
            title: 'Personal note',
          },
        },
      ]),
    )

    const result = await parse1Password1PUX(file)

    expect(result.entries).toMatchObject([
      {
        id: 'note-1',
        type: 'secure_note',
        name: 'Personal note',
        notes: 'Secret note body',
      },
    ])
  })

  it('degrades credit card and identity items into secure notes with details', async () => {
    const file = create1PuxFile(
      createBaseExport([
        {
          uuid: 'card-1',
          categoryUuid: '002',
          details: {
            sections: [
              {
                title: 'Card',
                fields: [
                  {title: 'Number', value: '4111111111111111'},
                  {title: 'CVV', value: {concealed: '123'}},
                ],
              },
            ],
          },
          overview: {
            title: 'Visa',
          },
        },
        {
          uuid: 'identity-1',
          categoryUuid: '004',
          details: {
            sections: [
              {
                title: 'Identity',
                fields: [
                  {title: 'First Name', value: 'John'},
                  {title: 'Email', value: 'john@example.com'},
                ],
              },
            ],
          },
          overview: {
            title: 'Passport',
          },
        },
      ]),
    )

    const result = await parse1Password1PUX(file)

    expect(result.entries[0]).toMatchObject({
      type: 'secure_note',
      notes: expect.stringContaining('Credit Card Details'),
      customFields: [
        {key: 'Card: Number', value: '4111111111111111'},
        {key: 'Card: CVV', value: '123'},
      ],
    })
    expect(result.entries[1]).toMatchObject({
      type: 'secure_note',
      notes: expect.stringContaining('Identity Details'),
      customFields: [
        {key: 'Identity: First Name', value: 'John'},
        {key: 'Identity: Email', value: 'john@example.com'},
      ],
    })
  })

  it('imports unsupported categories as secure notes with a warning', async () => {
    const file = create1PuxFile(
      createBaseExport([
        {
          uuid: 'server-1',
          categoryUuid: '999',
          details: {
            sections: [
              {
                title: 'Server',
                fields: [{title: 'Hostname', value: 'db.internal'}],
              },
            ],
          },
          overview: {
            title: 'Database',
          },
        },
      ]),
    )

    const result = await parse1Password1PUX(file)

    expect(result.entries).toMatchObject([
      {
        id: 'server-1',
        type: 'secure_note',
        name: 'Database',
      },
    ])
    expect(result.warnings).toContain(
      'Imported "Database" as secure note from unsupported 1Password category 999',
    )
  })

  it('skips document items with a warning', async () => {
    const file = create1PuxFile(
      createBaseExport([
        {
          uuid: 'document-1',
          categoryUuid: '006',
          details: {
            documentAttributes: {
              documentId: 'doc-1',
              fileName: 'passport.pdf',
              decryptedSize: 42,
            },
          },
          overview: {
            title: 'Passport PDF',
          },
        },
      ]),
    )

    const result = await parse1Password1PUX(file)

    expect(result.entries).toEqual([])
    expect(result.warnings).toContain('Skipped Document item "Passport PDF"')
  })

  it('warns and continues when icon files are missing', async () => {
    const file = create1PuxFile(
      createBaseExport([
        {
          uuid: 'item-1',
          categoryUuid: '001',
          details: {
            loginFields: [
              {designation: 'username', value: 'user@test.com'},
              {designation: 'password', value: {concealed: 'secret123'}},
            ],
          },
          overview: {
            title: 'GitHub',
            icons: [{fileName: 'missing-icon.png'}],
          },
        },
      ]),
    )

    const result = await parse1Password1PUX(file)

    expect(result.entries[0]?.icon).toBeUndefined()
    expect(result.warnings).toContain('Failed to import icon for item "GitHub"')
  })

  it('warns when attachments are present but still imports the item', async () => {
    const file = create1PuxFile(
      createBaseExport([
        {
          uuid: 'item-1',
          categoryUuid: '001',
          details: {
            loginFields: [
              {designation: 'username', value: 'user@test.com'},
              {designation: 'password', value: {concealed: 'secret123'}},
            ],
            documentAttributes: {
              documentId: 'attachment-1',
              fileName: 'backup.txt',
              decryptedSize: 20,
            },
          },
          overview: {
            title: 'GitHub',
          },
        },
      ]),
    )

    const result = await parse1Password1PUX(file)

    expect(result.entries).toHaveLength(1)
    expect(result.warnings).toContain('Skipped attachments for "GitHub"')
  })

  it('rejects malformed archives and invalid export payloads', async () => {
    const malformed = createBinaryFile(new Uint8Array([1, 2, 3]), 'broken.1pux')

    await expect(parse1Password1PUX(malformed)).rejects.toThrow('Invalid 1PUX archive')

    const missingExport = createBinaryFile(zipSync({'export.attributes': strToU8('{}')}), 'missing.1pux')
    await expect(parse1Password1PUX(missingExport)).rejects.toThrow('missing export.data')

    const invalidJson = createBinaryFile(
      zipSync({
        'export.attributes': strToU8('{}'),
        'export.data': strToU8('not json'),
      }),
      'invalid-json.1pux',
    )
    await expect(parse1Password1PUX(invalidJson)).rejects.toThrow('Invalid export.data JSON')
  })

  it('enforces file size and entry count limits', async () => {
    const oversized = create1PuxFile(createBaseExport([]))
    Object.defineProperty(oversized, 'size', {value: 51 * 1024 * 1024})
    await expect(parse1Password1PUX(oversized)).rejects.toThrow('File too large')

    const items = Array.from({length: 10_001}, (_, index) => ({
      uuid: `item-${index}`,
      categoryUuid: '001',
      details: {
        loginFields: [
          {designation: 'username', value: `user-${index}`},
          {designation: 'password', value: {concealed: `secret-${index}`}},
        ],
      },
      overview: {
        title: `Entry ${index}`,
      },
    }))

    const result = await parse1Password1PUX(create1PuxFile(createBaseExport(items)))

    expect(result.entries).toHaveLength(10_000)
    expect(result.warnings).toContain('Entry limit reached (10000). Remaining items skipped.')
  })
})
