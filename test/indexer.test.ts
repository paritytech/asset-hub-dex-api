import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blockBefore } from '../src/indexer/indexer.ts'

/** A chain whose block `n` has timestamp `n * blockMs`. */
const chain = (blockMs: number) => async (block: number) => block * blockMs

test('finds a block shortly before a time, whatever the block time', async () => {
  const head = 1_000_000
  for (const blockMs of [500, 2000, 6000]) {
    const since = (head - 40_000) * blockMs // block head - 40,000 is the first one at `since`
    const block = await blockBefore(since, head, chain(blockMs))
    assert.ok(block < head - 40_000, `#${block} is not before`)
    assert.ok(block >= head - 40_000 - 1800, `#${block} is too early`)
  }
})

test('stops at genesis', async () => {
  assert.equal(await blockBefore(0, 5000, chain(2000)), 0)
})
