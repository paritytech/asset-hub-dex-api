import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Leg } from './swaps.ts'

export type Trade = Leg & {
  block: number
  eventIndex: number
  leg: number
  /** Block timestamp in milliseconds. */
  timestamp: number
}

type TradeRow = {
  block: number
  event_index: number
  leg: number
  timestamp: number
  asset: string
  dot_amount: string
  asset_amount: string
  type: 'buy' | 'sell'
}

export function openDb(path: string) {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      block INTEGER NOT NULL,
      event_index INTEGER NOT NULL,
      leg INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      asset TEXT NOT NULL,
      dot_amount TEXT NOT NULL,
      asset_amount TEXT NOT NULL,
      type TEXT NOT NULL,
      PRIMARY KEY (block, event_index, leg)
    );
    CREATE INDEX IF NOT EXISTS trades_timestamp ON trades (timestamp);
    CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)

  const insertTrade = db.prepare(`
    INSERT OR REPLACE INTO trades (block, event_index, leg, timestamp, asset, dot_amount, asset_amount, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const setState = db.prepare('INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)')
  const getState = db.prepare('SELECT value FROM state WHERE key = ?')
  const selectTrades = db.prepare('SELECT * FROM trades WHERE timestamp >= ? ORDER BY block, event_index, leg')
  const deleteTrades = db.prepare('DELETE FROM trades WHERE timestamp < ?')

  return {
    lastBlock(): number | undefined {
      const row = getState.get('lastBlock') as { value: string } | undefined
      return row ? Number(row.value) : undefined
    },

    /** Stores the trades of a block range and marks it as indexed, atomically. */
    saveBlocks(trades: Trade[], lastBlock: number) {
      db.exec('BEGIN')
      try {
        for (const t of trades) {
          insertTrade.run(t.block, t.eventIndex, t.leg, t.timestamp, t.asset, t.dotAmount.toString(), t.assetAmount.toString(), t.type)
        }
        setState.run('lastBlock', String(lastBlock))
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },

    tradesSince(timestamp: number): Trade[] {
      return (selectTrades.all(timestamp) as TradeRow[]).map((row) => ({
        block: row.block,
        eventIndex: row.event_index,
        leg: row.leg,
        timestamp: row.timestamp,
        asset: row.asset,
        dotAmount: BigInt(row.dot_amount),
        assetAmount: BigInt(row.asset_amount),
        type: row.type,
      }))
    },

    pruneBefore(timestamp: number) {
      deleteTrades.run(timestamp)
    },
  }
}

export type Db = ReturnType<typeof openDb>
