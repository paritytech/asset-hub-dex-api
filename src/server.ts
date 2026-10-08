import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { html } from 'hono/html'
import type { Indexer } from './indexer.ts'
import type { TickerRow } from './tickers.ts'

/** Tickers at a finalized block, with the responses pre-rendered so requests only send strings. */
export type Snapshot = { block: number; updatedAt: Date; json: string; html: string }

export async function createSnapshot(rows: TickerRow[], block: number, updatedAt: Date): Promise<Snapshot> {
  return {
    block,
    updatedAt,
    json: JSON.stringify(rows.map((row) => row.ticker)),
    html: String(await renderPage(rows, block, updatedAt)),
  }
}

/** /health fails when the snapshot has not been refreshed for this long. */
const STALE_AFTER_SECONDS = 300
/** /health fails when the indexer is this many blocks (about 5 minutes) behind the finalized head. */
const MAX_LAG_BLOCKS = 150

export function createApp(getSnapshot: () => Snapshot | undefined, indexer: Indexer) {
  const app = new Hono()
  app.use('*', cors())

  app.get('/tickers', (c) => {
    const snapshot = getSnapshot()
    if (!snapshot) return c.json({ error: 'Indexing in progress' }, 503)
    return c.body(snapshot.json, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' })
  })

  app.get('/health', (c) => {
    const status = indexer.status()
    const snapshot = getSnapshot()
    const snapshotAgeSeconds = snapshot ? Math.round((Date.now() - snapshot.updatedAt.getTime()) / 1000) : null
    // The snapshot reads the finalized block itself, so this also catches a stalled block subscription.
    const lag = Math.max(status.finalizedBlock, snapshot?.block ?? 0) - status.indexedBlock
    const healthy = snapshotAgeSeconds !== null && snapshotAgeSeconds < STALE_AFTER_SECONDS && lag < MAX_LAG_BLOCKS
    return c.json({ ...status, lag, snapshotBlock: snapshot?.block ?? null, snapshotAgeSeconds }, healthy ? 200 : 503)
  })

  app.get('/', (c) => {
    const snapshot = getSnapshot()
    return snapshot ? c.html(snapshot.html) : c.html(loadingPage, 503)
  })

  return app
}

const renderPage = (rows: TickerRow[], block: number, updatedAt: Date) =>
  page(html`
    <table>
      <thead>
        <tr>
          <th>Pair</th><th>Ticker</th><th>Last price</th><th>24h volume (DOT)</th><th>24h volume (target)</th>
          <th>24h volume (USD)</th><th>Liquidity (USD)</th><th>High / low (24h)</th><th>Pool</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(({ ticker, targetSymbol, volumeUsd }) => html`
          <tr>
            <td>DOT/${targetSymbol}</td>
            <td><code>${ticker.ticker_id}</code></td>
            <td>${ticker.last_price}</td>
            <td>${ticker.base_volume}</td>
            <td>${ticker.target_volume}</td>
            <td>$${volumeUsd}</td>
            <td>$${ticker.liquidity_in_usd}</td>
            <td>${ticker.high ? `${ticker.high} / ${ticker.low}` : '-'}</td>
            <td><code>${ticker.pool_id}</code></td>
          </tr>`)}
      </tbody>
    </table>
    <p>Finalized block #${block}, updated ${updatedAt.toISOString()}. Prices are in target per DOT.
      Data as JSON: <a href="/tickers">/tickers</a>.</p>`)

const page = (body: unknown) => html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Asset Hub DEX</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; color: #222; }
      table { border-collapse: collapse; font-size: 0.9rem; }
      th, td { padding: 0.4rem 0.8rem; border-bottom: 1px solid #ddd; text-align: right; white-space: nowrap; }
      th:first-child, td:first-child { text-align: left; }
      code { font-size: 0.8rem; }
    </style>
  </head>
  <body>
    <h1>Polkadot Asset Hub DEX</h1>
    <p>Pools of the Asset Hub asset-conversion pallet (constant product, 0.3% fee).</p>
    ${body}
  </body>
</html>`

const loadingPage = page(html`<p>Indexing the last 24 hours of swaps, check back in a few minutes.</p>`)
