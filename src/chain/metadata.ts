import { locationKey, type AssetInfo, type Location } from './assets.ts'
import type { Block, Chain } from './client.ts'

/**
 * Caches asset metadata (CoinGecko id, symbol, decimals). Metadata rarely changes, so a change
 * to any asset clears the whole cache.
 */
export function createMetadataCache(chain: Pick<Chain, 'assetInfo'>) {
  const cache = new Map<string, AssetInfo>()
  /** The latest block known to have changed metadata. */
  let changedAt = 0

  return {
    async get(location: Location, block: Block): Promise<AssetInfo | undefined> {
      const key = locationKey(location)
      const cached = cache.get(key)
      if (cached) return cached

      const info = await chain.assetInfo(location, block.hash)
      // Metadata read at a block before the latest change may be outdated: use it, but don't keep it.
      if (info && block.number >= changedAt) cache.set(key, info)
      return info
    },

    /** Call for each block that changes asset metadata. */
    invalidate(blockNumber: number) {
      console.log(`metadata: changed at #${blockNumber}, clearing the cache`)
      cache.clear()
      changedAt = Math.max(changedAt, blockNumber)
    },
  }
}

export type MetadataCache = ReturnType<typeof createMetadataCache>
