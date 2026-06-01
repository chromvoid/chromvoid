import {atom, computed, wrap} from '@reatom/core'

import {Entry, Group, type ManagerRoot} from '@project/passmanager/core'
import {
  createCredentialAuditResult,
  type CredentialAuditEntryInput,
  type CredentialAuditEntrySummary,
} from '@project/passmanager/security-audit'
import {subscribeAfterInitial, type Unsubscribe} from 'root/shared/services/subscribed-signal'

export type PMCredentialAuditStatus = 'idle' | 'loading' | 'ready' | 'degraded'
export type PMCredentialRiskSeverity = 'unknown' | 'none' | 'warning' | 'critical'
export type PMCredentialDominantRisk = 'reused_passwords' | 'weak_passwords' | null

export type PMCredentialAuditSnapshot = {
  status: PMCredentialAuditStatus
  entries: ReadonlyMap<string, CredentialAuditEntrySummary>
  failedEntryIds: ReadonlySet<string>
  revision: string
}

export type PMCredentialGroupRiskSummary = {
  status: PMCredentialAuditStatus
  entryCount: number
  reusedPasswordCount: number | null
  weakPasswordCount: number | null
  twoFactorCount: number | null
  failedEntryCount: number
  riskSeverity: PMCredentialRiskSeverity
  dominantRisk: PMCredentialDominantRisk
}

function getEntryOtpCount(entry: Entry): number {
  if (entry.entryType !== 'login') return 0
  return entry.otps().length
}

function buildEntryRevision(entry: Entry): string {
  return [
    entry.groupPath ?? '',
    entry.id,
    entry.entryType,
    entry.updatedTs,
    getEntryOtpCount(entry),
  ].join(':')
}

function getDirectEntries(target: Group | ManagerRoot): Entry[] {
  if (target instanceof Group) return target.entries()
  return target.topLevelEntries
}

export class PMCredentialSecurityAuditModel {
  readonly status = atom<PMCredentialAuditStatus>('idle')
  readonly entries = atom<ReadonlyMap<string, CredentialAuditEntrySummary>>(new Map())
  readonly failedEntryIds = atom<ReadonlySet<string>>(new Set<string>())
  readonly revision = atom('')

  readonly snapshot = computed<PMCredentialAuditSnapshot>(
    () => ({
      status: this.status(),
      entries: this.entries(),
      failedEntryIds: this.failedEntryIds(),
      revision: this.revision(),
    }),
    'pmCredentialSecurityAudit.snapshot',
  )

  private root: ManagerRoot | undefined
  private rootUnsubscribers: Unsubscribe[] = []
  private childUnsubscribers: Unsubscribe[] = []
  private scanToken = 0

  attachRoot(root: ManagerRoot): void {
    if (this.root === root) return

    this.dispose()
    this.root = root
    this.rootUnsubscribers = [
      subscribeAfterInitial(root.entries, () => this.handleRootChanged(root)),
      subscribeAfterInitial(root.updatedTs, () => this.reconcileRoot(root)),
    ]
    this.handleRootChanged(root)
  }

  dispose(): void {
    this.scanToken += 1
    this.root = undefined
    this.clearRootSubscriptions()
    this.clearChildSubscriptions()
    this.status.set('idle')
    this.entries.set(new Map())
    this.failedEntryIds.set(new Set<string>())
    this.revision.set('')
  }

  getEntryState(entry: Entry): CredentialAuditEntrySummary | undefined {
    return this.entries().get(entry.id)
  }

  summarizeGroup(target: Group | ManagerRoot): PMCredentialGroupRiskSummary {
    return this.summarizeEntries(getDirectEntries(target))
  }

  summarizeEntries(entries: readonly Entry[]): PMCredentialGroupRiskSummary {
    const snapshot = this.snapshot()
    const entryCount = entries.length

    if (snapshot.status === 'idle' || snapshot.status === 'loading') {
      return {
        status: snapshot.status,
        entryCount,
        reusedPasswordCount: null,
        weakPasswordCount: null,
        twoFactorCount: null,
        failedEntryCount: this.countFailedEntries(entries, snapshot.failedEntryIds),
        riskSeverity: 'unknown',
        dominantRisk: null,
      }
    }

    let reusedPasswordCount = 0
    let weakPasswordCount = 0
    let twoFactorCount = 0

    for (const entry of entries) {
      const state = snapshot.entries.get(entry.id)
      if (!state) continue
      if (state.reusedPassword) reusedPasswordCount += 1
      if (state.weakPassword) weakPasswordCount += 1
      if (state.hasTwoFactor) twoFactorCount += 1
    }

    return {
      status: snapshot.status,
      entryCount,
      reusedPasswordCount,
      weakPasswordCount,
      twoFactorCount,
      failedEntryCount: this.countFailedEntries(entries, snapshot.failedEntryIds),
      riskSeverity: weakPasswordCount > 0 ? 'critical' : reusedPasswordCount > 0 ? 'warning' : 'none',
      dominantRisk:
        weakPasswordCount > 0 ? 'weak_passwords' : reusedPasswordCount > 0 ? 'reused_passwords' : null,
    }
  }

  private handleRootChanged(root: ManagerRoot): void {
    if (this.root !== root) return
    this.syncChildSubscriptions(root)
    this.reconcileRoot(root)
  }

  private reconcileRoot(root: ManagerRoot): void {
    if (this.root !== root) return

    if (root.entries() === undefined) {
      this.scanToken += 1
      this.status.set('idle')
      this.entries.set(new Map())
      this.failedEntryIds.set(new Set<string>())
      this.revision.set('')
      return
    }

    const revision = this.buildRootRevision(root)
    if (revision === this.revision() && this.status() !== 'idle') return

    this.revision.set(revision)
    void this.scanRoot(root, revision)
  }

  private syncChildSubscriptions(root: ManagerRoot): void {
    this.clearChildSubscriptions()
    if (root.entries() === undefined) return

    for (const item of root.entriesList()) {
      if (item instanceof Group) {
        this.childUnsubscribers.push(
          subscribeAfterInitial(item.entries, () => this.handleRootChanged(root)),
        )
      }
    }

    for (const entry of root.allEntries) {
      this.childUnsubscribers.push(
        subscribeAfterInitial(entry.otps, () => this.reconcileRoot(root)),
      )
    }
  }

  private async scanRoot(root: ManagerRoot, revision: string): Promise<void> {
    const token = this.scanToken + 1
    this.scanToken = token
    this.status.set('loading')
    this.failedEntryIds.set(new Set<string>())

    const failedEntryIds = new Set<string>()
    const inputs = await wrap(
      Promise.all(
        root.allEntries.map(async (entry): Promise<CredentialAuditEntryInput> => {
          let password: string | undefined

          if (entry.entryType === 'login') {
            try {
              password = await wrap(entry.password())
            } catch {
              failedEntryIds.add(entry.id)
            }
          }

          return {
            id: entry.id,
            entryType: entry.entryType,
            password,
            otpCount: getEntryOtpCount(entry),
          }
        }),
      ),
    )

    if (this.scanToken !== token || this.root !== root || this.revision() !== revision) return

    const result = createCredentialAuditResult(inputs)
    this.entries.set(new Map(result.entries))
    this.failedEntryIds.set(failedEntryIds)
    this.status.set(failedEntryIds.size > 0 ? 'degraded' : 'ready')
  }

  private buildRootRevision(root: ManagerRoot): string {
    const itemTokens: string[] = []

    for (const item of root.entriesList()) {
      if (item instanceof Entry) {
        itemTokens.push(`entry:${buildEntryRevision(item)}`)
      } else {
        itemTokens.push(`group:${item.id}:${item.name}:${item.entries().map(buildEntryRevision).join(',')}`)
      }
    }

    return `loaded:${root.updatedTs()}:${itemTokens.join('|')}`
  }

  private countFailedEntries(entries: readonly Entry[], failedEntryIds: ReadonlySet<string>): number {
    let count = 0
    for (const entry of entries) {
      if (failedEntryIds.has(entry.id)) count += 1
    }
    return count
  }

  private clearRootSubscriptions(): void {
    for (const unsubscribe of this.rootUnsubscribers) unsubscribe()
    this.rootUnsubscribers = []
  }

  private clearChildSubscriptions(): void {
    for (const unsubscribe of this.childUnsubscribers) unsubscribe()
    this.childUnsubscribers = []
  }
}

export const pmCredentialSecurityAuditModel = new PMCredentialSecurityAuditModel()
