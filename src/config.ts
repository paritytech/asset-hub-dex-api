const env = process.env

const DEFAULT_RPC_URLS = 'wss://polkadot-asset-hub-rpc.polkadot.io,wss://asset-hub-polkadot-rpc.n.dwellir.com'

export const config = {
  /** WebSocket RPC endpoints, tried in order. */
  rpcUrls: (env.RPC_URLS ?? DEFAULT_RPC_URLS).split(',').map((url) => url.trim()).filter(Boolean),
  port: number('PORT', 3000),
  dbPath: env.DB_PATH ?? 'data/trades.db',
  /** Seconds between snapshot refreshes. */
  refreshSeconds: number('REFRESH_SECONDS', 60),
  /** Blocks indexed on a fresh start. Asset Hub blocks are at least 2s apart, so 43,200 cover 24 hours. */
  backfillBlocks: number('BACKFILL_BLOCKS', 43_200),
  /** Blocks read in parallel while catching up. */
  concurrency: number('CONCURRENCY', 50),
  /** Pools with less liquidity, in whole USD, are left out. */
  minLiquidityUsd: Math.floor(number('MIN_LIQUIDITY_USD', 1000)),
  /** Days trades are kept. */
  retentionDays: number('RETENTION_DAYS', 7),
}

export type Config = typeof config

function number(name: string, fallback: number): number {
  const value = Number(env[name] ?? fallback)
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got "${env[name]}"`)
  return value
}
