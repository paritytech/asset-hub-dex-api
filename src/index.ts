import { serve } from '@hono/node-server'
import { locationKey } from './assets.ts'
import { connectChain } from './chain.ts'
import { config } from './config.ts'
import { openDb } from './db.ts'
import { createIndexer } from './indexer.ts'
import { createApp, type Snapshot } from './server.ts'
import { buildTickers, type PoolState } from './tickers.ts'

const DAY_MS = 24 * 60 * 60 * 1000

const db = openDb(config.dbPath)
const chain = await connectChain(config.rpcUrls)
const indexer = createIndexer(chain, db, config)
let snapshot: Snapshot | undefined

// If resubscribing doesn't recover, the indexer falls behind and /health reports it.
function followFinalized() {
  chain.client.finalizedBlock$.subscribe({
    next: (block) => indexer.onFinalized(block.number),
    error: (error) => {
      console.error('finalized block subscription failed, resubscribing in 5s:', error)
      setTimeout(followFinalized, 5000)
    },
  })
}
followFinalized()

async function refreshSnapshot() {
  // Volumes are incomplete until the last 24h are indexed.
  if (!indexer.status().caughtUp) return
  const block = await chain.client.getFinalizedBlock()
  const pools = await chain.pools(block.hash)
  const states = await Promise.all(
    pools.map(async (pool): Promise<PoolState | undefined> => {
      try {
        const [asset, reserves] = await Promise.all([chain.assetInfo(pool.asset), chain.reserves(pool.asset, block.hash)])
        if (!asset || !reserves) return undefined
        return {
          account: pool.account,
          asset: { ...asset, key: locationKey(pool.asset) },
          dotReserve: reserves[0],
          assetReserve: reserves[1],
        }
      } catch (error) {
        // Leave the pool out rather than failing every ticker. (Without the USDt pool, buildTickers throws.)
        console.error(`snapshot: skipping pool ${pool.lpToken}:`, error)
        return undefined
      }
    }),
  )
  const now = Date.now()
  db.pruneBefore(now - config.retentionDays * DAY_MS)
  const rows = buildTickers(
    states.filter((state) => state !== undefined),
    db.tradesSince(now - DAY_MS),
    config.minLiquidityUsd,
  )
  snapshot = { rows, block: block.number, updatedAt: new Date(now) }
}

function scheduleRefresh() {
  refreshSnapshot()
    .catch((error) => console.error('snapshot refresh failed:', error))
    .finally(() => setTimeout(scheduleRefresh, (snapshot ? config.refreshSeconds : 5) * 1000))
}
scheduleRefresh()

serve({ fetch: createApp(() => snapshot, indexer).fetch, port: config.port }, ({ port }) =>
  console.log(`listening on :${port}`),
)
