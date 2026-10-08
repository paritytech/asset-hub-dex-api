import { DOT, USD_ASSET_ID, type AssetInfo } from '../chain/assets.ts'
import type { Trade } from '../chain/trades.ts'
import { formatPrice, formatUnits, price } from './decimal.ts'

/**
 * Smallest amount, in base units on both sides, for a trade to set last/high/low. The prices of
 * dust trades, e.g. 0.000001 USDC from fee payments, are dominated by integer rounding. Dust
 * trades still count towards volume.
 */
const MIN_PRICED_AMOUNT = 10_000n

/** A pool's asset and current reserves. */
export type PoolReserves = {
  account: string
  /** locationKey of the pool's non-DOT asset. */
  assetKey: string
  asset: AssetInfo
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

/** A ticker with the extra values the stats page shows. */
export type TickerRow = { ticker: Ticker; symbol: string; volumeUsd: string }

/**
 * Builds tickers from current reserves and the last 24 hours of trades (oldest first), largest
 * pools first. USD values use the DOT price of the DOT/dotUSD pool, with dotUSD valued at $1.
 * Pools with less than `minLiquidityUsd` of liquidity are left out.
 */
export function buildTickers(pools: PoolReserves[], trades: Trade[], minLiquidityUsd: number): TickerRow[] {
  const usdPool = pools.find((pool) => pool.asset.id === USD_ASSET_ID)
  if (!usdPool) throw new Error(`DOT/${USD_ASSET_ID} pool not found`)
  /** A DOT amount's value in dotUSD base units. */
  const usdValue = (dot: bigint) => (dot * usdPool.assetReserve) / usdPool.dotReserve
  const formatUsd = (dot: bigint) => formatUnits(usdValue(dot), usdPool.asset.decimals, 2)
  const minLiquidity = BigInt(minLiquidityUsd) * 10n ** BigInt(usdPool.asset.decimals)
  const tradesByAsset = Map.groupBy(trades, (trade) => trade.asset)

  return pools
    .filter((pool) => usdValue(liquidity(pool)) >= minLiquidity)
    .sort((a, b) => (a.dotReserve > b.dotReserve ? -1 : a.dotReserve < b.dotReserve ? 1 : 0))
    .map((pool) => {
      const poolTrades = tradesByAsset.get(pool.assetKey) ?? []
      return {
        ticker: toTicker(pool, poolTrades, formatUsd(liquidity(pool))),
        symbol: pool.asset.symbol,
        volumeUsd: formatUsd(sum(poolTrades.map((trade) => trade.dotAmount))),
      }
    })
}

/** A pool's two sides are worth the same, so its liquidity is twice its DOT reserve. */
const liquidity = (pool: PoolReserves) => 2n * pool.dotReserve

function toTicker(pool: PoolReserves, trades: Trade[], liquidityUsd: string): Ticker {
  const { asset } = pool
  // Prices are in target per DOT.
  const priceOf = (dotAmount: bigint, assetAmount: bigint) => price(assetAmount, asset.decimals, dotAmount, DOT.decimals)
  const prices = trades
    .filter((trade) => trade.dotAmount >= MIN_PRICED_AMOUNT && trade.assetAmount >= MIN_PRICED_AMOUNT)
    .map((trade) => priceOf(trade.dotAmount, trade.assetAmount))

  const ticker: Ticker = {
    ticker_id: `${DOT.id}_${asset.id}`,
    base_currency: DOT.id,
    target_currency: asset.id,
    pool_id: pool.account,
    // The last trade's price, or the current price from reserves if the pool had no trades.
    last_price: formatPrice(prices.at(-1) ?? priceOf(pool.dotReserve, pool.assetReserve)),
    base_volume: formatUnits(sum(trades.map((trade) => trade.dotAmount)), DOT.decimals),
    target_volume: formatUnits(sum(trades.map((trade) => trade.assetAmount)), asset.decimals),
    liquidity_in_usd: liquidityUsd,
  }
  if (prices.length === 0) return ticker
  return { ...ticker, high: formatPrice(max(prices)), low: formatPrice(min(prices)) }
}

const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n)
const max = (values: bigint[]) => values.reduce((a, b) => (b > a ? b : a))
const min = (values: bigint[]) => values.reduce((a, b) => (b < a ? b : a))
