import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageRoot = path.resolve(__dirname, '..')
const backlogPath = path.join(packageRoot, 'specs', 'ISSUE-BACKLOG.md')

const mvpNextByIssue = {
  'HLS-150': 'select',
  'HLS-151': 'popover',
  'HLS-152': 'context-menu',
  'HLS-153': 'command-palette',
  'HLS-154': 'toast',
  'HLS-155': 'progress',
}

const parseArgs = (argv) => {
  const result = {}

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]

    if (!value.startsWith('--')) continue

    const key = value.slice(2)
    const next = argv[i + 1]

    if (next == null || next.startsWith('--')) {
      result[key] = 'true'
      continue
    }

    result[key] = next
    i += 1
  }

  return result
}

const printHelp = () => {
  console.log(
    'Usage: node scripts/generate-changelog.mjs --mode <full|patch> --date <YYYY-MM-DD> [--issues HLS-161,HLS-162] [--out <path>]',
  )
  console.log('')
  console.log('Options:')
  console.log('  --mode    full | patch')
  console.log('  --date    required release date for deterministic output')
  console.log('  --issues  required in patch mode (csv list, e.g. HLS-161,HLS-162)')
  console.log('  --out     output markdown path (defaults by mode)')
  console.log('')
  console.log('Environment fallbacks:')
  console.log('  RELEASE_DATE, CHANGELOG_ISSUES')
}

const normalizeIssueList = (raw) => {
  if (!raw) return []
  return raw
    .split(/[\s,]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
}

const issueNumber = (issueId) => {
  const parsed = Number.parseInt(issueId.replace('HLS-', ''), 10)
  if (Number.isNaN(parsed)) return Number.MAX_SAFE_INTEGER
  return parsed
}

const parseBacklogIssues = (markdown) => {
  const lines = markdown.split(/\r?\n/)
  const issues = []
  let current = null

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(HLS-\d+)\s+-\s+(.+)$/)
    if (headingMatch) {
      if (current != null) {
        issues.push(current)
      }

      current = {
        id: headingMatch[1],
        title: headingMatch[2].trim(),
        body: [],
      }
      continue
    }

    if (current != null) {
      current.body.push(line)
    }
  }

  if (current != null) {
    issues.push(current)
  }

  return issues.map((issue) => {
    const body = issue.body.join('\n')
    const status = body.match(/- \*\*Status\*\*:\s*(.+)$/m)?.[1]?.trim() ?? 'Unknown'
    const milestone = body.match(/- \*\*Milestone\*\*:\s*(.+)$/m)?.[1]?.trim() ?? 'Unknown'

    return {
      id: issue.id,
      title: issue.title,
      status,
      milestone,
    }
  })
}

const escapeCell = (value) => value.replace(/\|/g, '\\|')

const args = parseArgs(process.argv.slice(2))

if (args.help === 'true') {
  printHelp()
  process.exit(0)
}

const mode = args.mode ?? 'full'
if (!['full', 'patch'].includes(mode)) {
  throw new Error(`invalid mode '${mode}'. expected 'full' or 'patch'.`)
}

const releaseDate = args.date ?? process.env.RELEASE_DATE
if (!releaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
  throw new Error('missing or invalid release date. pass --date YYYY-MM-DD (or set RELEASE_DATE).')
}

const requestedIssues = normalizeIssueList(args.issues ?? process.env.CHANGELOG_ISSUES)
if (mode === 'patch' && requestedIssues.length === 0) {
  throw new Error('patch mode requires --issues (csv) or CHANGELOG_ISSUES env var.')
}

const defaultOutPath =
  mode === 'full'
    ? path.join(packageRoot, 'specs', 'release', 'changelog.generated.md')
    : path.join(packageRoot, 'specs', 'release', 'changelog.patch.generated.md')
const outPath = path.resolve(packageRoot, args.out ?? defaultOutPath)

const backlogText = await readFile(backlogPath, 'utf8')
const issues = parseBacklogIssues(backlogText)
const issueById = new Map(issues.map((issue) => [issue.id, issue]))

const doneSnapshot = backlogText.match(/^- Done:\s*(.+)$/m)?.[1]?.trim() ?? 'not found'
const nextRecommended = backlogText.match(/^- Next Recommended:\s*(.+)$/m)?.[1]?.trim() ?? 'not found'

let selectedIssues
if (mode === 'full') {
  selectedIssues = issues
    .filter((issue) => issue.status.toLowerCase() === 'done')
    .filter((issue) => issueNumber(issue.id) >= 150)
} else {
  const missing = requestedIssues.filter((id) => !issueById.has(id))
  if (missing.length > 0) {
    throw new Error(`requested issues not found in backlog: ${missing.join(', ')}`)
  }

  selectedIssues = requestedIssues.map((id) => issueById.get(id))
}

selectedIssues.sort((left, right) => issueNumber(left.id) - issueNumber(right.id))

const mvpTranche = Object.entries(mvpNextByIssue)
  .map(([id, component]) => {
    const issue = issueById.get(id)
    if (!issue) {
      return {id, component, status: 'Missing from backlog'}
    }

    return {id, component, status: issue.status}
  })
  .sort((left, right) => issueNumber(left.id) - issueNumber(right.id))

const lines = []
lines.push('<!-- prettier-ignore-start -->')
lines.push('# Changelog (Generated)')
lines.push('')
lines.push(`Date: ${releaseDate}`)
lines.push('Package: `@chromvoid/headless-ui`')
lines.push(`Mode: \`${mode}\``)
if (mode === 'patch') {
  lines.push(`Patch issues: \`${requestedIssues.join(', ')}\``)
}
lines.push('')
lines.push('## Source Evidence')
lines.push('')
lines.push('- Backlog: `specs/ISSUE-BACKLOG.md`')
lines.push(`- Execution status snapshot (Done): ${doneSnapshot}`)
lines.push(`- Execution status snapshot (Next Recommended): ${nextRecommended}`)
lines.push('')
lines.push('## Included Issues')
lines.push('')
lines.push('| ID | Title | Milestone | Status |')
lines.push('| --- | --- | --- | --- |')

if (selectedIssues.length === 0) {
  lines.push('| none | no matching issues for selected mode | - | - |')
} else {
  for (const issue of selectedIssues) {
    lines.push(
      `| ${issue.id} | ${escapeCell(issue.title)} | ${escapeCell(issue.milestone)} | ${escapeCell(issue.status)} |`,
    )
  }
}

lines.push('')
lines.push('## MVP-next Component Tranche')
lines.push('')
lines.push('| Component | Issue | Status |')
lines.push('| --- | --- | --- |')
for (const entry of mvpTranche) {
  lines.push(`| ${entry.component} | ${entry.id} | ${entry.status} |`)
}

lines.push('')
lines.push('## Gate Evidence References')
lines.push('')
lines.push('- `specs/release/consumer-integration.md`')
lines.push('- `specs/release/release-rehearsal.md`')
lines.push('- `specs/release/semver-deprecation-dry-run.md`')
lines.push('- `specs/release/api-freeze-candidate.md`')

lines.push('')
lines.push('## Manual Overrides')
lines.push('')
lines.push('Maintainers may edit this generated file before final publication.')
lines.push('If edited, keep generated sections intact and document overrides below.')
lines.push('')
lines.push('<!-- manual-overrides:start -->')
lines.push('- none')
lines.push('<!-- manual-overrides:end -->')
lines.push('')
lines.push('<!-- prettier-ignore-end -->')

await mkdir(path.dirname(outPath), {recursive: true})
await writeFile(outPath, `${lines.join('\n')}`, 'utf8')

console.log(`changelog-generator: wrote ${path.relative(packageRoot, outPath)}`)
console.log(`changelog-generator: mode=${mode}, issues=${selectedIssues.length}, date=${releaseDate}`)
