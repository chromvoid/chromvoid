import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageRoot = path.resolve(__dirname, '..')

const EVENT_PATH = process.env.GITHUB_EVENT_PATH

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim()
    const stdout = (result.stdout || '').trim()
    const details = stderr || stdout || 'unknown command failure'
    throw new Error(`${command} ${args.join(' ')} failed: ${details}`)
  }

  return (result.stdout || '').trim()
}

const getGitRoot = () => run('git', ['rev-parse', '--show-toplevel'], packageRoot)

const getChangedFiles = (baseSha, headSha) => {
  const gitRoot = getGitRoot()
  const output = run('git', ['diff', '--name-only', `${baseSha}...${headSha}`], gitRoot)
  if (!output) return []
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

if (!EVENT_PATH || !existsSync(EVENT_PATH)) {
  console.log('release-governance: no GITHUB_EVENT_PATH, skipping (local/non-GitHub run)')
  process.exit(0)
}

const payload = JSON.parse(readFileSync(EVENT_PATH, 'utf8'))
const pullRequest = payload.pull_request

if (!pullRequest) {
  console.log('release-governance: no pull_request payload, skipping')
  process.exit(0)
}

const prTitle = pullRequest.title || ''
const prBody = pullRequest.body || ''
const labels = (pullRequest.labels || [])
  .map((label) => {
    if (typeof label === 'string') return label
    if (label && typeof label.name === 'string') return label.name
    return null
  })
  .filter(Boolean)

const isReleasePr =
  labels.includes('release') ||
  /^release(?:\(|:|\s|-)/i.test(prTitle) ||
  /^release\//i.test(pullRequest.head?.ref || '')

if (!isReleasePr) {
  console.log('release-governance: non-release PR context, skipping checks')
  process.exit(0)
}

const errors = []
const combinedText = `${prTitle}\n${prBody}`
const semverMatch = combinedText.match(/\bSemVer\s*:\s*(patch|minor|major)\b/i)
const semverClass = semverMatch?.[1]?.toLowerCase() ?? null

if (!semverClass) {
  errors.push('missing SemVer classification. Add `SemVer: patch|minor|major` to PR body.')
}

if (!/\bADR-003\b/i.test(combinedText)) {
  errors.push('missing ADR-003 reference in PR body.')
}

if (semverClass === 'major') {
  const migrationRefMatch = prBody.match(/^\s*Migration\s*Notes?\s*:\s*(.+)\s*$/im)
  const migrationRef = migrationRefMatch?.[1]?.trim().toLowerCase() ?? ''

  if (!migrationRef || migrationRef === 'none' || migrationRef === 'n/a' || migrationRef === '-') {
    errors.push('major release requires `Migration Notes: <path or link>` in PR body.')
  }

  try {
    const changedFiles = getChangedFiles(pullRequest.base.sha, pullRequest.head.sha)
    const hasMigrationNotesUpdate = changedFiles.some(
      (filePath) =>
        filePath === 'specs/release/migration-notes-pre-v1.md' ||
        filePath === 'packages/headless/specs/release/migration-notes-pre-v1.md',
    )

    if (!hasMigrationNotesUpdate) {
      errors.push('major release must include changes in specs/release/migration-notes-pre-v1.md.')
    }
  } catch (error) {
    errors.push(`unable to validate changed files for migration notes: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (errors.length > 0) {
  console.error('release-governance: FAILED')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log(`release-governance: OK (SemVer: ${semverClass})`)
