import {computed} from '@reatom/core'

import {Group, type ManagerRoot} from '@project/passmanager/core'
import {i18n as pmI18n} from '@project/passmanager/i18n'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {notesQuickViewModel} from 'root/features/file-manager/components/notes-quick-view/notes-quick-view.model'
import {
  getNotesQuickViewDisplayModeLabel,
  getNotesQuickViewSortLabel,
} from 'root/features/file-manager/components/notes-quick-view/notes-quick-view.presentation'
import {PMGroupModel, type PMGroupMetric} from 'root/features/passmanager/components/group/group/group.model'
import {sortDirection, sortField} from 'root/features/passmanager/components/list/sort-controls.model'
import {getSortFieldLabel} from 'root/features/passmanager/components/list/sort-options'
import {pmOtpQuickViewModel} from 'root/features/passmanager/components/otp-quick-view/otp-quick-view.model'
import {getPassmanagerShowElement} from 'root/features/passmanager/models/pm-root.adapter'
import {i18n as appI18n} from 'root/i18n'
import {tryGetAppContext, type AppContext} from 'root/shared/services/app-context'

export type StatusBarContextTone = 'neutral' | 'accent' | 'warning' | 'danger'
export type StatusBarContextPriority = 'essential' | 'supporting' | 'optional'

type StatusBarContextItemBase = {
  id: string
  tone: StatusBarContextTone
  priority: StatusBarContextPriority
  operational?: boolean
}

export type StatusBarContextTextItem = StatusBarContextItemBase & {
  kind: 'text'
  text: string
}

export type StatusBarContextMetricItem = StatusBarContextItemBase & {
  kind: 'metric'
  label: string
  value: string | number
}

export type StatusBarContextItem = StatusBarContextTextItem | StatusBarContextMetricItem

export type StatusBarContextSummary = {
  id: 'notes' | 'passwords-group' | 'passwords-otp'
  label: string
  startItems: readonly StatusBarContextItem[]
  endItems: readonly StatusBarContextItem[]
  busy?: boolean
  securityStatus?: string
}

class StatusBarSummaryModel {
  private readonly groupModel = new PMGroupModel()

  readonly current = computed<StatusBarContextSummary | null>(
    () => this.resolveCurrentSummary(),
    'shell.statusBar.contextSummary',
  )

  private resolveCurrentSummary(): StatusBarContextSummary | null {
    const ctx = tryGetAppContext()
    if (!ctx) return null
    if (this.getRoute(ctx) !== 'dashboard') return null
    if (this.getLayoutMode(ctx) !== 'desktop') return null

    const surface = navigationModel.currentSurface()
    if (surface === 'notes') {
      return this.resolveNotesSummary()
    }
    if (surface === 'passwords') {
      return this.resolvePasswordsSummary()
    }

    return null
  }

  private getRoute(ctx: AppContext): string | null {
    const route = ctx.router?.route
    return typeof route === 'function' ? route() : null
  }

  private getLayoutMode(ctx: AppContext): string | null {
    const layoutMode = (ctx.store as {layoutMode?: () => string}).layoutMode
    return typeof layoutMode === 'function' ? layoutMode() : null
  }

  private resolveNotesSummary(): StatusBarContextSummary {
    const state = notesQuickViewModel.state

    return {
      id: 'notes',
      label: appI18n('notes:quick_view:summary:label' as never),
      startItems: [
        createTextItem('count', state.summary().label, 'essential'),
        createTextItem(
          'sort',
          appI18n('notes:quick_view:summary:sorted_by' as never, {
            sort: getNotesQuickViewSortLabel(state.sortMode()),
          }),
          'supporting',
        ),
      ],
      endItems: [
        createTextItem(
          'view',
          appI18n('notes:quick_view:summary:view' as never, {
            view: getNotesQuickViewDisplayModeLabel(state.displayMode()),
          }),
          'optional',
        ),
      ],
    }
  }

  private resolvePasswordsSummary(): StatusBarContextSummary | null {
    const showElement = getPassmanagerShowElement()
    if (showElement === 'otpView') {
      return this.resolveOtpSummary()
    }
    if (showElement instanceof Group || this.groupModel.isManagerRoot(showElement)) {
      return this.resolveGroupSummary(showElement)
    }

    return null
  }

  private resolveOtpSummary(): StatusBarContextSummary {
    const summary = pmOtpQuickViewModel.state.summary()
    const startItems: StatusBarContextItem[] = [
      createMetricItem('total', pmI18n('otp:quick_view:summary:total'), summary.total, 'essential'),
    ]
    if (summary.visible !== summary.total) {
      startItems.push(
        createMetricItem('visible', pmI18n('otp:quick_view:summary:visible'), summary.visible, 'essential'),
      )
    }

    return {
      id: 'passwords-otp',
      label: pmI18n('otp:quick_view:summary:total'),
      startItems,
      endItems: [
        createMetricItem('totp', pmI18n('otp:quick_view:summary:totp'), summary.totp, 'supporting'),
        createMetricItem('hotp', pmI18n('otp:quick_view:summary:hotp'), summary.hotp, 'supporting'),
      ],
    }
  }

  private resolveGroupSummary(group: Group | ManagerRoot): StatusBarContextSummary | null {
    const isRoot = this.groupModel.isManagerRoot(group)
    const items = this.groupModel.getUniqueRows(this.groupModel.getVisibleRows(group))
    const summary = this.groupModel.getGroupPresentation(group, items, isRoot)
    const entries = summary.metrics.find((metric) => metric.id === 'entries')
    if (!entries || entries.value === null) return null

    const loading = summary.securityStatus === 'idle' || summary.securityStatus === 'loading'
    const endItems: StatusBarContextItem[] = []
    if (loading) {
      endItems.push(
        createTextItem('security-loading', pmI18n('metrics:loading'), 'essential', 'accent', true),
      )
    } else {
      if (summary.securityStatus === 'degraded') {
        endItems.push(
          createTextItem('security-degraded', pmI18n('metrics:degraded'), 'essential', 'warning', true),
        )
      }
      endItems.push(
        ...summary.metrics.filter((metric) => metric.id !== 'entries').map(createSecurityMetricItem),
      )
    }

    return {
      id: 'passwords-group',
      label: pmI18n('metrics:title'),
      startItems: [
        createMetricItem('entries', entries.label, entries.value, 'essential'),
        createTextItem('sort', getCredentialsSortLabel(), 'supporting'),
      ],
      endItems,
      busy: loading,
      securityStatus: summary.securityStatus,
    }
  }
}

function createTextItem(
  id: string,
  text: string,
  priority: StatusBarContextPriority,
  tone: StatusBarContextTone = 'neutral',
  operational = false,
): StatusBarContextTextItem {
  return {kind: 'text', id, text, priority, tone, operational}
}

function createMetricItem(
  id: string,
  label: string,
  value: string | number,
  priority: StatusBarContextPriority,
  tone: StatusBarContextTone = 'neutral',
): StatusBarContextMetricItem {
  return {kind: 'metric', id, label, value, priority, tone}
}

function createSecurityMetricItem(metric: PMGroupMetric): StatusBarContextMetricItem {
  const value = metric.value ?? 0
  if (metric.family === 'risk') {
    return createMetricItem(
      metric.id,
      metric.label,
      value,
      value > 0 ? 'essential' : 'optional',
      value > 0 ? (metric.severity === 'critical' ? 'danger' : 'warning') : 'neutral',
    )
  }

  return createMetricItem(metric.id, metric.label, value, 'supporting', 'accent')
}

function getCredentialsSortLabel(): string {
  return `${pmI18n('sort-by')} ${getSortFieldLabel(sortField())} · ${pmI18n(
    sortDirection() === 'asc' ? 'sort:direction:asc-short' : 'sort:direction:desc-short',
  )}`
}

export const statusBarSummaryModel = new StatusBarSummaryModel()
