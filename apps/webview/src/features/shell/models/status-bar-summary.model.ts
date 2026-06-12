import {computed} from '@reatom/core'

import {Group, type ManagerRoot} from '@project/passmanager/core'
import {i18n as pmI18n} from '@project/passmanager/i18n'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {i18n as appI18n} from 'root/i18n'
import {tryGetAppContext, type AppContext} from 'root/shared/services/app-context'
import {getFileManagerModel} from 'root/features/file-manager/file-manager.model'
import {notesQuickViewModel} from 'root/features/file-manager/components/notes-quick-view/notes-quick-view.model'
import {pmOtpQuickViewModel} from 'root/features/passmanager/components/otp-quick-view/otp-quick-view.model'
import type {PMSummaryRailItem, PMSummaryRailTone} from 'root/features/passmanager/components/summary-rail'
import {PMGroupModel, type PMGroupMetric} from 'root/features/passmanager/components/group/group/group.model'
import {getPassmanagerShowElement} from 'root/features/passmanager/models/pm-root.adapter'

export type StatusBarSummaryRail = {
  id: 'files' | 'notes' | 'passwords-group' | 'passwords-otp'
  label: string
  items: readonly PMSummaryRailItem[]
  busy?: boolean
  status?: string
}

class StatusBarSummaryModel {
  private readonly groupModel = new PMGroupModel()

  readonly current = computed<StatusBarSummaryRail | null>(
    () => this.resolveCurrentSummary(),
    'shell.statusBar.summaryRail',
  )

  private resolveCurrentSummary(): StatusBarSummaryRail | null {
    const ctx = tryGetAppContext()
    if (!ctx) return null
    if (this.getRoute(ctx) !== 'dashboard') return null
    if (this.getLayoutMode(ctx) !== 'desktop') return null

    const surface = navigationModel.currentSurface()
    if (surface === 'files') {
      return this.resolveFilesSummary(ctx)
    }
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

  private resolveFilesSummary(ctx: AppContext): StatusBarSummaryRail | null {
    if (navigationModel.resolvedDocument().kind !== 'closed') return null

    try {
      const model = getFileManagerModel(ctx)
      const selectedCount = model.selectedCount()

      return {
        id: 'files',
        label: appI18n('file-manager:summary:label' as never),
        items: [
          {
            id: 'items',
            label: appI18n('file-manager:summary:items' as never),
            value: model.filteredCount(),
          },
          {
            id: 'selected',
            label: appI18n('file-manager:summary:selected' as never),
            value: selectedCount,
            tone: selectedCount > 0 ? 'primary' : 'neutral',
          },
        ],
      }
    } catch {
      return null
    }
  }

  private resolveNotesSummary(): StatusBarSummaryRail {
    const summary = notesQuickViewModel.state.summary()

    return {
      id: 'notes',
      label: appI18n('notes:quick_view:summary:label' as never),
      items: [
        {
          id: 'total',
          label: appI18n('notes:quick_view:summary:total' as never),
          value: summary.total,
        },
        {
          id: 'visible',
          label: appI18n('notes:quick_view:summary:visible' as never),
          value: summary.visible,
        },
      ],
    }
  }

  private resolvePasswordsSummary(): StatusBarSummaryRail | null {
    const showElement = getPassmanagerShowElement()
    if (showElement === 'otpView') {
      return this.resolveOtpSummary()
    }
    if (showElement instanceof Group || this.groupModel.isManagerRoot(showElement)) {
      return this.resolveGroupSummary(showElement)
    }

    return null
  }

  private resolveOtpSummary(): StatusBarSummaryRail {
    const summary = pmOtpQuickViewModel.state.summary()

    return {
      id: 'passwords-otp',
      label: pmI18n('otp:quick_view:summary:total'),
      items: [
        {id: 'total', label: pmI18n('otp:quick_view:summary:total'), value: summary.total},
        {id: 'visible', label: pmI18n('otp:quick_view:summary:visible'), value: summary.visible},
        {id: 'totp', label: pmI18n('otp:quick_view:summary:totp'), value: summary.totp},
        {id: 'hotp', label: pmI18n('otp:quick_view:summary:hotp'), value: summary.hotp},
      ],
    }
  }

  private resolveGroupSummary(group: Group | ManagerRoot): StatusBarSummaryRail | null {
    const isRoot = this.groupModel.isManagerRoot(group)
    const items = this.groupModel.getUniqueRows(this.groupModel.getVisibleRows(group))
    const summary = this.groupModel.getGroupPresentation(group, items, isRoot)
    if (summary.metrics.length === 0) return null

    const degraded = summary.securityStatus === 'degraded'

    return {
      id: 'passwords-group',
      label: degraded
        ? `${pmI18n('metrics:title')}. ${pmI18n('metrics:degraded')}`
        : pmI18n('metrics:title'),
      items: summary.metrics.map((metric) => ({
        id: metric.id,
        label: metric.label,
        value: metric.value,
        tone: getGroupMetricTone(metric),
        loadingLabel: pmI18n('metrics:loading'),
      })),
      busy: summary.securityStatus === 'idle' || summary.securityStatus === 'loading',
      status: summary.securityStatus,
    }
  }
}

function getGroupMetricTone(metric: PMGroupMetric): PMSummaryRailTone {
  if (metric.family === 'attribute') return 'primary'
  if (metric.severity === 'critical') return 'danger'
  if (metric.severity === 'warning') return 'warning'
  return 'neutral'
}

export const statusBarSummaryModel = new StatusBarSummaryModel()
