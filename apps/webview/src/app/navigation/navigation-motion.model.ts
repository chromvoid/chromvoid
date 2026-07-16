import {
  DEFAULT_FILES_PATH,
  describeSnapshot,
  snapshotsEqual,
} from './navigation-snapshot'
import type {
  NavigationApplyContext,
  NavigationIntentKind,
  NavigationSnapshot,
  RemotePanel,
} from './navigation.types'

export type NavigationMotionDirection = 'forward' | 'back' | 'replace'

export type NavigationMotionPlan =
  | {
      kind: 'none'
      direction: 'none'
      target: string
    }
  | {
      kind: 'page' | 'surface'
      direction: NavigationMotionDirection
      target: string
    }

export type NavigationMotionContext = NavigationApplyContext

function none(next: NavigationSnapshot): NavigationMotionPlan {
  return {
    kind: 'none',
    direction: 'none',
    target: describeSnapshot(next),
  }
}

function page(
  next: NavigationSnapshot,
  direction: NavigationMotionDirection,
): NavigationMotionPlan {
  return {
    kind: 'page',
    direction,
    target: describeSnapshot(next),
  }
}

function normalizePath(path: string | undefined): string {
  const value = path || DEFAULT_FILES_PATH
  if (value === DEFAULT_FILES_PATH) return value
  return value.endsWith('/') ? value : `${value}/`
}

function getPathDirection(currentPath: string, nextPath: string): NavigationMotionDirection {
  const current = normalizePath(currentPath)
  const next = normalizePath(nextPath)

  if (next.startsWith(current) && next !== current) return 'forward'
  if (current.startsWith(next) && next !== current) return 'back'
  return 'replace'
}

function getRemoteDirection(
  current: RemotePanel,
  next: RemotePanel,
): NavigationMotionDirection {
  if (current === 'hosts' && next !== 'hosts') return 'forward'
  if (current !== 'hosts' && next === 'hosts') return 'back'
  return 'replace'
}

function applyTraversalDirection(
  direction: NavigationMotionDirection,
  intentKind: NavigationIntentKind,
  historyDelta: number | undefined,
): NavigationMotionDirection {
  if (intentKind === 'ui-back') return 'back'
  if (intentKind !== 'history-pop' || historyDelta === undefined || historyDelta === 0) {
    return direction
  }
  return historyDelta < 0 ? 'back' : 'forward'
}

export function deriveNavigationMotionPlan(
  current: NavigationSnapshot,
  next: NavigationSnapshot,
  intentKind: NavigationIntentKind,
  context: NavigationMotionContext = {},
): NavigationMotionPlan {
  if (
    context.motion === 'none' ||
    snapshotsEqual(current, next) ||
    intentKind === 'open-overlay' ||
    intentKind === 'close-overlay'
  ) {
    return none(next)
  }

  if (current.surface !== next.surface) {
    return {
      kind: 'surface',
      direction: 'replace',
      target: describeSnapshot(next),
    }
  }

  if (current.surface === 'passwords') {
    return none(next)
  }

  if (current.surface === 'files') {
    const currentDocument = current.files?.document
    const nextDocument = next.files?.document
    if (currentDocument?.fileId !== nextDocument?.fileId) {
      const direction = currentDocument
        ? nextDocument
          ? 'replace'
          : 'back'
        : 'forward'
      return page(
        next,
        applyTraversalDirection(direction, intentKind, context.historyDelta),
      )
    }

    const currentPath = current.files?.path || DEFAULT_FILES_PATH
    const nextPath = next.files?.path || DEFAULT_FILES_PATH
    if (currentPath !== nextPath) {
      return page(
        next,
        applyTraversalDirection(
          getPathDirection(currentPath, nextPath),
          intentKind,
          context.historyDelta,
        ),
      )
    }
  }

  if (current.surface === 'remote') {
    const currentPanel = current.remote?.panel ?? 'hosts'
    const nextPanel = next.remote?.panel ?? 'hosts'
    if (currentPanel !== nextPanel) {
      return page(
        next,
        applyTraversalDirection(
          getRemoteDirection(currentPanel, nextPanel),
          intentKind,
          context.historyDelta,
        ),
      )
    }
  }

  return none(next)
}
