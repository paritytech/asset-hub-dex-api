const env = process.env

const DEFAULT_RPC_URLS = 'wss://polkadot-asset-hub-rpc.polkadot.io,wss://asset-hub-polkadot-rpc.n.dwellir.com'

/** The tickers' time window: CoinGecko reports 24-hour figures. */
export const WINDOW_MS = 24 * 60 * 60 * 1000

export const config = {
  /** WebSocket RPC endpoints, tried in order. */
  rpcUrls: (env.RPC_URLS ?? DEFAULT_RPC_URLS).split(',').map((url) => url.trim()).filter(Boolean),
  port: integer('PORT', 3000),
  dbPath: env.DB_PATH ?? 'data/trades.db',
  /** Seconds between snapshot refreshes. */
  refreshSeconds: integer('REFRESH_SECONDS', 60),
  /** Blocks read in parallel while catching up. */
  concurrency: integer('CONCURRENCY', 50),
  /** Pools with less liquidity, in whole USD, are left out. */
  minLiquidityUsd: integer('MIN_LIQUIDITY_USD', 1000, 0),
}

export type Config = typeof config

function integer(name: string, fallback: number, min = 1): number {
  const value = Number(env[name] ?? fallback)
  if (!Number.isInteger(value) || value < min) throw new Error(`${name} must be a whole number of at least ${min}, got "${env[name]}"`)
  return value
}
