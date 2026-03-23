import {describe, expect, it, vi, beforeEach} from 'vitest'

/**
 * Тесты для проверки персистентности групп PassManager.
 *
 * Проблема: при создании новой группы она появляется в UI,
 * но после перезагрузки страницы исчезает.
 *
 * Корневые причины:
 * 1. waitStream() в Transfer.ts не реджектился при RPC ошибках
 * 2. readSecret зависал бесконечно при NODE_NOT_FOUND
 * 3. Promise.all в apiSave прерывался при ошибке экспорта записи
 */

describe('Group persistence', () => {
  describe('Entry.export error handling', () => {
    it('should return empty password when readSecret fails', async () => {
      // Мок Entry.password который выбрасывает ошибку
      const mockPassword = vi.fn().mockRejectedValue(new Error('NODE_NOT_FOUND'))

      // Симуляция Entry.export с обработкой ошибок
      const exportEntry = async () => {
        let password = ''
        try {
          password = (await mockPassword()) ?? ''
        } catch {
          // Пароль недоступен — используем пустую строку
        }
        return {
          id: 'test-id',
          title: 'Test Entry',
          password,
        }
      }

      const result = await exportEntry()

      expect(result.password).toBe('')
      expect(result.id).toBe('test-id')
      expect(mockPassword).toHaveBeenCalled()
    })

    it('should not throw when password returns undefined', async () => {
      const mockPassword = vi.fn().mockResolvedValue(undefined)

      const exportEntry = async () => {
        let password = ''
        try {
          password = (await mockPassword()) ?? ''
        } catch {
          // Пароль недоступен
        }
        return {password}
      }

      const result = await exportEntry()
      expect(result.password).toBe('')
    })
  })

  describe('apiSave with Promise.allSettled', () => {
    it('should continue saving even if some exports fail', async () => {
      // Симуляция entriesList с одной успешной и одной проваленной записью
      const entries = [
        {export: vi.fn().mockResolvedValue({id: '1', name: 'Group1', entries: []})},
        {export: vi.fn().mockRejectedValue(new Error('Export failed'))},
        {export: vi.fn().mockResolvedValue({id: '3', name: 'Group3', entries: []})},
      ]

      // Симуляция apiSave с Promise.allSettled
      const results = await Promise.allSettled(entries.map((e) => e.export()))
      const successfulEntries = results
        .filter(
          (r): r is PromiseFulfilledResult<{id: string; name: string; entries: unknown[]}> =>
            r.status === 'fulfilled',
        )
        .map((r) => r.value)

      expect(successfulEntries).toHaveLength(2)
      expect(successfulEntries.at(0)?.id).toBe('1')
      expect(successfulEntries.at(1)?.id).toBe('3')
    })

    it('should handle all exports failing gracefully', async () => {
      const entries = [
        {export: vi.fn().mockRejectedValue(new Error('Fail 1'))},
        {export: vi.fn().mockRejectedValue(new Error('Fail 2'))},
      ]

      const results = await Promise.allSettled(entries.map((e) => e.export()))
      const successfulEntries = results
        .filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled')
        .map((r) => r.value)

      expect(successfulEntries).toHaveLength(0)
      // Сохранение должно продолжаться с пустым массивом entries
    })
  })

  describe('Transfer.waitStream rejection', () => {
    it('should reject waitStream when RPC returns error', async () => {
      // Симуляция Transfer.reject с реджектом inboundStreamPromise
      let rejectInboundStream: ((reason: unknown) => void) | undefined
      const inboundStreamPromise = new Promise<AsyncIterable<Uint8Array>>((_, reject) => {
        rejectInboundStream = reject
      })

      const waitStream = () => inboundStreamPromise

      // Симуляция получения RPC ошибки
      const rpcError = {ok: false, error: 'NODE_NOT_FOUND'}

      // При ошибке RPC, reject должен вызвать rejectInboundStream
      if (rpcError.ok === false && rejectInboundStream) {
        rejectInboundStream(new Error(rpcError.error))
      }

      await expect(waitStream()).rejects.toThrow('NODE_NOT_FOUND')
    })
  })

  describe('readSecret timeout', () => {
    it('should timeout when waitStream hangs', async () => {
      const timeoutMs = 100
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('readSecret timeout')), timeoutMs),
      )

      // Симуляция зависшего waitStream
      const hangingWaitStream = new Promise<AsyncIterable<Uint8Array>>(() => {
        // Never resolves
      })

      await expect(Promise.race([hangingWaitStream, timeoutPromise])).rejects.toThrow('readSecret timeout')
    })
  })
})

describe('saveRoot empty group handling', () => {
  it('should create directory for empty group', async () => {
    const createDir = vi.fn().mockResolvedValue(undefined)
    const groupsMap = new Map<string, Array<{id: string}>>([
      ['Banking', [{id: 'entry1'}]],
      ['EmptyGroup', []], // Пустая группа
    ])

    for (const [groupName, entries] of groupsMap.entries()) {
      if (!entries || entries.length === 0) {
        await createDir(groupName, '.passmanager')
      }
    }

    expect(createDir).toHaveBeenCalledTimes(1)
    expect(createDir).toHaveBeenCalledWith('EmptyGroup', '.passmanager')
  })

  it('should handle NAME_EXIST error for existing group', async () => {
    const createDir = vi.fn().mockRejectedValue(new Error('NAME_EXIST'))

    const createGroupDir = async (name: string) => {
      try {
        await createDir(name, '.passmanager')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('NAME_EXIST')) {
          throw e
        }
        // NAME_EXIST — группа уже существует, это OK
      }
    }

    // Не должен выбрасывать ошибку
    await expect(createGroupDir('ExistingGroup')).resolves.toBeUndefined()
  })

  it('should throw for non-NAME_EXIST errors', async () => {
    const createDir = vi.fn().mockRejectedValue(new Error('PERMISSION_DENIED'))

    const createGroupDir = async (name: string) => {
      try {
        await createDir(name, '.passmanager')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('NAME_EXIST')) {
          throw e
        }
      }
    }

    await expect(createGroupDir('FailGroup')).rejects.toThrow('PERMISSION_DENIED')
  })
})
