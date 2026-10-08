import { locationKey } from '../chain/assets.ts'
import type { Block, Chain, Pool } from '../chain/client.ts'
import type { MetadataCache } from '../chain/metadata.ts'
import type { Config } from '../config.ts'
import { renderPage } from '../http/page.ts'
import type { Db } from '../indexer/db.ts'
import type { Indexer } from '../indexer/indexer.ts'
import { buildTickers, type PoolReserves } from './tickers.ts'

const DAY_MS = 24 * 60 * 60 * 1000
/** Pools read in parallel. Bounds the RPC load however many pools exist. */
const POOL_READ_CONCURRENCY = 10

/** The tickers at a finalized block, with the responses rendered once rather than per request. */
export type Snapshot = { block: number; updatedAt: Date; json: string; html: string }

type Options = Pick<Config, 'refreshSeconds' | 'minLiquidityUsd' | 'retentionDays'>

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
    // Volumes are incomplete until the last 24 hours are indexed.
    if (!indexer.status().caughtUp) return

    const block = await chain.finalizedBlock()
    const pools = await mapLimit(await chain.pools(block.hash), POOL_READ_CONCURRENCY, (pool) => readPool(pool, block))
    const now = Date.now()
    db.pruneBefore(now - options.retentionDays * DAY_MS)
    const rows = buildTickers(
      pools.filter((pool) => pool !== undefined),
      db.tradesSince(now - DAY_MS),
      options.minLiquidityUsd,
    )
    const updatedAt = new Date(now)
    current = {
      block: block.number,
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
