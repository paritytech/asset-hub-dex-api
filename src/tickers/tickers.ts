import { DOT, USD_ASSET_IDS, type AssetInfo } from '../chain/assets.ts'
import type { Trade } from '../chain/trades.ts'
import { formatFixed, formatUnits, price, toFixed, valueAt } from './decimal.ts'

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
export type TickerRow = {
  ticker: Ticker
  symbol: string
  /** 24h DOT volume valued at the current DOT price. */
  volumeUsd: string
}

/**
 * Builds tickers from current reserves and the last 24 hours of trades (oldest first), largest
 * pools first. Pools with less than `minLiquidityUsd` of liquidity are left out.
 */
export function buildTickers(pools: PoolReserves[], trades: Trade[], minLiquidityUsd: number): TickerRow[] {
  const dotPrice = dotUsdPrice(pools)
  /** A DOT amount's USD value, as a fixed-point number. */
  const usdValue = (dot: bigint) => valueAt(dot, DOT.decimals, dotPrice)
  const formatUsd = (dot: bigint) => formatFixed(usdValue(dot), 2)
  const tradesByAsset = Map.groupBy(trades, (trade) => trade.asset)

  return pools
    .filter((pool) => usdValue(liquidity(pool)) >= toFixed(minLiquidityUsd))
    .sort((a, b) => compare(b.dotReserve, a.dotReserve))
    .map((pool) => {
      const poolTrades = tradesByAsset.get(pool.assetKey) ?? []
      return {
        ticker: toTicker(pool, poolTrades, formatUsd(liquidity(pool))),
        symbol: pool.asset.symbol,
        volumeUsd: formatUsd(sum(poolTrades.map((trade) => trade.dotAmount))),
      }
    })
}

/**
 * DOT's USD price: the median of its price in the stablecoin pools, each stablecoin valued at $1.
 * A single depegged stablecoin or pushed pool doesn't move it.
 */
function dotUsdPrice(pools: PoolReserves[]): bigint {
  const prices = pools
    .filter((pool) => USD_ASSET_IDS.includes(pool.asset.id))
    .map((pool) => price(pool.assetReserve, pool.asset.decimals, pool.dotReserve, DOT.decimals))
    .sort(compare)
  if (prices.length === 0) throw new Error('No stablecoin pool found')
  const middle = Math.floor(prices.length / 2)
  // With an even number of pools, e.g. if one couldn't be read: the mean of the middle two.
  return prices.length % 2 === 1 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2n
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
    last_price: formatFixed(prices.at(-1) ?? priceOf(pool.dotReserve, pool.assetReserve)),
    base_volume: formatUnits(sum(trades.map((trade) => trade.dotAmount)), DOT.decimals),
    target_volume: formatUnits(sum(trades.map((trade) => trade.assetAmount)), asset.decimals),
    liquidity_in_usd: liquidityUsd,
  }
  if (prices.length === 0) return ticker
  return { ...ticker, high: formatFixed(max(prices)), low: formatFixed(min(prices)) }
}

const compare = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0)
const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n)
const max = (values: bigint[]) => values.reduce((a, b) => (b > a ? b : a))
const min = (values: bigint[]) => values.reduce((a, b) => (b < a ? b : a))
