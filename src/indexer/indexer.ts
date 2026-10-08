import type { Chain } from '../chain/client.ts'
import type { Config } from '../config.ts'
import type { Db } from './db.ts'

type Options = Pick<Config, 'backfillBlocks' | 'concurrency'> & {
  onMetadataChanged: (blockNumber: number) => void
}

/**
 * Indexes the trades of finalized blocks into the database. On a fresh start, or after a long
 * downtime, it starts `backfillBlocks` behind the chain head; otherwise after the last indexed block.
 */
export function createIndexer(chain: Chain, db: Db, options: Options) {
  let finalized = 0
  let indexed = db.lastBlock() ?? 0
  let caughtUp = false
  let running = false
  let lastLog = 0

  /** Follows finalized blocks. If resubscribing doesn't recover, /health reports the growing lag. */
  function start() {
    chain.finalizedBlock$.subscribe({
      next: (block) => {
        finalized = block.number
        void catchUp()
      },
      error: (error) => {
        console.error('indexer: finalized block subscription failed, resubscribing in 5s:', error)
        setTimeout(start, 5000)
      },
    })
  }

  /** Indexes up to the finalized block, reading `concurrency` blocks at a time. */
  async function catchUp() {
    if (running) return
    running = true
    try {
      while (indexed < finalized) {
        const from = Math.max(indexed + 1, finalized - options.backfillBlocks + 1)
        const to = Math.min(from + options.concurrency - 1, finalized)
        const numbers = Array.from({ length: to - from + 1 }, (_, i) => from + i)
        const blocks = await Promise.all(numbers.map((number) => chain.readBlock(number)))

        for (const block of blocks) if (block.metadataChanged) options.onMetadataChanged(block.number)
        db.saveBlocks(blocks.flatMap((block) => block.trades), to)
        indexed = to
        logProgress()
      }
      if (!caughtUp) console.log(`indexer: caught up at #${indexed}`)
      caughtUp = true
    } catch (error) {
      console.error(`indexer: failed after #${indexed}, retrying on the next block:`, error)
    } finally {
      running = false
    }
  }

  function logProgress() {
    if (caughtUp || Date.now() - lastLog < 10_000) return
    lastLog = Date.now()
    console.log(`indexer: at #${indexed}, ${finalized - indexed} blocks behind`)
  }

  return {
    start,
    status: () => ({ caughtUp, indexedBlock: indexed, finalizedBlock: finalized }),
  }
}

export type Indexer = ReturnType<typeof createIndexer>
