import {Group, type ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'

import type {PMCredentialGroupRiskSummary} from '../../../models/pm-credential-security-audit.model'

export type PMGroupRiskIndicator = {
  severity: 'warning' | 'critical'
  label: string
  count: number
} | null

export function formatGroupCount(value: number, noun: string): string {
  if (noun === 'entry') return `${value} ${value === 1 ? 'entry' : 'entries'}`
  return `${value} ${noun}${value === 1 ? '' : 's'}`
}

export function getGroupRiskIndicator(
  summary: PMCredentialGroupRiskSummary,
): PMGroupRiskIndicator {
  const weakPasswordCount = summary.weakPasswordCount ?? 0
  if (weakPasswordCount > 0) {
    return {
      severity: 'critical',
      count: weakPasswordCount,
      label: i18n('group:risk:weak_passwords', {count: String(weakPasswordCount)}),
    }
  }

  const reusedPasswordCount = summary.reusedPasswordCount ?? 0
  if (reusedPasswordCount > 0) {
    return {
      severity: 'warning',
      count: reusedPasswordCount,
      label: i18n('group:risk:reused_passwords', {count: String(reusedPasswordCount)}),
    }
  }

  return null
}

export function getGroupDeletionParent(group: Group): Group | ManagerRoot {
  const parentPath = getGroupParentPath(group)
  if (!parentPath) return group.root
  return (
    group.root
      .entriesList()
      .find((item): item is Group => item instanceof Group && item.name === parentPath) ?? group.root
  )
}

export function getGroupParentPath(group: Group): string | null {
  const separator = group.name.lastIndexOf('/')
  return separator <= 0 ? null : group.name.slice(0, separator)
}

export function getDeletionNeighbourId(
  rows: readonly {id: string}[],
  deletedId: string,
): string | undefined {
  const index = rows.findIndex((row) => row.id === deletedId)
  if (index < 0) return undefined

  const survivors = rows.filter((row) => row.id !== deletedId)
  return survivors[Math.min(index, survivors.length - 1)]?.id
}
