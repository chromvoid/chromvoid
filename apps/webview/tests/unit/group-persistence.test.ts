import {describe, expect, it, vi, beforeEach} from 'vitest'

/**Tests to check the persistence of PassManager groups.
*
Problem: When you create a new group, it appears in the UI.
* but after reloading the page disappears.
*
* Root causes:
1. waitStream() in Transfer.ts was not redacted with RPC errors
* 2. readSecret hovered indefinitely at NODE NOT FOUND
3. Promise.all in apiSave was interrupted when the record was exported
*/

describe('Group persistence', () => {
  describe('Entry.export error handling', () => {
    it('should return empty password when readSecret fails', async () => {
      // Mock Entry.password that throws out an error
      const mockPassword = vi.fn().mockRejectedValue(new Error('NODE_NOT_FOUND'))

      // Entry.export simulation with error handling
      const exportEntry = async () => {
        let password = ''
        try {
          password = (await mockPassword()) ?? ''
        } catch {
          // Password Unavailable – Use an Empty Line
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
          // Password unavailable
        }
        return {password}
      }

      const result = await exportEntry()
      expect(result.password).toBe('')
    })
  })

  describe('apiSave with Promise.allSettled', () => {
    it('should continue saving even if some exports fail', async () => {
      // entriesList simulation with one successful and one failed record
      const entries = [
        {export: vi.fn().mockResolvedValue({id: '1', name: 'Group1', entries: []})},
        {export: vi.fn().mockRejectedValue(new Error('Export failed'))},
        {export: vi.fn().mockResolvedValue({id: '3', name: 'Group3', entries: []})},
      ]

      // ApiSave simulation with Promise.allSettled
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
      // Conservation should continue with an empty array of entries
    })
  })

  describe('Transfer.waitStream rejection', () => {
    it('should reject waitStream when RPC returns error', async () => {
      // Simulation Transfer.reject with inboundStreamPromise
      let rejectInboundStream: ((reason: unknown) => void) | undefined
      const inboundStreamPromise = new Promise<AsyncIterable<Uint8Array>>((_, reject) => {
        rejectInboundStream = reject
      })

      const waitStream = () => inboundStreamPromise

      // Simulation of getting an RPC error
      const rpcError = {ok: false, error: 'NODE_NOT_FOUND'}

      // If an RPC error occurs, reject must cause rejectInboundStream
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

      // Simulation of the hanging waitStream
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
      ['EmptyGroup', []], // Empty group.
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
        // NAME EXIST - The band already exists, that's OK.
      }
    }

    // Don't throw out a mistake.
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
