import {atom} from '@reatom/core'
import {describe, expect, it} from 'vitest'
import {
  type LandmarkType,
  createLandmark,
  findLandmarkUniquenessIssues,
  hasLandmarkUniquenessIssues,
} from './index'

describe('landmarks', () => {
  const ALL_TYPES: LandmarkType[] = [
    'banner',
    'main',
    'navigation',
    'complementary',
    'contentinfo',
    'search',
    'form',
    'region',
  ]

  describe('role mapping', () => {
    it.each(ALL_TYPES)('applies role="%s" for type "%s"', (type) => {
      const lm = createLandmark({type, idBase: `test-${type}`})
      expect(lm.contracts.getLandmarkProps().role).toBe(type)
    })
  })

  describe('labeling', () => {
    it('returns no aria-label or aria-labelledby when neither provided', () => {
      const lm = createLandmark({type: 'main', idBase: 'test-main'})
      expect(lm.contracts.getLandmarkProps()).toEqual({
        role: 'main',
        'aria-label': undefined,
        'aria-labelledby': undefined,
      })
    })

    it('applies aria-label when label is provided', () => {
      const lm = createLandmark({type: 'navigation', label: 'Primary', idBase: 'test-nav'})
      expect(lm.contracts.getLandmarkProps()).toEqual({
        role: 'navigation',
        'aria-label': 'Primary',
        'aria-labelledby': undefined,
      })
    })

    it('applies aria-labelledby when labelId is provided alone', () => {
      const lm = createLandmark({type: 'navigation', labelId: 'nav-heading', idBase: 'test-nav'})
      expect(lm.contracts.getLandmarkProps()).toEqual({
        role: 'navigation',
        'aria-label': undefined,
        'aria-labelledby': 'nav-heading',
      })
    })

    it('prefers aria-labelledby over aria-label when both provided', () => {
      const lm = createLandmark({
        type: 'navigation',
        label: 'Secondary',
        labelId: 'secondary-heading',
        idBase: 'test-nav2',
      })
      expect(lm.contracts.getLandmarkProps()).toEqual({
        role: 'navigation',
        'aria-label': undefined,
        'aria-labelledby': 'secondary-heading',
      })
    })
  })

  describe('signal-backed options', () => {
    it('accepts an atom for label and reflects updates', () => {
      const labelAtom = atom<string>('Initial', 'test.label')
      const lm = createLandmark({type: 'region', label: labelAtom, idBase: 'test-signal'})

      expect(lm.contracts.getLandmarkProps()['aria-label']).toBe('Initial')

      labelAtom.set('Updated')
      expect(lm.contracts.getLandmarkProps()['aria-label']).toBe('Updated')
    })

    it('accepts an atom for labelId and reflects updates', () => {
      const labelIdAtom = atom<string>('heading-1', 'test.labelId')
      const lm = createLandmark({type: 'region', labelId: labelIdAtom, idBase: 'test-signal2'})

      expect(lm.contracts.getLandmarkProps()['aria-labelledby']).toBe('heading-1')

      labelIdAtom.set('heading-2')
      expect(lm.contracts.getLandmarkProps()['aria-labelledby']).toBe('heading-2')
    })
  })

  describe('uniqueness invariants', () => {
    it('detects duplicate role and label combinations', () => {
      const issues = findLandmarkUniquenessIssues([
        {type: 'navigation', label: 'Primary'},
        {type: 'navigation', label: 'Primary'},
        {type: 'navigation', label: 'Footer links'},
        {type: 'region', label: 'Updates'},
        {type: 'region', label: 'Updates'},
      ])

      expect(issues).toEqual([
        {type: 'navigation', key: 'Primary', count: 2},
        {type: 'region', key: 'Updates', count: 2},
      ])
      expect(
        hasLandmarkUniquenessIssues([
          {type: 'navigation', label: 'Primary'},
          {type: 'navigation', label: 'Primary'},
        ]),
      ).toBe(true)
    })

    it('does not report uniqueness issues for distinct labels', () => {
      expect(
        hasLandmarkUniquenessIssues([
          {type: 'navigation', label: 'Primary'},
          {type: 'navigation', label: 'Secondary'},
          {type: 'region', label: 'Updates'},
        ]),
      ).toBe(false)
    })
  })
})
