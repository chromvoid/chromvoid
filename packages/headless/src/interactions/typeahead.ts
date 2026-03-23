import type {KeyboardEventLike} from './keyboard-intents'

export interface TypeaheadState {
  buffer: string
  lastInputAt: number
}

export interface TypeaheadItem {
  id: string
  text: string
}

export const normalizeTypeaheadText = (value: string) => value.trim().toLocaleLowerCase()

export const createInitialTypeaheadState = (): TypeaheadState => ({
  buffer: '',
  lastInputAt: 0,
})

const isSameCharacterSequence = (value: string) =>
  value.length > 0 && [...value].every((character) => character === value[0])

export const isTypeaheadEvent = (event: KeyboardEventLike) => {
  if (event.key.length !== 1 || event.key === ' ') return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  return normalizeTypeaheadText(event.key).length > 0
}

export const advanceTypeaheadState = (
  previous: TypeaheadState,
  key: string,
  now: number,
  timeoutMs: number,
) => {
  const normalizedKey = normalizeTypeaheadText(key)
  const expired = now - previous.lastInputAt > timeoutMs
  const baseBuffer = expired ? '' : previous.buffer
  const candidateBuffer = `${baseBuffer}${normalizedKey}`
  const query = isSameCharacterSequence(candidateBuffer) ? normalizedKey : candidateBuffer

  return {
    query,
    next: {
      buffer: candidateBuffer,
      lastInputAt: now,
    },
  }
}

export const findTypeaheadMatch = (
  query: string,
  items: readonly TypeaheadItem[],
  startIndex: number,
): string | null => {
  if (query.length === 0 || items.length === 0) return null

  for (let offset = 0; offset < items.length; offset += 1) {
    const index = (startIndex + offset) % items.length
    const item = items[index]
    if (item == null) continue
    if (item.text.startsWith(query)) {
      return item.id
    }
  }

  return null
}
