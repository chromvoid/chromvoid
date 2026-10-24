import type {RpcCommandData, RpcCommandName, RpcCommandResultData} from '@chromvoid/scheme'

export type ImportCommand = Extract<RpcCommandName, `passmanager:import:${string}`>
export type CredentialImportRpc = <T extends ImportCommand>(
  command: T,
  data: RpcCommandData<T>,
) => Promise<RpcCommandResultData<T>>

export type ImportReview = RpcCommandResultData<'passmanager:import:review'> & {
  created_entry_count: number
  updated_entry_count: number
}

export type ImportTransferProgress = {received: number; total: number}

function assertReviewCounts(
  review: RpcCommandResultData<'passmanager:import:review'>,
): asserts review is ImportReview {
  if (
    !Number.isSafeInteger(review.created_entry_count) ||
    !Number.isSafeInteger(review.updated_entry_count) ||
    review.created_entry_count == null ||
    review.created_entry_count < 0 ||
    review.updated_entry_count == null ||
    review.updated_entry_count < 0 ||
    review.created_entry_count + review.updated_entry_count !== review.entry_count
  ) {
    throw new Error(
      'The connected host returned an incompatible import preview. Update ChromVoid on that host.',
    )
  }
}

function encodeChunk(bytes: Uint8Array): string {
  // Avoid spreading a file-sized argument list; only one bounded transport chunk is encoded.
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Owns the opaque Core resource. Never parses credentials or retains decrypted entries. */
export class CredentialImportService {
  private importId: string | null = null
  private disposed = false
  private pending: Promise<unknown> = Promise.resolve()

  constructor(private readonly rpc: CredentialImportRpc) {}

  review(
    file: File,
    password: string | undefined,
    signal: AbortSignal,
    onProgress: (progress: ImportTransferProgress) => void,
  ): Promise<ImportReview> {
    return this.enqueue(async () => {
      this.assertActive(signal)
      await this.discard()
      try {
        const limits = await this.rpc('passmanager:import:limits', {})
        this.assertActive(signal)
        if (
          !Number.isSafeInteger(limits.max_chunk_bytes) ||
          limits.max_chunk_bytes < 1 ||
          limits.max_chunk_bytes > 512 * 1024 ||
          !Number.isSafeInteger(limits.max_input_bytes)
        ) {
          throw new Error('The connected host returned incompatible import limits.')
        }
        if (!file.size || file.size > limits.max_input_bytes) {
          throw new Error(
            `Select a non-empty export file up to ${Math.floor(limits.max_input_bytes / 1024 / 1024)} MiB.`,
          )
        }
        const started = await this.rpc('passmanager:import:start', {byte_count: file.size, mode: 'merge'})
        this.importId = started.import_id
        this.assertActive(signal)
        for (let offset = 0; offset < file.size; ) {
          const bytes = new Uint8Array(
            await file.slice(offset, offset + limits.max_chunk_bytes).arrayBuffer(),
          )
          try {
            this.assertActive(signal)
            const received = await this.rpc('passmanager:import:append', {
              import_id: started.import_id,
              offset,
              chunk_base64: encodeChunk(bytes),
            })
            this.assertActive(signal)
            offset += bytes.byteLength
            if (received.received_bytes !== offset)
              throw new Error('The import upload was interrupted. Select the file again.')
            onProgress({received: offset, total: file.size})
          } finally {
            bytes.fill(0)
          }
        }
        const preview = await this.rpc('passmanager:import:review', {
          import_id: started.import_id,
          source_password: password ?? null,
        })
        this.assertActive(signal)
        assertReviewCounts(preview)
        return preview
      } catch (error) {
        await this.discard()
        throw error
      }
    })
  }

  commit(signal: AbortSignal): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive(signal)
      const id = this.importId
      if (!id) throw new Error('Review the file again before importing.')
      // Core consumes the reviewed resource and checks the catalog revision atomically.
      // Once dispatched, this commit cannot be undone by closing the dialog.
      try {
        await this.rpc('passmanager:import:commit', {import_id: id, confirm: true})
      } catch (error) {
        await this.discard()
        throw error
      } finally {
        this.importId = null
      }
    })
  }

  cancel(): Promise<void> {
    return this.enqueue(() => this.discard())
  }

  dispose(): void {
    this.disposed = true
    void this.cancel()
  }

  private assertActive(signal: AbortSignal): void {
    if (this.disposed || signal.aborted) throw new DOMException('Import cancelled', 'AbortError')
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    // Cancellation waits for an in-flight start/review reply so even a late token is released.
    const next = this.pending.then(operation)
    this.pending = next.catch(() => undefined)
    return next
  }

  private async discard(): Promise<void> {
    const id = this.importId
    this.importId = null
    if (!id) return
    try {
      await this.rpc('passmanager:import:cancel', {import_id: id})
    } catch {
      // Lock/disconnect can already have destroyed the owning Core session; never retry a write.
    }
  }
}
