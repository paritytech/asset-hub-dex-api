import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DOT_LOCATION, foreignAssetAddress, locationKey, trustBackedAssetId, type Location } from '../src/assets.ts'
import { legsFromPath } from '../src/swaps.ts'

const asset = (id: bigint): Location => ({
  parents: 0,
  interior: { type: 'X2', value: [{ type: 'PalletInstance', value: 50 }, { type: 'GeneralIndex', value: id }] },
})
const USDT = asset(1984n)
const DOTUSD = asset(7873n)

test('splits a multi-hop swap into one leg per pool', () => {
  // SwapExecuted at block #21,572,110: 19,981.085162 dotUSD -> 22,556.10 DOT -> 24,301.065755 USDt
  const legs = legsFromPath([
    [DOTUSD, 19_981_085_162n],
    [DOT_LOCATION, 225_561_014_239_531n],
    [USDT, 24_301_065_755n],
  ])
  assert.deepEqual(legs, [
    { asset: locationKey(DOTUSD), dotAmount: 225_561_014_239_531n, assetAmount: 19_981_085_162n, type: 'buy' },
    { asset: locationKey(USDT), dotAmount: 225_561_014_239_531n, assetAmount: 24_301_065_755n, type: 'sell' },
  ])
})

test('single-hop swaps', () => {
  assert.deepEqual(legsFromPath([[DOT_LOCATION, 10n], [USDT, 20n]]), [
    { asset: locationKey(USDT), dotAmount: 10n, assetAmount: 20n, type: 'sell' },
  ])
  assert.deepEqual(legsFromPath([[USDT, 20n], [DOT_LOCATION, 10n]]), [
    { asset: locationKey(USDT), dotAmount: 10n, assetAmount: 20n, type: 'buy' },
  ])
})

test('asset ids', () => {
  assert.equal(trustBackedAssetId(USDT), 1984)
  assert.equal(trustBackedAssetId(DOT_LOCATION), undefined)
  assert.equal(trustBackedAssetId({ parents: 1, interior: { type: 'X1', value: { type: 'Parachain', value: 3369 } } }), undefined)
  // Snowbridge USDC has foreign asset index 18.
  assert.equal(foreignAssetAddress(18), '0x0000001200000000000000000000000002200000')
})
