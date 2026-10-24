import {atom, computed, context, isConnected, notify} from '@reatom/core'
import {describe, expect, test} from 'vite-plus/test'
import {effectScope} from 'vue'

import {useAtom} from './index.js'

describe('useAtom', () => {
  test('reads immediately, follows atom updates, and unsubscribes in its setup frame', () => {
    const count = atom(1, 'admin.vue.test.count')
    const frame = context.start()
    const scope = effectScope()
    const value = frame.run(() => scope.run(() => useAtom(count)))!

    expect(value.value).toBe(1)
    frame.run(() => {
      expect(isConnected(count)).toBe(true)
      count.set(2)
      notify()
    })
    expect(value.value).toBe(2)

    scope.stop()
    frame.run(() => {
      expect(isConnected(count)).toBe(false)
      count.set(3)
      notify()
    })
    expect(value.value).toBe(2)
  })

  test('tracks computed atoms and selectors', () => {
    context.start(() => {
      const scope = effectScope()
      const count = atom(2, 'admin.vue.test.selectorCount')
      const doubled = computed(() => count() * 2, 'admin.vue.test.doubled')

      scope.run(() => {
        const computedValue = useAtom(doubled)
        const selectedValue = useAtom(() => `Count: ${count()}`)

        expect(computedValue.value).toBe(4)
        expect(selectedValue.value).toBe('Count: 2')
        count.set(3)
        notify()
        expect(computedValue.value).toBe(6)
        expect(selectedValue.value).toBe('Count: 3')
      })

      scope.stop()
      expect(isConnected(count)).toBe(false)
    })
  })
})
