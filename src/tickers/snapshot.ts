import { locationKey } from '../chain/assets.ts'
import type { Block, Chain, Pool } from '../chain/client.ts'
import type { MetadataCache } from '../chain/metadata.ts'
import { WINDOW_MS, type Config } from '../config.ts'
import { renderPage } from '../http/page.ts'
import type { Db } from '../indexer/db.ts'
import type { Indexer } from '../indexer/indexer.ts'
import { buildTickers, type PoolReserves } from './tickers.ts'

/** Pools read in parallel. Bounds the RPC load however many pools exist. */
const POOL_READ_CONCURRENCY = 10

/** A snapshot older than this, or this many blocks (about 5 minutes) behind the chain head, is stale. */
const MAX_AGE_MS = 5 * 60 * 1000
const MAX_LAG_BLOCKS = 150

/**
 * The tickers at the last indexed block, with the responses rendered once rather than per request.
 * `head` is the finalized block at the time, to tell how far behind the data is.
 */
export type Snapshot = { block: number; head: number; updatedAt: Date; json: string; html: string }

/** Whether a snapshot is recent enough to serve. */
export function isFresh(snapshot: Snapshot, now = Date.now()): boolean {
  return now - snapshot.updatedAt.getTime() < MAX_AGE_MS && snapshot.head - snapshot.block < MAX_LAG_BLOCKS
}

type Options = Pick<Config, 'refreshSeconds' | 'minLiquidityUsd'>

/** Rebuilds the snapshot every `refreshSeconds`, once the indexer has caught up. */
export function createSnapshots(chain: Chain, db: Db, indexer: Indexer, metadata: MetadataCache, options: Options) {
  let current: Snapshot | undefined

  function start() {
    refresh()
      .catch((error) => console.error('snapshot: refresh failed:', error))
      // Until the first snapshot exists, retry every few seconds.
      .finally(() => setTimeout(start, (current ? options.refreshSeconds : 5) * 1000))
  }

  async function refresh() {
    const { caughtUp, indexedBlock } = indexer.status()
    // Volumes are incomplete until the last 24 hours are indexed.
    if (!caughtUp) return

    // Read reserves at the last indexed block, so that they match the trades.
    const [block, head] = await Promise.all([chain.block(indexedBlock), chain.finalizedBlock()])
    const pools = await mapLimit(await chain.pools(block.hash), POOL_READ_CONCURRENCY, (pool) => readPool(pool, block))
    const now = Date.now()
    db.pruneBefore(now - WINDOW_MS)
    const rows = buildTickers(
      pools.filter((pool) => pool !== undefined),
      db.tradesSince(now - WINDOW_MS, block.number),
      options.minLiquidityUsd,
    )
    const updatedAt = new Date(now)
    current = {
      block: block.number,
      head: head.number,
      updatedAt,
      json: JSON.stringify(rows.map((row) => row.ticker)),
      html: await renderPage(rows, block.number, updatedAt),
    }
  }

  /** A pool's asset and reserves, or undefined if either is unavailable. */
  async function readPool(pool: Pool, block: Block): Promise<PoolReserves | undefined> {
    try {
      const [asset, reserves] = await Promise.all([metadata.get(pool.asset, block), chain.reserves(pool.asset, block.hash)])
      if (!asset || !reserves) return undefined
      const [dotReserve, assetReserve] = reserves
      return { account: pool.account, assetKey: locationKey(pool.asset), asset, dotReserve, assetReserve }
    } catch (error) {
      // Leave the pool out rather than failing every ticker.
      console.error(`snapshot: skipping pool ${pool.account}:`, error)
      return undefined
    }
  }

  return { start, current: () => current }
}

export type Snapshots = ReturnType<typeof createSnapshots>

/** Like Promise.all(items.map(fn)), with at most `limit` calls in flight. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
