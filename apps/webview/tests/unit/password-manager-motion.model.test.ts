import {describe, expect, it, vi} from 'vitest'

import {
  PASSMANAGER_NO_MOTION_INTENT,
  PMMotionModel,
  isPassmanagerMotionSnapshotSafe,
  pmMotionModel,
  type PassmanagerMotionIntent,
} from '../../src/features/passmanager/models/pm-motion.model'

describe('PMMotionModel', () => {
  it('starts with no motion intent', () => {
    const model = new PMMotionModel('test.passmanager.motion.initial')

    expect(model.intent()).toEqual(PASSMANAGER_NO_MOTION_INTENT)
  })

  it('stores a surface-change intent with a stable target', () => {
    const model = new PMMotionModel('test.passmanager.motion.set')
    const intent: PassmanagerMotionIntent = {
      kind: 'surface-change',
      direction: 'forward',
      target: 'entry:entry-a',
      reason: 'navigation',
      sourceSurface: 'root',
      targetSurface: 'entry',
    }

    model.setIntent(intent)

    expect(model.intent()).toEqual(intent)
  })

  it('resets the singleton intent to none', () => {
    const model = new PMMotionModel('test.passmanager.motion.reset')

    model.setIntent({
      kind: 'surface-change',
      direction: 'open',
      target: 'import',
      reason: 'navigation',
      sourceSurface: 'root',
      targetSurface: 'import',
    })

    model.reset()

    expect(model.intent()).toEqual(PASSMANAGER_NO_MOTION_INTENT)
  })

  it('exports a singleton with no initial motion intent', () => {
    expect(pmMotionModel.intent()).toEqual(PASSMANAGER_NO_MOTION_INTENT)
  })

  it('defers the mutation until a registered presenter commits it', async () => {
    const model = new PMMotionModel('test.passmanager.motion.presenter')
    const commit = vi.fn()
    let presentCommit!: () => void
    let finish!: () => void
    const unregister = model.registerPresenter((request) => {
      presentCommit = request.commit
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })

    model.run(
      {
        kind: 'surface-change',
        direction: 'forward',
        target: 'entry:next',
        reason: 'navigation',
        sourceSurface: 'group',
        targetSurface: 'entry',
      },
      commit,
    )

    expect(commit).not.toHaveBeenCalled()
    presentCommit()
    expect(commit).toHaveBeenCalledTimes(1)
    finish()
    await model.whenSettled()
    unregister()
  })

  it('commits directly for no-motion intents and presenter failures', async () => {
    const model = new PMMotionModel('test.passmanager.motion.fallback')
    const noMotionCommit = vi.fn()
    model.run(PASSMANAGER_NO_MOTION_INTENT, noMotionCommit)
    expect(noMotionCommit).toHaveBeenCalledTimes(1)

    const failedCommit = vi.fn()
    const unregister = model.registerPresenter(() => {
      throw new Error('presentation unavailable')
    })
    model.run(
      {
        kind: 'surface-change',
        direction: 'back',
        target: 'root:main',
        reason: 'navigation',
        sourceSurface: 'entry',
        targetSurface: 'root',
      },
      failedCommit,
    )
    await model.whenSettled()
    expect(failedCommit).toHaveBeenCalledTimes(1)
    unregister()
  })

  it('allows snapshots only when both PM surfaces are non-secret', () => {
    expect(
      isPassmanagerMotionSnapshotSafe({
        kind: 'surface-change',
        direction: 'forward',
        target: 'group:next',
        reason: 'navigation',
        sourceSurface: 'root',
        targetSurface: 'group',
      }),
    ).toBe(true)

    for (const liveOnlySurface of [
      'entry',
      'create-entry',
      'import',
      'otp-view',
      'ssh-view',
      'env-runtime-view',
    ] as const) {
      expect(
        isPassmanagerMotionSnapshotSafe({
          kind: 'surface-change',
          direction: 'forward',
          target: liveOnlySurface,
          reason: 'navigation',
          sourceSurface: 'root',
          targetSurface: liveOnlySurface,
        }),
      ).toBe(false)
      expect(
        isPassmanagerMotionSnapshotSafe({
          kind: 'surface-change',
          direction: 'back',
          target: 'root:main',
          reason: 'navigation',
          sourceSurface: liveOnlySurface,
          targetSurface: 'root',
        }),
      ).toBe(false)
    }
  })
})
