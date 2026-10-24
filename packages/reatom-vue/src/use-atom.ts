import {computed, isAtom, top, type AtomLike} from '@reatom/core'
import {onScopeDispose, shallowRef, type ShallowRef} from 'vue'

export function useAtom<T>(target: AtomLike<T, [], T> | (() => T)): Readonly<ShallowRef<T>> {
  const frame = top()
  const source: AtomLike<T, [], T> = isAtom(target) ? target : computed(target, 'admin.vue.selector')
  const value = shallowRef(frame.run(source)) as ShallowRef<T>
  const unsubscribe = frame.run(() =>
    source.subscribe((next) => {
      value.value = next
    }),
  )

  onScopeDispose(() => frame.run(unsubscribe))
  return value
}
