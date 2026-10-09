import { Blake2256 } from '@polkadot-api/substrate-bindings'
import { ah } from '@polkadot-api/descriptors'
import { AccountId, getTypedCodecs, type FixedSizeArray } from 'polkadot-api'
import { mergeUint8 } from 'polkadot-api/utils'
import { createWsClient } from 'polkadot-api/ws'
import { DOT, DOT_LOCATION, foreignAssetAddress, isDot, trustBackedAssetId, type AssetInfo, type Location } from './assets.ts'
import { tradesFromPath, type IndexedTrade } from './trades.ts'

export type Block = { hash: string; number: number }

export type Pool = {
  /** The pool's non-DOT asset. */
  asset: Location
  /** The pool account (SS58, Polkadot prefix). It holds the reserves and serves as the pool id. */
  account: string
}

/** A block's trades, and whether it changed any asset metadata. */
export type BlockData = { number: number; trades: IndexedTrade[]; metadataChanged: boolean }

// Pool accounts are blake2_256("py/ascon" ++ SCALE((asset1, asset2))), the runtime's AccountIdConverter.
const POOL_ACCOUNT_SEED = new TextEncoder().encode('py/ascon')
const toSs58 = AccountId(0).dec
const text = new TextDecoder()

/** Reads from Polkadot Asset Hub. Holds no state of its own. */
export async function connectChain(rpcUrls: string[]) {
  const client = createWsClient(rpcUrls)
  const api = client.getTypedApi(ah)
  const codecs = await getTypedCodecs(ah)

  async function readBlock(number: number): Promise<BlockData> {
    const { hash: at } = await block(number)
    const events = await api.query.System.Events.getValue({ at })
    const metadataChanged = events.some(
      ({ event }) =>
        (event.type === 'Assets' || event.type === 'ForeignAssets') &&
        (event.value.type === 'MetadataSet' || event.value.type === 'MetadataCleared'),
    )
    const trades = events.flatMap(({ event }, eventIndex) => {
      if (event.type !== 'AssetConversion') return []
      if (event.value.type !== 'SwapExecuted' && event.value.type !== 'SwapCreditExecuted') return []
      return tradesFromPath(event.value.value.path).map((trade, hop) => ({ ...trade, block: number, eventIndex, hop }))
    })
    if (trades.length === 0) return { number, trades: [], metadataChanged }

    const timestamp = await timestampAt(at)
    return { number, trades: trades.map((trade) => ({ ...trade, timestamp })), metadataChanged }
  }

  /** A block's timestamp, in milliseconds. */
  async function blockTimestamp(number: number): Promise<number> {
    return timestampAt((await block(number)).hash)
  }

  async function timestampAt(at: string): Promise<number> {
    return Number(await api.query.Timestamp.Now.getValue({ at }))
  }

  // polkadot-api has no typed call for a block's hash by number.
  async function block(number: number): Promise<Block> {
    const hash = await client._request<string | null>('chain_getBlockHash', [number])
    if (!hash) throw new Error(`No hash for block #${number}`)
    return { hash, number }
  }

  async function pools(at: string): Promise<Pool[]> {
    const entries = await api.query.AssetConversion.Pools.getEntries({ at })
    return entries.map(({ keyArgs: [pair] }) => ({
      asset: isDot(pair[0]) ? pair[1] : pair[0],
      account: toSs58(Blake2256(mergeUint8([POOL_ACCOUNT_SEED, codecs.query.AssetConversion.Pools.args.enc([pair])]))),
    }))
  }

  /** CoinGecko id, symbol and decimals of an asset; undefined if it has no CoinGecko id. */
  async function assetInfo(location: Location, at: string): Promise<AssetInfo | undefined> {
    if (isDot(location)) return DOT

    const assetId = trustBackedAssetId(location)
    if (assetId !== undefined) {
      const { symbol, decimals } = await api.query.Assets.Metadata.getValue(assetId, { at })
      return { id: String(assetId), symbol: text.decode(symbol), decimals }
    }

    const [{ symbol, decimals }, index] = await Promise.all([
      api.query.ForeignAssets.Metadata.getValue(location, { at }),
      api.query.AssetsPrecompiles.ForeignAssetIdToAssetIndex.getValue(location, { at }),
    ])
    return index === undefined ? undefined : { id: foreignAssetAddress(index), symbol: text.decode(symbol), decimals }
  }

  /** [DOT reserve, asset reserve], or undefined if either side is empty. */
  function reserves(asset: Location, at: string): Promise<FixedSizeArray<2, bigint> | undefined> {
    return api.apis.AssetConversionApi.get_reserves(DOT_LOCATION, asset, { at })
  }

  return {
    finalizedBlock$: client.finalizedBlock$,
    finalizedBlock: (): Promise<Block> => client.getFinalizedBlock(),
    block,
    blockTimestamp,
    readBlock,
    pools,
    assetInfo,
    reserves,
  }
}

export type Chain = Awaited<ReturnType<typeof connectChain>>
