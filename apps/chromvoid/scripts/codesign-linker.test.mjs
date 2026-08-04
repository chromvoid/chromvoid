import {afterEach, describe, expect, test} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'

const tempDirs = []
const wrapper = path.resolve(import.meta.dirname, 'codesign-linker.sh')

function executable(dir, name, source) {
  const file = path.join(dir, name)
  fs.writeFileSync(file, source, {mode: 0o755})
  return file
}

function fixtures({codesignExit = 0, requirement = 'designated => identifier "com.chromvoid.app.dev"'} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromvoid-codesign-linker-'))
  tempDirs.push(dir)
  const cc = executable(
    dir,
    'cc',
    '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "-o" ]; then shift; printf "#!/bin/sh\\n" > "$1"; chmod 755 "$1"; exit 0; fi; shift; done\nexit 2\n',
  )
  const codesign = executable(
    dir,
    'codesign',
    `#!/bin/sh\ncase "$*" in\n  *"-dv --verbose=4"*) printf 'Identifier=com.chromvoid.app.dev\\nAuthority=ChromVoid Dev\\n' >&2 ;;\n  *"-d -r-"*) printf '${requirement}\\n' >&2 ;;\n  *"--sign"*) exit ${codesignExit} ;;\nesac\nexit 0\n`,
  )
  return {dir, cc, codesign}
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true})
})

describe('codesign linker wrapper', () => {
  test('signs the main executable with a stable identifier', () => {
    const {dir, cc, codesign} = fixtures()
    const output = path.join(dir, 'chromvoid')
    const result = spawnSync('bash', [wrapper, '-o', output], {
      env: {...process.env, CHROMVOID_CODESIGN_CC: cc, CHROMVOID_CODESIGN_TOOL: codesign},
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(fs.existsSync(output)).toBe(true)
  })

  test('propagates code-signing failures', () => {
    const {dir, cc, codesign} = fixtures({codesignExit: 7})
    const result = spawnSync('bash', [wrapper, '-o', path.join(dir, 'chromvoid')], {
      env: {...process.env, CHROMVOID_CODESIGN_CC: cc, CHROMVOID_CODESIGN_TOOL: codesign},
      encoding: 'utf8',
    })

    expect(result.status).toBe(7)
  })

  test('rejects a cdhash-only designated requirement', () => {
    const {dir, cc, codesign} = fixtures({requirement: 'designated => cdhash H"ABCD"'})
    const result = spawnSync('bash', [wrapper, '-o', path.join(dir, 'chromvoid')], {
      env: {...process.env, CHROMVOID_CODESIGN_CC: cc, CHROMVOID_CODESIGN_TOOL: codesign},
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
  })
})
