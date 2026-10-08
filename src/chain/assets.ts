import type { XcmV5Junctions } from '@polkadot-api/descriptors'

export type Location = { parents: number; interior: XcmV5Junctions }

export type AssetInfo = {
  /** Identifier used in the CoinGecko API. */
  id: string
  symbol: string
  decimals: number
}

const ASSETS_PALLET_INDEX = 50

export const DOT_LOCATION: Location = { parents: 1, interior: { type: 'Here', value: undefined } }
export const DOT: AssetInfo = { id: 'DOT', symbol: 'DOT', decimals: 10 }
/** dotUSD (asset 7873). Its DOT pool prices DOT in USD, with dotUSD valued at $1. */
export const USD_ASSET_ID = '7873'

export function isDot(location: Location): boolean {
  return location.parents === 1 && location.interior.type === 'Here'
}

/** Stable string key for a Location (used to match pools, events and stored trades). */
export function locationKey(location: Location): string {
  return JSON.stringify(location, (_, value) => (typeof value === 'bigint' ? value.toString() : value))
}

/** Asset id of a trust-backed asset (pallet `Assets`), or undefined for any other location. */
export function trustBackedAssetId(location: Location): number | undefined {
  const { parents, interior } = location
  if (parents !== 0 || interior.type !== 'X2') return undefined
  const [pallet, index] = interior.value
  if (pallet.type !== 'PalletInstance' || pallet.value !== ASSETS_PALLET_INDEX) return undefined
  if (index.type !== 'GeneralIndex') return undefined
  return Number(index.value)
}

/**
 * ERC20 precompile address of a foreign asset on Polkadot Hub:
 * 4-byte big-endian asset index, 12 zero bytes, then the 0x02200000 foreign-assets suffix.
 */
export function foreignAssetAddress(assetIndex: number): string {
  return `0x${assetIndex.toString(16).padStart(8, '0')}${'0'.repeat(24)}02200000`
}
