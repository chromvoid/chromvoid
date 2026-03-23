/**
 * E2E-тест: полный цикл синхронизации событий
 * Согласно плану рефакторинга Phase 4.6
 *
 * Тестирует:
 * - Первоначальную синхронизацию каталога
 * - Применение событий к клиентскому зеркалу
 * - CRUD-операции и их отражение в UI
 */
import {expect, test} from 'vitest'

import {waitForAuthenticated} from './utils'
import type {Page} from 'playwright'

declare global {
  var __E2E_PAGE__: Page | undefined
}

test('S17: полный цикл синхронизации событий', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await waitForAuthenticated(page)

  // Ждём синхронизации
  await page.waitForTimeout(500)

  // 1. Проверяем, что каталог синхронизирован
  const hasCatalog = await page.evaluate(() => {
    const cat = (window as unknown as {catalog?: {catalog?: unknown}}).catalog
    return Boolean(cat?.catalog)
  })
  expect(hasCatalog).toBe(true)

  // 2. Получаем начальное количество детей в корне
  const initialChildCount = await page.evaluate(() => {
    const cat = (window as unknown as {catalog?: {catalog?: {getChildren: (_p: string) => unknown[]}}})
      .catalog
    if (!cat?.catalog) return 0
    try {
      return cat.catalog.getChildren('/').length
    } catch {
      return 0
    }
  })

  // 3. Создаём директорию через RPC
  const testDirName = `test-sync-${Date.now()}`
  const createResult = await page.evaluate(async (dirName) => {
    const cat = (window as unknown as {catalog?: {createDir: (_n: string, _p: string) => Promise<unknown>}})
      .catalog
    if (!cat?.createDir) return null
    try {
      return await cat.createDir(dirName, '/')
    } catch (e) {
      return {error: String(e)}
    }
  }, testDirName)

  expect(createResult).toBeDefined()
  expect((createResult as {error?: string})?.error).toBeUndefined()

  // 4. Ждём обновления зеркала
  await page.waitForTimeout(300)

  // 5. Проверяем, что директория появилась в зеркале
  const newChildCount = await page.evaluate(() => {
    const cat = (window as unknown as {catalog?: {catalog?: {getChildren: (_p: string) => unknown[]}}})
      .catalog
    if (!cat?.catalog) return 0
    try {
      return cat.catalog.getChildren('/').length
    } catch {
      return 0
    }
  })

  expect(newChildCount).toBeGreaterThanOrEqual(initialChildCount)

  // 6. Проверяем, что созданная директория есть в списке
  const hasTestDir = await page.evaluate((dirName) => {
    const cat = (
      window as unknown as {catalog?: {catalog?: {getChildren: (_p: string) => Array<{name: string}>}}}
    ).catalog
    if (!cat?.catalog) return false
    try {
      const children = cat.catalog.getChildren('/')
      return children.some((c: {name: string}) => c.name === dirName)
    } catch {
      return false
    }
  }, testDirName)

  expect(hasTestDir).toBe(true)

  // 7. Удаляем созданную директорию
  const nodeId = await page.evaluate((dirName) => {
    const cat = (
      window as unknown as {catalog?: {catalog?: {findByPath: (_p: string) => {nodeId: number} | undefined}}}
    ).catalog
    if (!cat?.catalog) return null
    try {
      const node = cat.catalog.findByPath(`/${dirName}`)
      return node?.nodeId ?? null
    } catch {
      return null
    }
  }, testDirName)

  if (nodeId) {
    await page.evaluate(async (nodeIdToDelete) => {
      const cat = (window as unknown as {catalog?: {delete: (_id: number) => Promise<void>}}).catalog
      if (!cat?.delete) return
      await cat.delete(nodeIdToDelete)
    }, nodeId)

    // 8. Ждём обновления и проверяем удаление
    await page.waitForTimeout(300)

    const hasTestDirAfterDelete = await page.evaluate((dirName) => {
      const cat = (
        window as unknown as {catalog?: {catalog?: {getChildren: (_p: string) => Array<{name: string}>}}}
      ).catalog
      if (!cat?.catalog) return false
      try {
        const children = cat.catalog.getChildren('/')
        return children.some((c: {name: string}) => c.name === dirName)
      } catch {
        return false
      }
    }, testDirName)

    expect(hasTestDirAfterDelete).toBe(false)
  }
})

test('S17b: зеркало корректно отображает вложенную структуру', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await waitForAuthenticated(page)

  await page.waitForTimeout(500)

  // Проверяем, что getPath и findByPath работают корректно
  const pathsWork = await page.evaluate(() => {
    const cat = (
      window as unknown as {
        catalog?: {
          catalog?: {
            getPath: (_id: number) => string
            getChildren: (_p: string) => Array<{nodeId: number; path: string}>
          }
        }
      }
    ).catalog
    if (!cat?.catalog) return false
    try {
      const children = cat.catalog.getChildren('/')
      if (children.length === 0) return true // нет детей - это ок

      const child = children[0]
      if (!child) return true
      const path = cat.catalog.getPath(child.nodeId)
      return typeof path === 'string' && path.startsWith('/')
    } catch {
      return false
    }
  })

  expect(pathsWork).toBe(true)
})

test('S17c: статус соединения обновляется корректно', async () => {
  const page = globalThis.__E2E_PAGE__!
  await page.goto('http://localhost:4400/index.html')
  await waitForAuthenticated(page)

  // Проверяем статус
  const isConnected = await page.evaluate(() => {
    const store = (window as unknown as {store?: {wsAuthenticated?: {value: boolean}}}).store
    return store?.wsAuthenticated?.value === true
  })

  expect(isConnected).toBe(true)
})
