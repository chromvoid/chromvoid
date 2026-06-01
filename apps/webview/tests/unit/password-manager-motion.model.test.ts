import {describe, expect, it} from 'vitest'

import {
  PASSMANAGER_NO_MOTION_INTENT,
  PMMotionModel,
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
    })

    model.reset()

    expect(model.intent()).toEqual(PASSMANAGER_NO_MOTION_INTENT)
  })

  it('exports a singleton with no initial motion intent', () => {
    expect(pmMotionModel.intent()).toEqual(PASSMANAGER_NO_MOTION_INTENT)
  })
})
