import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { IndexedTrade, Trade } from '../chain/trades.ts'

/** Indexed trades and the last indexed block, in SQLite. Amounts are stored as text, as they exceed 64 bits. */
export function openDb(path: string) {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      block INTEGER NOT NULL,
      event_index INTEGER NOT NULL,
      hop INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      asset TEXT NOT NULL,
      dot_amount TEXT NOT NULL,
      asset_amount TEXT NOT NULL,
      PRIMARY KEY (block, event_index, hop)
    );
    CREATE INDEX IF NOT EXISTS trades_timestamp ON trades (timestamp);
    CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)

  const insertTrade = db.prepare(`
    INSERT OR REPLACE INTO trades (block, event_index, hop, timestamp, asset, dot_amount, asset_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
  const selectTrades = db.prepare(`
    SELECT asset, dot_amount, asset_amount FROM trades WHERE timestamp >= ? ORDER BY block, event_index, hop`)
  const deleteTrades = db.prepare('DELETE FROM trades WHERE timestamp < ?')
  const getState = db.prepare('SELECT value FROM state WHERE key = ?')
  const setState = db.prepare('INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)')

  return {
    lastBlock(): number | undefined {
      const row = getState.get('lastBlock') as { value: string } | undefined
      return row ? Number(row.value) : undefined
    },

    /** Stores the trades of a block range and marks the range as indexed, in one transaction. */
    saveBlocks(trades: IndexedTrade[], lastBlock: number) {
      db.exec('BEGIN')
      try {
        for (const t of trades) {
          insertTrade.run(t.block, t.eventIndex, t.hop, t.timestamp, t.asset, String(t.dotAmount), String(t.assetAmount))
        }
        setState.run('lastBlock', String(lastBlock))
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },

    /** Trades since `timestamp` (in milliseconds), oldest first. */
    tradesSince(timestamp: number): Trade[] {
      const rows = selectTrades.all(timestamp) as { asset: string; dot_amount: string; asset_amount: string }[]
      return rows.map((row) => ({ asset: row.asset, dotAmount: BigInt(row.dot_amount), assetAmount: BigInt(row.asset_amount) }))
    },

    pruneBefore(timestamp: number) {
      deleteTrades.run(timestamp)
    },
  }
}

export type Db = ReturnType<typeof openDb>
