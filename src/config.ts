const env = process.env

export const config = {
  rpcUrls: (env.RPC_URLS ?? 'wss://polkadot-asset-hub-rpc.polkadot.io,wss://asset-hub-polkadot-rpc.n.dwellir.com')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),
  port: Number(env.PORT ?? 3000),
  dbPath: env.DB_PATH ?? 'data/trades.db',
  // How often reserves are re-read and the tickers snapshot is rebuilt.
  refreshSeconds: Number(env.REFRESH_SECONDS ?? 60),
  // Blocks to index on a fresh start. Asset Hub blocks are >= 2s apart, so 43,200 covers >= 24h.
  backfillBlocks: Number(env.BACKFILL_BLOCKS ?? 43_200),
  // Blocks fetched in parallel while catching up.
  concurrency: Number(env.CONCURRENCY ?? 50),
  // Pools with less liquidity (in whole USD) are left out of the tickers.
  minLiquidityUsd: Math.floor(Number(env.MIN_LIQUIDITY_USD ?? 1000)),
  // Trades older than this are deleted.
  retentionDays: Number(env.RETENTION_DAYS ?? 7),
}
