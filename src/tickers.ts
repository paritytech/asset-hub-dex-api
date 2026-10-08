import { DOT, USD_ASSET_ID, type AssetInfo } from './assets.ts'
import type { Trade } from './db.ts'
import { formatUnits, PRICE_PRECISION, scaledRatio } from './decimal.ts'

/**
 * Smallest amount (in base units, on both sides) for a trade to set last/high/low. Prices of
 * dust swaps, e.g. 0.000001 USDC from fee payments, are dominated by integer rounding.
 * Dust swaps still count towards volume.
 */
const MIN_PRICED_AMOUNT = 10_000n

export type PoolState = {
  account: string
  /** The pool's non-DOT asset, with its locationKey. */
  asset: AssetInfo & { key: string }
  dotReserve: bigint
  assetReserve: bigint
}

/** A CoinGecko DEX ticker (Integration API Standards, section A, /tickers). DOT is always the base. */
export type Ticker = {
  ticker_id: string
  base_currency: string
  target_currency: string
  pool_id: string
  last_price: string
  base_volume: string
  target_volume: string
  liquidity_in_usd: string
  high?: string
  low?: string
}

export type TickerRow = {
  ticker: Ticker
  targetSymbol: string
  /** 24h volume in USD, shown on the stats page. */
  volumeUsd: string
}

/**
 * Builds tickers from current pool reserves and the trades of the last 24 hours (oldest first).
 * USD values use the DOT price of the DOT/USDt pool, with USDt valued at $1.
 */
export function buildTickers(pools: PoolState[], trades: Trade[]): TickerRow[] {
  const usdPool = pools.find((pool) => pool.asset.id === USD_ASSET_ID)
  if (!usdPool) throw new Error(`DOT/${USD_ASSET_ID} pool not found`)
  const toUsd = (dotAmount: bigint) =>
    formatUnits((dotAmount * usdPool.assetReserve) / usdPool.dotReserve, usdPool.asset.decimals, 2)

  const tradesByAsset = Map.groupBy(trades, (trade) => trade.asset)

  const rows = pools.map((pool) => {
    const { asset } = pool
    const price = (dotAmount: bigint, assetAmount: bigint) =>
      scaledRatio(assetAmount, asset.decimals, dotAmount, DOT.decimals)
    const poolTrades = tradesByAsset.get(asset.key) ?? []
    const prices = poolTrades
      .filter((trade) => trade.dotAmount >= MIN_PRICED_AMOUNT && trade.assetAmount >= MIN_PRICED_AMOUNT)
      .map((trade) => price(trade.dotAmount, trade.assetAmount))
    const dotVolume = poolTrades.reduce((sum, trade) => sum + trade.dotAmount, 0n)
    const assetVolume = poolTrades.reduce((sum, trade) => sum + trade.assetAmount, 0n)
    // Last trade price; the spot price from reserves if the pool had no trades.
    const lastPrice = prices.at(-1) ?? price(pool.dotReserve, pool.assetReserve)

    const ticker: Ticker = {
      ticker_id: `${DOT.id}_${asset.id}`,
      base_currency: DOT.id,
      target_currency: asset.id,
      pool_id: pool.account,
      last_price: formatUnits(lastPrice, PRICE_PRECISION),
      base_volume: formatUnits(dotVolume, DOT.decimals),
      target_volume: formatUnits(assetVolume, asset.decimals),
      // Both sides of the pool are worth the same, so liquidity is twice the DOT side.
      liquidity_in_usd: toUsd(2n * pool.dotReserve),
    }
    if (prices.length > 0) {
      ticker.high = formatUnits(prices.reduce((a, b) => (b > a ? b : a)), PRICE_PRECISION)
      ticker.low = formatUnits(prices.reduce((a, b) => (b < a ? b : a)), PRICE_PRECISION)
    }
    return { ticker, targetSymbol: asset.symbol, volumeUsd: toUsd(dotVolume), liquidity: pool.dotReserve }
  })

  return rows
    .sort((a, b) => (a.liquidity === b.liquidity ? 0 : a.liquidity > b.liquidity ? -1 : 1))
    .map(({ liquidity, ...row }) => row)
}
