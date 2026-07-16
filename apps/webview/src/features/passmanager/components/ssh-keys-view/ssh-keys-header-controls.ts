import type {
  WorkspaceDashboardHeaderControlsModel,
  WorkspaceDashboardHeaderFilterChip,
} from 'root/features/file-manager/components/workspace-dashboard-header'

import {i18n} from '@project/passmanager/i18n'
import type {PMSshKeysTypeFilter, PMSshKeysViewModel} from './ssh-keys-view.model'
import {pmSshKeysViewModel} from './ssh-keys-view.model'

const SSH_KEY_TYPE_FILTERS: readonly PMSshKeysTypeFilter[] = ['all', 'ed25519', 'rsa', 'ecdsa']

function isSshKeysTypeFilter(value: string): value is PMSshKeysTypeFilter {
  return SSH_KEY_TYPE_FILTERS.includes(value as PMSshKeysTypeFilter)
}

function getFilterChips(model: PMSshKeysViewModel): WorkspaceDashboardHeaderFilterChip[] {
  const rows = model.rows()
  const selectedType = model.typeFilter()

  return [
    {
      key: 'all',
      label: i18n('ssh:keys_view:filter:all' as never),
      count: rows.length,
      active: selectedType === 'all',
    },
    ...SSH_KEY_TYPE_FILTERS.filter((type) => type !== 'all').map((type) => ({
      key: type,
      label: i18n(`ssh:key_type:${type}` as never),
      count: rows.filter((row) => row.type === type).length,
      active: selectedType === type,
    })),
  ]
}

export function createSshKeysHeaderControlsModel(
  model: PMSshKeysViewModel = pmSshKeysViewModel,
): WorkspaceDashboardHeaderControlsModel {
  return {
    search: {
      value: model.query,
      placeholder: () => i18n('ssh:keys_view:search' as never),
      ariaLabel: () => i18n('ssh:keys_view:search' as never),
      setValue(value: string): void {
        model.setQuery(value)
      },
      clear(): void {
        model.setQuery('')
      },
    },
    filters: {
      chips: () => getFilterChips(model),
      value: model.typeFilter,
      selectionMode: 'single',
      ariaLabel: () => i18n('ssh:keys_view:filter' as never),
      setValue(value: string): void {
        if (isSshKeysTypeFilter(value)) model.setTypeFilter(value)
      },
    },
  }
}

export const sshKeysHeaderControlsModel = createSshKeysHeaderControlsModel()
