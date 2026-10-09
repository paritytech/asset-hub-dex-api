import { html } from 'hono/html'
import type { TickerRow } from '../tickers/tickers.ts'

/** The stats page: the same data as /tickers, for checking the API against. */
export async function renderPage(rows: TickerRow[], block: number, updatedAt: Date): Promise<string> {
  return layout(html`
    <table>
      <thead>
        <tr>
          <th>Pair</th><th>Ticker</th><th>Last price</th><th>24h volume (DOT)</th><th>24h volume (target)</th>
          <th>24h volume (USD at current price)</th><th>Liquidity (USD)</th><th>High / low (24h)</th><th>Pool</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(({ ticker, symbol, volumeUsd }) => html`
          <tr>
            <td>DOT/${symbol}</td>
            <td><code>${ticker.ticker_id}</code></td>
            <td>${ticker.last_price}</td>
            <td>${ticker.base_volume}</td>
            <td>${ticker.target_volume}</td>
            <td>${volumeUsd}</td>
            <td>${ticker.liquidity_in_usd}</td>
            <td>${ticker.high ? `${ticker.high} / ${ticker.low}` : '-'}</td>
            <td><code>${ticker.pool_id}</code></td>
          </tr>`)}
      </tbody>
    </table>
    <p>Finalized block #${block}, updated ${updatedAt.toISOString()}. Prices are in target per DOT.
      Data as JSON: <a href="/tickers">/tickers</a>.</p>`)
}

export const unavailablePage = await layout(html`<p>No up-to-date data, check back in a few minutes.</p>`)

async function layout(body: unknown): Promise<string> {
  return String(await html`<!doctype html>
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
</html>`)
}
