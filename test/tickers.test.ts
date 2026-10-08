import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Trade } from '../src/chain/trades.ts'
import { formatPrice, formatUnits, price } from '../src/tickers/decimal.ts'
import { buildTickers, type PoolReserves } from '../src/tickers/tickers.ts'

const usdt: PoolReserves = {
  account: '12dvmstTqsjrPrPdouMpbsgaaQjPGYFh7gMaiNgZ7Rzaacok',
  assetKey: 'usdt',
  asset: { id: '1984', symbol: 'USDt', decimals: 6 },
  dotReserve: 1_000_000n * 10n ** 10n, // 1M DOT
  assetReserve: 1_100_000n * 10n ** 6n, // 1.1M USDt, so DOT = $1.10
}
const glmr: PoolReserves = {
  account: '13foreign',
  assetKey: 'glmr',
  asset: { id: '0x0000002000000000000000000000000002200000', symbol: 'GLMR', decimals: 18 },
  dotReserve: 100n * 10n ** 10n, // 100 DOT
  assetReserve: 5_000n * 10n ** 18n, // 5,000 GLMR, so 50 GLMR per DOT
}

const trade = (asset: string, dotAmount: bigint, assetAmount: bigint): Trade => ({ asset, dotAmount, assetAmount })

test('decimal helpers', () => {
  assert.equal(formatUnits(1_234_500n, 6), '1.2345')
  assert.equal(formatUnits(5n, 6), '0.000005')
  assert.equal(formatUnits(1_000_000n, 6), '1')
  assert.equal(formatUnits(1_239n, 3, 2), '1.23')
  assert.equal(formatPrice(price(11n * 10n ** 5n, 6, 10n ** 10n, 10)), '1.1')
})

test('tickers from reserves and trades', () => {
  const trades = [
    trade('usdt', 10n * 10n ** 10n, 11_200_000n), // 10 DOT for 11.2 USDt
    trade('usdt', 5n * 10n ** 10n, 5_400_000n), // 5 DOT for 5.4 USDt
    trade('usdt', 756n, 1n), // dust: counts towards volume, not price
  ]
  const [first, second] = buildTickers([glmr, usdt], trades, 0)

  // Largest pool first.
  assert.deepEqual(first.ticker, {
    ticker_id: 'DOT_1984',
    base_currency: 'DOT',
    target_currency: '1984',
    pool_id: usdt.account,
    last_price: '1.08',
    base_volume: '15.0000000756',
    target_volume: '16.600001',
    liquidity_in_usd: '2200000',
    high: '1.12',
    low: '1.08',
  })
  assert.equal(first.volumeUsd, '16.5')

  // No trades: the price from reserves, and no high/low.
  assert.deepEqual(second.ticker, {
    ticker_id: 'DOT_0x0000002000000000000000000000000002200000',
    base_currency: 'DOT',
    target_currency: '0x0000002000000000000000000000000002200000',
    pool_id: glmr.account,
    last_price: '50',
    base_volume: '0',
    target_volume: '0',
    liquidity_in_usd: '220',
  })
})

test('leaves out pools below the minimum liquidity', () => {
  // The GLMR pool holds $220, the USDt pool $2.2M.
  assert.deepEqual(buildTickers([glmr, usdt], [], 1000).map((row) => row.ticker.ticker_id), ['DOT_1984'])
  assert.equal(buildTickers([glmr, usdt], [], 220).length, 2)
})

test('fails without the USDt pool', () => {
  assert.throws(() => buildTickers([glmr], [], 0), /pool not found/)
})
