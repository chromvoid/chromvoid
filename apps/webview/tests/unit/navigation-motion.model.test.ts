import {describe, expect, it} from 'vitest'

import {deriveNavigationMotionPlan} from '../../src/app/navigation/navigation-motion.model'
import type {NavigationSnapshot} from '../../src/app/navigation/navigation.types'

const files = (path = '/', documentId?: number): NavigationSnapshot => ({
  surface: 'files',
  files: {
    path,
    ...(documentId === undefined
      ? {}
      : {document: {kind: 'markdown' as const, fileId: documentId}}),
  },
  overlay: {kind: 'none'},
})

describe('navigation motion plan', () => {
  it('maps hierarchical Files paths to mirrored page directions', () => {
    expect(deriveNavigationMotionPlan(files('/'), files('/vault/'), 'path-change')).toMatchObject({
      kind: 'page',
      direction: 'forward',
    })
    expect(deriveNavigationMotionPlan(files('/vault/inner/'), files('/vault/'), 'ui-back')).toMatchObject({
      kind: 'page',
      direction: 'back',
    })
    expect(deriveNavigationMotionPlan(files('/one/'), files('/two/'), 'path-change')).toMatchObject({
      kind: 'page',
      direction: 'replace',
    })
  })

  it('maps document open, close, and replacement', () => {
    expect(deriveNavigationMotionPlan(files('/'), files('/', 1), 'open-document')).toMatchObject({
      kind: 'page',
      direction: 'forward',
    })
    expect(deriveNavigationMotionPlan(files('/', 1), files('/'), 'close-document')).toMatchObject({
      kind: 'page',
      direction: 'back',
    })
    expect(deriveNavigationMotionPlan(files('/', 1), files('/', 2), 'open-document')).toMatchObject({
      kind: 'page',
      direction: 'replace',
    })
  })

  it('uses fade-through for sibling top-level surfaces', () => {
    expect(
      deriveNavigationMotionPlan(files('/'), {surface: 'notes', overlay: {kind: 'none'}}, 'surface-change'),
    ).toMatchObject({kind: 'surface', direction: 'replace'})
  })

  it('maps Remote child panels and traversal direction', () => {
    const hosts: NavigationSnapshot = {
      surface: 'remote',
      remote: {panel: 'hosts'},
      overlay: {kind: 'none'},
    }
    const pair: NavigationSnapshot = {
      surface: 'remote',
      remote: {panel: 'pair-ios'},
      overlay: {kind: 'none'},
    }

    expect(deriveNavigationMotionPlan(hosts, pair, 'surface-change')).toMatchObject({
      kind: 'page',
      direction: 'forward',
    })
    expect(deriveNavigationMotionPlan(pair, hosts, 'history-pop', {historyDelta: -1})).toMatchObject({
      kind: 'page',
      direction: 'back',
    })
    expect(deriveNavigationMotionPlan(hosts, pair, 'history-pop', {historyDelta: 1})).toMatchObject({
      kind: 'page',
      direction: 'forward',
    })
  })

  it('does not animate overlays, external sync, or same-surface Password Manager state', () => {
    expect(
      deriveNavigationMotionPlan(
        files('/'),
        {...files('/'), overlay: {kind: 'details', fileId: 1}},
        'open-overlay',
      ),
    ).toMatchObject({kind: 'none'})
    expect(
      deriveNavigationMotionPlan(files('/'), files('/vault/'), 'path-change', {motion: 'none'}),
    ).toMatchObject({kind: 'none'})
    expect(
      deriveNavigationMotionPlan(
        {surface: 'passwords', passwords: {kind: 'root'}, overlay: {kind: 'none'}},
        {
          surface: 'passwords',
          passwords: {kind: 'group', groupPath: 'A'},
          overlay: {kind: 'none'},
        },
        'surface-change',
      ),
    ).toMatchObject({kind: 'none'})
  })
})
