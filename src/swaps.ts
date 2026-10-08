import { isDot, locationKey, type Location } from './assets.ts'

/** One hop of a swap through a single DOT/asset pool. */
export type Leg = {
  /** locationKey of the pool's non-DOT asset. */
  asset: string
  dotAmount: bigint
  assetAmount: bigint
  /** Relative to DOT as the base currency: 'buy' when DOT was bought from the pool. */
  type: 'buy' | 'sell'
}

/**
 * Splits a swap path `[(asset0, amount0), (asset1, amount1), ...]` into per-pool legs.
 * Every pool contains DOT, so multi-hop swaps are always X -> DOT -> Y.
 */
export function legsFromPath(path: [Location, bigint][]): Leg[] {
  const legs: Leg[] = []
  for (let i = 0; i + 1 < path.length; i++) {
    const [assetIn, amountIn] = path[i]
    const [assetOut, amountOut] = path[i + 1]
    if (isDot(assetIn) && !isDot(assetOut)) {
      legs.push({ asset: locationKey(assetOut), dotAmount: amountIn, assetAmount: amountOut, type: 'sell' })
    } else if (isDot(assetOut) && !isDot(assetIn)) {
      legs.push({ asset: locationKey(assetIn), dotAmount: amountOut, assetAmount: amountIn, type: 'buy' })
    }
  }
  return legs
}
