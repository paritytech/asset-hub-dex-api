import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DOT_LOCATION, type AssetInfo } from '../src/chain/assets.ts'
import { createMetadataCache } from '../src/chain/metadata.ts'

/** A cache over a fake chain whose metadata reads return `symbol` and are counted. */
function setup() {
  const chain = { symbol: 'OLD', reads: 0 }
  const metadata = createMetadataCache({
    assetInfo: async (): Promise<AssetInfo> => {
      chain.reads++
      return { id: '1', symbol: chain.symbol, decimals: 6 }
    },
  })
  const get = async (blockNumber: number) => (await metadata.get(DOT_LOCATION, { hash: '0x', number: blockNumber }))?.symbol
  return { chain, metadata, get }
}

test('caches metadata until it changes', async () => {
  const { chain, metadata, get } = setup()
  assert.equal(await get(10), 'OLD')
  assert.equal(await get(11), 'OLD')
  assert.equal(chain.reads, 1)

  chain.symbol = 'NEW'
  metadata.invalidate(12)
  assert.equal(await get(12), 'NEW')
  assert.equal(chain.reads, 2)
})

test('does not keep metadata read before the latest change', async () => {
  const { chain, metadata, get } = setup()
  metadata.invalidate(12)
  await get(11) // read at a block before the change: used once, not cached
  await get(11)
  assert.equal(chain.reads, 2)
})
