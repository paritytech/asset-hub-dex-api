import postgres from 'postgres'
import type { IndexedTrade, Trade } from '../chain/trades.ts'

/** Indexed trades and the last indexed block, in PostgreSQL. Amounts are NUMERIC, as they exceed 64 bits. */
export async function openDb(url: string) {
  // Notices are only "already exists, skipping" from the schema below.
  const sql = postgres(url, { onnotice: () => {} })
  await sql`
    CREATE TABLE IF NOT EXISTS trades (
      block INTEGER NOT NULL,
      event_index INTEGER NOT NULL,
      hop INTEGER NOT NULL,
      timestamp BIGINT NOT NULL,
      asset TEXT NOT NULL,
      dot_amount NUMERIC NOT NULL,
      asset_amount NUMERIC NOT NULL,
      PRIMARY KEY (block, event_index, hop)
    )`
  await sql`CREATE INDEX IF NOT EXISTS trades_timestamp ON trades (timestamp)`
  await sql`CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`

  return {
    async lastBlock(): Promise<number | undefined> {
      const [row] = await sql<{ value: string }[]>`SELECT value FROM state WHERE key = 'lastBlock'`
      return row ? Number(row.value) : undefined
    },

    /** Stores the trades of a block range and marks the range as indexed, in one transaction. */
    async saveBlocks(trades: IndexedTrade[], lastBlock: number) {
      const rows = trades.map((t) => ({
        block: t.block,
        event_index: t.eventIndex,
        hop: t.hop,
        timestamp: t.timestamp,
        asset: t.asset,
        dot_amount: String(t.dotAmount),
        asset_amount: String(t.assetAmount),
      }))
      await sql.begin(async (sql) => {
        if (rows.length > 0) await sql`INSERT INTO trades ${sql(rows)} ON CONFLICT DO NOTHING`
        await sql`
          INSERT INTO state (key, value) VALUES ('lastBlock', ${String(lastBlock)})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
      })
    },

    /** Trades since `timestamp` (in milliseconds) up to block `untilBlock`, oldest first. */
    async tradesSince(timestamp: number, untilBlock: number): Promise<Trade[]> {
      const rows = await sql<{ asset: string; dot_amount: string; asset_amount: string }[]>`
        SELECT asset, dot_amount, asset_amount FROM trades
        WHERE timestamp >= ${timestamp} AND block <= ${untilBlock} ORDER BY block, event_index, hop`
      return rows.map((row) => ({ asset: row.asset, dotAmount: BigInt(row.dot_amount), assetAmount: BigInt(row.asset_amount) }))
    },

    async pruneBefore(timestamp: number) {
      await sql`DELETE FROM trades WHERE timestamp < ${timestamp}`
    },
  }
}

export type Db = Awaited<ReturnType<typeof openDb>>
