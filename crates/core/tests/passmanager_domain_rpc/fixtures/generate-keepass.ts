// Synthetic fixtures only. Run with Bun from the repository root; existing kdbxweb is the independent writer.
import * as kdbx from '../../../../../packages/password-import/node_modules/kdbxweb'
const output = 'crates/core/tests/passmanager_domain_rpc/fixtures/'
const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString('synthetic-keepass-password'))
const db = kdbx.Kdbx.create(credentials, 'Synthetic KeePass')
const root = db.getDefaultGroup()
const excluded = db.createGroup(root, 'Excluded')
excluded.enableSearching = false
const skipped = db.createEntry(excluded)
skipped.fields.set('Title', 'Excluded record')
skipped.fields.set('Password', kdbx.ProtectedValue.fromString('not imported'))
const group = db.createGroup(root, 'Work')
group.notes = 'Synthetic group note'
const nested = db.createGroup(group, 'Team')
const entry = db.createEntry(nested)
entry.fields.set('Title', 'KeePass Mail')
entry.fields.set('UserName', 'alice@example.test')
entry.fields.set('Password', kdbx.ProtectedValue.fromString('  synthetic, "keepass"\npassword  '))
entry.fields.set('Notes', 'Synthetic private note')
entry.fields.set('URL', 'https://example.test')
entry.fields.set('PIN', kdbx.ProtectedValue.fromString('0420'))
entry.fields.set(
  'otp',
  'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&digits=8&period=60',
)
entry.tags = ['Work']
const {unzipSync} = await import('../../../../../packages/password-import/node_modules/fflate')
const sourceIcons = unzipSync(
  new Uint8Array(await Bun.file(output + '1password-credentials.1pux').arrayBuffer()),
)
const custom = kdbx.KdbxUuid.random()
db.meta.customIcons.set(custom.id, {data: sourceIcons['files/mail-icon___mail.png'].slice().buffer})
entry.customIcon = custom
group.customIcon = custom
const a = await db.createBinary(new TextEncoder().encode('synthetic attachment one').buffer)
const b = await db.createBinary(new TextEncoder().encode('synthetic attachment two').buffer)
entry.binaries.set('one.txt', a)
entry.binaries.set('two.txt', b)
const note = db.createEntry(root)
note.fields.set('Title', 'KeePass Note')
note.fields.set('Notes', 'Protected by the database password')
for (const version of [3, 4] as const) {
  db.setVersion(version)
  if (version === 3) db.header.keyEncryptionRounds = 1000
  else {
    db.setKdf(kdbx.Consts.KdfId.Aes)
    db.header.kdfParameters!.set('R', kdbx.VarDictionary.ValueType.UInt64, kdbx.Int64.from(1000))
  }
  await Bun.write(output + `keepass-${version}.kdbx`, await db.save())
}

// These use the same independently implemented writer; no expensive KDF is run.
db.setKdf(kdbx.Consts.KdfId.Argon2id)
db.header.kdfParameters!.set('M', kdbx.VarDictionary.ValueType.UInt64, kdbx.Int64.from(1024 * 1024 * 1024))
db.header.generateSalts()
const headerStream = new kdbx.BinaryStream()
db.header.write(headerStream)
const header = new Uint8Array(headerStream.getWrittenBytes())
const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', header))
const rejectedKdf = new Uint8Array(header.length + 64)
rejectedKdf.set(header)
rejectedKdf.set(hash, header.length)
await Bun.write(output + 'keepass-excessive-kdf.kdbx', rejectedKdf)
db.setKdf(kdbx.Consts.KdfId.Aes)
db.header.kdfParameters!.set('R', kdbx.VarDictionary.ValueType.UInt64, kdbx.Int64.from(1000))
note.fields.set('Notes', 'x'.repeat(32 * 1024 * 1024))
await Bun.write(output + 'keepass-expanded-limit.kdbx', await db.save())
note.fields.set('Notes', 'Synthetic nesting fixture')
let deep = root
for (let index = 0; index < 70; index++) deep = db.createGroup(deep, 'Nested')
await Bun.write(output + 'keepass-depth-limit.kdbx', await db.save())

const emptyPasswordDB = kdbx.Kdbx.create(
  new kdbx.Credentials(kdbx.ProtectedValue.fromString('')),
  'Synthetic empty password',
)
emptyPasswordDB.setVersion(4)
emptyPasswordDB.setKdf(kdbx.Consts.KdfId.Aes)
emptyPasswordDB.header.kdfParameters!.set('R', kdbx.VarDictionary.ValueType.UInt64, kdbx.Int64.from(1000))
emptyPasswordDB.createEntry(emptyPasswordDB.groups[0]).fields.set('Title', 'Empty password note')
await Bun.write(output + 'keepass-empty-password.kdbx', await emptyPasswordDB.save())

// Independent reference through OpenSSL with Argon2id support; no product dependency.
// Override the executable for another platform when regenerating these fixtures.
const openssl = process.env.KEEPASS_FIXTURE_OPENSSL ?? '/opt/homebrew/opt/openssl@3/bin/openssl'
kdbx.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, lanes, type, version) => {
  if (type !== kdbx.CryptoEngine.Argon2TypeArgon2id || version !== 0x13) {
    throw new Error('This fixture uses Argon2id version 0x13')
  }
  const child = Bun.spawn(
    [
      openssl,
      'kdf',
      '-binary',
      '-keylen',
      String(length),
      '-kdfopt',
      'hexpass:' + Buffer.from(password).toString('hex'),
      '-kdfopt',
      'hexsalt:' + Buffer.from(salt).toString('hex'),
      '-kdfopt',
      'memcost:' + memory,
      '-kdfopt',
      'iter:' + iterations,
      '-kdfopt',
      'lanes:' + lanes,
      'ARGON2ID',
    ],
    {stdout: 'pipe', stderr: 'pipe'},
  )
  const result = await new Response(child.stdout).arrayBuffer()
  if ((await child.exited) !== 0) throw new Error(await new Response(child.stderr).text())
  return result
})
const argonDB = kdbx.Kdbx.create(
  new kdbx.Credentials(kdbx.ProtectedValue.fromString('synthetic-keepass-password')),
  'Synthetic Argon2id',
)
argonDB.setVersion(4)
argonDB.setKdf(kdbx.Consts.KdfId.Argon2id)
argonDB.header.kdfParameters!.set('M', kdbx.VarDictionary.ValueType.UInt64, kdbx.Int64.from(8 * 1024 * 1024))
argonDB.header.kdfParameters!.set('I', kdbx.VarDictionary.ValueType.UInt64, kdbx.Int64.from(2))
argonDB.header.kdfParameters!.set('P', kdbx.VarDictionary.ValueType.UInt32, 1)
const argonEntry = argonDB.createEntry(argonDB.groups[0])
argonEntry.fields.set('Title', 'Argon2id login')
argonEntry.fields.set('Password', kdbx.ProtectedValue.fromString('synthetic Argon2id secret'))
await Bun.write(output + 'keepass-argon2id.kdbx', await argonDB.save())
