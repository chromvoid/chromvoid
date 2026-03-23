import {expect} from 'vitest'

export const expectRoleAndAria = (
  props: object,
  expectedRole: string,
  expectedAria: Record<string, unknown> = {},
) => {
  const record = props as Record<string, unknown>
  expect(record['role']).toBe(expectedRole)

  for (const [name, value] of Object.entries(expectedAria)) {
    expect(record[name]).toEqual(value)
  }
}

export const expectAriaLinkage = (
  sourceProps: object,
  sourceAttribute: string,
  targetProps: object,
  targetAttribute = 'id',
) => {
  const source = sourceProps as Record<string, unknown>
  const target = targetProps as Record<string, unknown>
  expect(source[sourceAttribute]).toBe(target[targetAttribute])
}

export const runKeyboardSequence = (
  handleKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void,
  keys: readonly string[],
) => {
  for (const key of keys) {
    handleKeyDown({key})
  }
}
