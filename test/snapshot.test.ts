import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isFresh, type Snapshot } from '../src/tickers/snapshot.ts'

const now = Date.parse('2026-10-08T12:00:00Z')
const snapshot = (block: number, head: number, ageSeconds: number): Snapshot => ({
  block,
  head,
  updatedAt: new Date(now - ageSeconds * 1000),
  json: '[]',
  html: '',
})

test('serves a recent snapshot of a caught-up indexer', () => {
  assert.equal(isFresh(snapshot(1000, 1002, 30), now), true)
})

test('rejects a snapshot that has not been rebuilt for 5 minutes', () => {
  assert.equal(isFresh(snapshot(1000, 1000, 300), now), false)
})

test('rejects a snapshot whose indexed block is far behind the chain head', () => {
  // Indexing stalled at #1000 while the chain moved on: volumes would be missing trades.
  assert.equal(isFresh(snapshot(1000, 1150, 0), now), false)
})
