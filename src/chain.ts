import { Blake2256 } from '@polkadot-api/substrate-bindings'
import { ah } from '@polkadot-api/descriptors'
import { AccountId, getTypedCodecs, type FixedSizeArray } from 'polkadot-api'
import { mergeUint8 } from 'polkadot-api/utils'
import { createWsClient } from 'polkadot-api/ws'
import {
  DOT,
  DOT_LOCATION,
  foreignAssetAddress,
  isDot,
  locationKey,
  trustBackedAssetId,
  type AssetInfo,
  type Location,
} from './assets.ts'
import type { Trade } from './db.ts'
import { legsFromPath } from './swaps.ts'

export type Pool = {
  /** The pool's non-DOT asset. */
  asset: Location
  lpToken: number
  /** Pool account (SS58, Polkadot prefix): holds the reserves and serves as the pool id. */
  account: string
}

// AccountIdConverter<"py/ascon", (Location, Location)>: blake2_256(pallet id ++ SCALE(pool id)).
const POOL_ACCOUNT_SEED = new TextEncoder().encode('py/ascon')
const toSs58 = AccountId(0).dec
const text = new TextDecoder()

export async function connectChain(rpcUrls: string[]) {
  const client = createWsClient(rpcUrls)
  const api = client.getTypedApi(ah)
  const codecs = await getTypedCodecs(ah)
  // Asset metadata, cleared whenever a block changes any. Changes are rare, so clearing it all is simplest.
  const assetInfoCache = new Map<string, AssetInfo>()
  // Bumped on every clear, so a read that overlapped a change is not cached.
  let metadataVersion = 0

  async function blockHash(number: number): Promise<string> {
    const hash = await client._request<string | null>('chain_getBlockHash', [number])
    if (!hash) throw new Error(`No hash for block #${number}`)
    return hash
  }

  /** Swap legs executed in a block. Also clears the asset metadata cache if the block changes metadata. */
  async function blockTrades(number: number): Promise<Trade[]> {
    const at = await blockHash(number)
    const events = await api.query.System.Events.getValue({ at })
    const trades: Omit<Trade, 'timestamp'>[] = []
    events.forEach(({ event }, eventIndex) => {
      if (
        (event.type === 'Assets' || event.type === 'ForeignAssets') &&
        (event.value.type === 'MetadataSet' || event.value.type === 'MetadataCleared')
      ) {
        console.log(`chain: ${event.type}.${event.value.type} at #${number}, clearing asset metadata cache`)
        assetInfoCache.clear()
        metadataVersion++
      }
      if (event.type !== 'AssetConversion') return
      if (event.value.type !== 'SwapExecuted' && event.value.type !== 'SwapCreditExecuted') return
      legsFromPath(event.value.value.path).forEach((leg, i) => trades.push({ ...leg, block: number, eventIndex, leg: i }))
    })
    if (trades.length === 0) return []
    const timestamp = Number(await api.query.Timestamp.Now.getValue({ at }))
    return trades.map((trade) => ({ ...trade, timestamp }))
  }

  async function pools(at: string): Promise<Pool[]> {
    const entries = await api.query.AssetConversion.Pools.getEntries({ at })
    return entries.map(({ keyArgs: [pair], value: lpToken }) => {
      const encodedPair = codecs.query.AssetConversion.Pools.args.enc([pair])
      return {
        asset: isDot(pair[0]) ? pair[1] : pair[0],
        lpToken,
        account: toSs58(Blake2256(mergeUint8([POOL_ACCOUNT_SEED, encodedPair]))),
      }
    })
  }

  /** CoinGecko id, symbol and decimals of an asset; undefined if it has no usable id. */
  async function assetInfo(location: Location): Promise<AssetInfo | undefined> {
    if (isDot(location)) return DOT
    const key = locationKey(location)
    const cached = assetInfoCache.get(key)
    if (cached) return cached

    // Reads use the latest finalized block, which is at or past any block the indexer has seen.
    const version = metadataVersion
    let info: AssetInfo | undefined
    const assetId = trustBackedAssetId(location)
    if (assetId !== undefined) {
      const metadata = await api.query.Assets.Metadata.getValue(assetId)
      info = { id: String(assetId), symbol: text.decode(metadata.symbol), decimals: metadata.decimals }
    } else {
      const [metadata, index] = await Promise.all([
        api.query.ForeignAssets.Metadata.getValue(location),
        api.query.AssetsPrecompiles.ForeignAssetIdToAssetIndex.getValue(location),
      ])
      if (index !== undefined) {
        info = { id: foreignAssetAddress(index), symbol: text.decode(metadata.symbol), decimals: metadata.decimals }
      }
    }
    if (info && version === metadataVersion) assetInfoCache.set(key, info)
    return info
  }

  /** [DOT reserve, asset reserve], or undefined if either side is empty. */
  async function reserves(asset: Location, at: string): Promise<FixedSizeArray<2, bigint> | undefined> {
    return api.apis.AssetConversionApi.get_reserves(DOT_LOCATION, asset, { at })
  }

  return { client, blockTrades, pools, assetInfo, reserves }
}

export type Chain = Awaited<ReturnType<typeof connectChain>>
