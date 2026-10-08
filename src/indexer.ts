import type { Chain } from './chain.ts'
import type { Db } from './db.ts'

/**
 * Indexes swap legs of finalized blocks into the database. On a fresh start (or after a long
 * downtime) it begins `backfillBlocks` behind the chain tip, otherwise right after the last
 * indexed block.
 */
export function createIndexer(chain: Chain, db: Db, opts: { backfillBlocks: number; concurrency: number }) {
  let finalized = 0
  let indexed = db.lastBlock() ?? 0
  let caughtUp = false
  let running = false

  async function run() {
    if (running) return
    running = true
    try {
      while (indexed < finalized) {
        const from = Math.max(indexed + 1, finalized - opts.backfillBlocks + 1)
        const to = Math.min(from + opts.concurrency - 1, finalized)
        const numbers = Array.from({ length: to - from + 1 }, (_, i) => from + i)
        const trades = await Promise.all(numbers.map(chain.blockTrades))
        db.saveBlocks(trades.flat(), to)
        indexed = to
        if (!caughtUp && Math.floor(from / 1000) !== Math.floor(to / 1000)) {
          console.log(`indexer: at #${to}, ${finalized - to} blocks behind`)
        }
      }
      if (!caughtUp) console.log(`indexer: caught up at #${indexed}`)
      caughtUp = true
    } catch (error) {
      // Retried on the next finalized block.
      console.error(`indexer: failed after #${indexed}:`, error)
    } finally {
      running = false
    }
  }

  return {
    onFinalized(number: number) {
      finalized = number
      void run()
    },
    status: () => ({ caughtUp, indexedBlock: indexed, finalizedBlock: finalized }),
  }
}

export type Indexer = ReturnType<typeof createIndexer>
