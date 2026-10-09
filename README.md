# Asset Hub DEX API

CoinGecko DEX API for the pools of Polkadot Asset Hub's `pallet-asset-conversion`. It implements `/tickers` from CoinGecko's [Integration API Standards](https://docs.google.com/document/d/1v27QFoQq1SKT3Priq3aqPgB70Xd_PnDzbOCiuoCyixw) (section A).

## API

| Endpoint | |
|---|---|
| `GET /tickers` | Pools with at least $1,000 of liquidity, as CoinGecko tickers. Cached for 30s. |
| `GET /` | Stats page with the same data, for verifying the API. |
| `GET /health` | Indexing status. 503 when there is no up-to-date data. |

Data is up to date when the last snapshot is less than 5 minutes old and its block is less than 150 blocks (about 5 minutes) behind the chain head. Otherwise all three endpoints return 503 rather than incomplete numbers.

No `/orderbook` (the pools are AMMs) and no `/historical_trades` (optional).

```json
[
  {
    "ticker_id": "DOT_1984",
    "base_currency": "DOT",
    "target_currency": "1984",
    "pool_id": "12dvmstTqsjrPrPdouMpbsgaaQjPGYFh7gMaiNgZ7Rzaacok",
    "last_price": "1.101689686529646606",
    "base_volume": "485536.4907235581",
    "target_volume": "512232.324393",
    "liquidity_in_usd": "2151618.84",
    "high": "1.12007959770830571",
    "low": "0.982857263335303944"
  }
]
```

| Field | Value |
|---|---|
| `base_currency` | Always `DOT`: the runtime only allows pools of DOT and one other asset (`PoolLocator = WithFirstAsset<DotLocation>`). |
| `target_currency` | Asset id for trust-backed assets (`1984` USDt, `1337` USDC), ERC20 precompile address for foreign assets (`0x0000001200000000000000000000000002200000`). |
| `ticker_id` | `{base_currency}_{target_currency}` |
| `pool_id` | Pool account (SS58). |
| `last_price` | Target per DOT at the last trade of the past 24h, or from reserves if there was none. |
| `base_volume`, `target_volume` | 24h volume in DOT and in the target asset. |
| `high`, `low` | 24h price range, omitted without trades. |
| `liquidity_in_usd` | 2 × DOT reserve × DOT price. |

- Decimals are strings, for full precision.
- USD values take the DOT price from the DOT/dotUSD pool, with dotUSD at $1.
- Volume counts `SwapExecuted` and `SwapCreditExecuted` (fees paid in other assets). A swap routed through two pools counts in both.
- Dust trades, under 10,000 base units, count towards volume but not prices.
- Pools are constant product (x·y = k) with a 0.3% fee, so CoinGecko's default Uniswap V2 depth formula applies.

## How it works

One Node.js process with SQLite, reading the chain through [polkadot-api](https://papi.how):

- `src/chain` reads Asset Hub. Asset metadata is cached until a block changes it.
- `src/indexer` follows finalized blocks and stores each swap's trades, one per pool. A fresh start backfills the last 24h, found by block timestamp; a restart resumes where it stopped. Trades older than 24h are deleted.
- `src/tickers` rebuilds the tickers every minute from the reserves and the last 24h of trades, both at the last indexed block.
- `src/http` serves the latest tickers from memory, with [Hono](https://hono.dev).

The RPC node must keep a little over a day of block history, as any archive node does.

## Running

Requires Node.js 24, which runs the TypeScript sources directly.

```sh
npm install   # generates the chain descriptors from .papi/metadata
npm start     # the first start indexes 24h of swaps, about 6 minutes
```

```sh
docker build -t asset-hub-dex-api .
docker run -p 3000:3000 -v dex-data:/data asset-hub-dex-api
```

In production:

- Keep `/data` on a persistent volume, so restarts skip the backfill.
- Restart the service when `/health` keeps failing, e.g. with a Kubernetes liveness probe. It can't recover from everything on its own.
- Start those checks about 10 minutes after a fresh start, so they don't restart it mid-backfill.

| Variable | Default | |
|---|---|---|
| `RPC_URLS` | Parity, Dwellir | WebSocket endpoints, comma-separated, tried in order |
| `PORT` | `3000` | |
| `DB_PATH` | `data/trades.db` | |
| `REFRESH_SECONDS` | `60` | Seconds between ticker rebuilds |
| `CONCURRENCY` | `50` | Blocks read in parallel while catching up |
| `MIN_LIQUIDITY_USD` | `1000` | Pools with less liquidity are left out |

## Development

```sh
npm test
npm run typecheck
npx papi update   # after a runtime upgrade that changes the pallets used here
```
