import type { Chain } from '../chain/client.ts'
import { WINDOW_MS, type Config } from '../config.ts'
import type { Db } from './db.ts'

type Options = Pick<Config, 'concurrency'> & {
  onMetadataChanged: (blockNumber: number) => void
}

/** Blocks to step back at a time while looking for where the backfill starts: about an hour. */
const BACKFILL_STEP = 1800

/**
 * Indexes the trades of finalized blocks into the database. On a fresh start, or after a long
 * downtime, it starts just before the last 24 hours; otherwise after the last indexed block.
 */
export function createIndexer(chain: Chain, db: Db, options: Options) {
  let finalized = 0
  let indexed = db.lastBlock() ?? 0
  /** A block from just before the 24 hours before startup. Older blocks are not needed. */
  let backfillStart: number | undefined
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
      if (backfillStart === undefined) {
        backfillStart = await blockBefore(Date.now() - WINDOW_MS, finalized, chain.blockTimestamp)
        console.log(`indexer: backfill starts at #${backfillStart}`)
      }
      while (indexed < finalized) {
        const from = Math.max(indexed + 1, backfillStart)
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

/**
 * A block from before `timestamp` (ms): steps back from `head` until it finds one. It may be up to
 * one step earlier than needed, which only means indexing a little more.
 */
export async function blockBefore(
  timestamp: number,
  head: number,
  timestampOf: (block: number) => Promise<number>,
): Promise<number> {
  let block = head
  while (block > 0 && (await timestampOf(block)) >= timestamp) {
    block = Math.max(0, block - BACKFILL_STEP)
  }
  return block
}
