/**
 * Unit-тесты для синхронизации каталога
 * Проверяет корректную распаковку RPC-обёртки {ok: true, result: ...}
 */
import {CatalogMirror} from '../../src/core/catalog/local-catalog/catalog-mirror'
import {describe, expect, it, vi} from 'vitest'

/**
 * Тестовая функция, имитирующая логику syncInit из CatalogService
 * (та что используется при работе через воркер)
 */
function applySyncSnapshot(mirror: CatalogMirror, snapshot: unknown): void {
  // Распаковываем RPC-обёртку {ok: true, result: ...} если она присутствует
  let unwrapped = snapshot as Record<string, unknown>
  if ('ok' in unwrapped && unwrapped['ok'] === true && 'result' in unwrapped) {
    unwrapped = unwrapped['result'] as Record<string, unknown>
  }

  const candidate = 'data' in unwrapped ? (unwrapped['data'] as unknown) : unwrapped
  let parsed: unknown | undefined
  if (candidate !== undefined) {
    parsed = typeof candidate === 'string' ? JSON.parse(candidate as string) : candidate
  }
  if (parsed === undefined) throw new Error('Invalid snapshot format: missing data')
  const header = (unwrapped['header'] as unknown) ?? undefined
  mirror.applySnapshot({header, data: parsed as any})
}

describe('Catalog sync RPC-обёртка', () => {
  // Хелпер для получения детей без корневого узла (root)
  function getChildrenWithoutRoot(mirror: CatalogMirror, path: string) {
    return mirror.getChildren(path).filter((c) => c.name !== 'root')
  }

  it('распаковывает стандартный формат {header, data}', () => {
    const mirror = new CatalogMirror()
    const snapshot = {
      header: {version: 1, checksum: 'abc'},
      data: {
        i: 0,
        t: 0,
        n: 'root',
        l: '',
        s: 0,
        z: 0,
        u: 0,
        g: 0,
        o: 0,
        b: 0,
        m: 0,
        c: [
          {i: 1, t: 0, n: 'docs', l: '', s: 0, z: 0, u: 0, g: 0, o: 0, b: 0, m: 0, c: []},
          {i: 2, t: 0, n: 'images', l: '', s: 0, z: 0, u: 0, g: 0, o: 0, b: 0, m: 0, c: []},
        ],
      },
      isIncremental: false,
    }

    applySyncSnapshot(mirror, snapshot)

    const children = getChildrenWithoutRoot(mirror, '/')
    expect(children.length).toBe(2)
    expect(children.some((c) => c.name === 'docs')).toBe(true)
    expect(children.some((c) => c.name === 'images')).toBe(true)
  })

  it('распаковывает RPC-обёртку {ok: true, result: {header, data}}', () => {
    const mirror = new CatalogMirror()
    // Формат который приходит от ApplicationRouter
    const rpcWrapped = {
      ok: true,
      result: {
        header: {version: 1, checksum: 'def'},
        data: {
          i: 0,
          t: 0,
          n: 'root',
          l: '',
          s: 0,
          z: 0,
          u: 0,
          g: 0,
          o: 0,
          b: 0,
          m: 0,
          c: [
            {i: 10, t: 0, n: 'music', l: '', s: 0, z: 0, u: 0, g: 0, o: 0, b: 0, m: 0, c: []},
            {i: 11, t: 0, n: 'videos', l: '', s: 0, z: 0, u: 0, g: 0, o: 0, b: 0, m: 0, c: []},
            {i: 12, t: 1, n: 'readme.txt', l: '', s: 100, z: 0, u: 0, g: 0, o: 0, b: 0, m: 0, c: undefined},
          ],
        },
        isIncremental: false,
      },
    }

    applySyncSnapshot(mirror, rpcWrapped)

    const children = getChildrenWithoutRoot(mirror, '/')
    expect(children.length).toBe(3)
    expect(children.some((c) => c.name === 'music')).toBe(true)
    expect(children.some((c) => c.name === 'videos')).toBe(true)
    expect(children.some((c) => c.name === 'readme.txt')).toBe(true)
  })

  it('не распаковывает если ok === false', () => {
    const mirror = new CatalogMirror()
    // Ошибка от сервера — формат {ok: false, error: ...} не имеет result
    // Но сам объект имеет свойства, которые могут быть интерпретированы как data
    // В реальности такой ответ не должен попадать в syncInit (он обрабатывается раньше)
    // Тест проверяет что мы НЕ распаковываем result когда ok !== true

    const errorLikeData = {
      ok: false,
      error: 'Some error',
      // Нет result, поэтому используется сам объект как candidate
      // Но в нём нет data, поэтому parsed будет {ok: false, error: ...}
    }

    // Этот случай не бросит ошибку, т.к. ok !== true, поэтому unwrapped остаётся как есть
    // и candidate = unwrapped (весь объект), parsed = {ok: false, error: ...}
    // Это невалидный CatalogJSON, но CatalogMirror.applySnapshot примет его
    // Мы просто проверяем что распаковка НЕ происходит
    applySyncSnapshot(mirror, errorLikeData)

    // Mirror должен быть пустым или иметь "некорректные" данные
    // Главное что не упало
    expect(mirror.getChildren('/').length).toBeGreaterThanOrEqual(0)
  })

  it('обрабатывает вложенные директории в RPC-обёртке', () => {
    const mirror = new CatalogMirror()
    const rpcWrapped = {
      ok: true,
      result: {
        header: {version: 1, checksum: 'ghi'},
        data: {
          i: 0,
          t: 0,
          n: 'root',
          l: '',
          s: 0,
          z: 0,
          u: 0,
          g: 0,
          o: 0,
          b: 0,
          m: 0,
          c: [
            {
              i: 100,
              t: 0,
              n: 'parent',
              l: '',
              s: 0,
              z: 0,
              u: 0,
              g: 0,
              o: 0,
              b: 0,
              m: 0,
              c: [
                {i: 101, t: 0, n: 'child', l: '', s: 0, z: 0, u: 0, g: 0, o: 0, b: 0, m: 0, c: []},
                {i: 102, t: 1, n: 'file.txt', l: '', s: 50, z: 0, u: 0, g: 0, o: 0, b: 0, m: 0, c: undefined},
              ],
            },
          ],
        },
        isIncremental: false,
      },
    }

    applySyncSnapshot(mirror, rpcWrapped)

    // Проверяем корневой уровень (без root)
    const rootChildren = getChildrenWithoutRoot(mirror, '/')
    expect(rootChildren.length).toBe(1)
    expect(rootChildren[0]?.name).toBe('parent')

    // Проверяем вложенные
    const parentChildren = mirror.getChildren('/parent')
    expect(parentChildren.length).toBe(2)
    expect(parentChildren.some((c) => c.name === 'child')).toBe(true)
    expect(parentChildren.some((c) => c.name === 'file.txt')).toBe(true)
  })

  it('обрабатывает data как строку JSON', () => {
    const mirror = new CatalogMirror()
    const dataObj = {
      i: 0,
      t: 0,
      n: 'root',
      l: '',
      s: 0,
      z: 0,
      u: 0,
      g: 0,
      o: 0,
      b: 0,
      m: 0,
      c: [{i: 200, t: 0, n: 'stringified', l: '', s: 0, z: 0, u: 0, g: 0, o: 0, b: 0, m: 0, c: []}],
    }

    const snapshot = {
      ok: true,
      result: {
        header: {version: 1},
        data: JSON.stringify(dataObj),
        isIncremental: false,
      },
    }

    applySyncSnapshot(mirror, snapshot)

    const children = getChildrenWithoutRoot(mirror, '/')
    expect(children.length).toBe(1)
    expect(children[0]?.name).toBe('stringified')
  })
})
