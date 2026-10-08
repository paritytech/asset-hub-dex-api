# Asset Hub DEX API

A public, unauthenticated API for the liquidity pools of Polkadot Asset Hub's `pallet-asset-conversion`. It serves the DEX `/tickers` endpoint from CoinGecko's *Integration API Standards* (section A), so the pools can be listed as an exchange on CoinGecko.

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /tickers` | One ticker per pool with at least $1,000 of liquidity, as a JSON array. Cached for 30s. |
| `GET /` | A stats page with the same data, for checking the API against. |
| `GET /health` | Indexing status. Returns 503 until the first snapshot is ready, or when the snapshot or indexing is more than 5 minutes (150 blocks) behind. |

`/orderbook` is not provided: the pools are AMM pools. `/historical_trades` is optional in the standard and not provided.

### `/tickers`

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

Every pool pairs DOT with one other asset, so DOT is always the base currency. Decimal values are strings, to keep full precision.

| Field | How it is derived |
|---|---|
| `base_currency`, `target_currency` | `DOT` for the native token. Trust-backed assets (pallet `Assets`) use their asset id, e.g. `1984` for USDt and `1337` for USDC. Foreign assets use their ERC20 precompile address on Polkadot Hub, e.g. `0x0000001200000000000000000000000002200000`. |
| `ticker_id` | `{base_currency}_{target_currency}` |
| `pool_id` | The pool account (SS58, Polkadot prefix). It holds the pool's reserves. |
| `last_price` | Target per DOT, from the pool's last swap in the past 24 hours. Pools with no swaps in that time use the current price from reserves. |
| `base_volume`, `target_volume` | 24h single-sided volume in DOT and in the target asset. |
| `high`, `low` | Highest and lowest swap price in the past 24 hours. Left out when the pool had no swaps. |
| `liquidity_in_usd` | 2 × the pool's DOT reserve × the DOT price in USD. |

USD values use the DOT price of the DOT/USDt pool, with USDt valued at $1. Volumes count both swap events (`SwapExecuted`, and `SwapCreditExecuted` from fees paid in other assets). A swap routed through two pools (X → DOT → Y) counts as a trade in each of them.

**Depth:** the pools use the Uniswap V2 constant product formula (x·y = k) with a 0.3% LP fee, so CoinGecko's default Uniswap V2 depth calculation applies.

## How it works

One Node.js process, with no external database:

1. **Indexer.** Follows finalized blocks and stores each swap, split into one row per pool, in SQLite. On a fresh start it backfills the last 43,200 blocks (at least 24 hours). After a restart it resumes from the last indexed block.
2. **Snapshot.** Every 60 seconds it reads the pools and their reserves at the latest finalized block and builds the tickers from the swaps of the last 24 hours.
3. **HTTP.** [Hono](https://hono.dev) serves the snapshot from memory.

Chain access uses [polkadot-api](https://papi.how) against a public RPC node. That node must serve historical blocks for the backfill.

## Running

Requires Node.js 24 or later; it runs the TypeScript sources directly.

```sh
npm install   # also generates the chain descriptors from .papi/metadata
npm start     # the first start takes about 6 minutes to index 24 hours of swaps
```

Docker:

```sh
docker build -t asset-hub-dex-api .
docker run -p 3000:3000 -v dex-data:/data asset-hub-dex-api
```

In production:

- **Keep `/data` on a persistent volume.** Otherwise every restart repeats the 24h backfill, about 6 minutes without data.
- **Restart the service when `/health` keeps failing.** If the service gets stuck, e.g. after losing its chain connection, it can't restart itself. Configure the hosting platform to do it, for example with a Kubernetes liveness probe.
- **Delay those health checks by about 10 minutes after a fresh start.** `/health` fails while the first backfill runs, so checks that start immediately would restart the service mid-backfill, over and over.

| Variable | Default | |
|---|---|---|
| `RPC_URLS` | Parity and Dwellir public RPCs | Comma-separated WebSocket endpoints, tried in order |
| `PORT` | `3000` | |
| `DB_PATH` | `data/trades.db` | |
| `REFRESH_SECONDS` | `60` | How often the snapshot is rebuilt |
| `BACKFILL_BLOCKS` | `43200` | Blocks indexed on a fresh start |
| `CONCURRENCY` | `50` | Blocks fetched in parallel while catching up |
| `MIN_LIQUIDITY_USD` | `1000` | Pools with less liquidity are left out of `/tickers` and the stats page |
| `RETENTION_DAYS` | `7` | Swaps older than this are deleted |

```sh
npm test
npm run typecheck
```

After a runtime upgrade that changes the pallets used here, refresh the metadata with `npx papi update`.
