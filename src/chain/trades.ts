import { isDot, locationKey, type Location } from './assets.ts'

/** What a swap traded in one DOT/asset pool. */
export type Trade = {
  /** locationKey of the pool's non-DOT asset. */
  asset: string
  dotAmount: bigint
  assetAmount: bigint
}

/** A trade and where it happened on chain. */
export type IndexedTrade = Trade & {
  block: number
  /** Index of the swap event in the block. */
  eventIndex: number
  /** Position of the pool in the swap's path. */
  hop: number
  /** Block timestamp in milliseconds. */
  timestamp: number
}

/**
 * Splits a swap's path `[(asset0, amount0), (asset1, amount1), ...]` into one trade per pool.
 * Every pool pairs DOT with another asset, so a multi-hop swap is always X -> DOT -> Y.
 */
export function tradesFromPath(path: [Location, bigint][]): Trade[] {
  const trades: Trade[] = []
  for (let i = 1; i < path.length; i++) {
    const [assetIn, amountIn] = path[i - 1]
    const [assetOut, amountOut] = path[i]
    if (isDot(assetIn)) trades.push({ asset: locationKey(assetOut), dotAmount: amountIn, assetAmount: amountOut })
    else if (isDot(assetOut)) trades.push({ asset: locationKey(assetIn), dotAmount: amountOut, assetAmount: amountIn })
  }
  return trades
}
