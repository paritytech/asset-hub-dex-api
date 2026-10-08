import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Indexer } from '../indexer/indexer.ts'
import type { Snapshots } from '../tickers/snapshot.ts'
import { loadingPage } from './page.ts'

/** /health fails when the snapshot is older than this. */
const STALE_AFTER_SECONDS = 300
/** /health fails when indexing is this many blocks (about 5 minutes) behind. */
const MAX_LAG_BLOCKS = 150

export function createApp(snapshots: Snapshots, indexer: Indexer) {
  const app = new Hono()
  app.use('*', cors())

  app.get('/tickers', (c) => {
    const snapshot = snapshots.current()
    if (!snapshot) return c.json({ error: 'Indexing in progress' }, 503)
    return c.body(snapshot.json, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' })
  })

  app.get('/', (c) => {
    const snapshot = snapshots.current()
    return snapshot ? c.html(snapshot.html) : c.html(loadingPage, 503)
  })

  app.get('/health', (c) => {
    const status = indexer.status()
    const snapshot = snapshots.current()
    const snapshotAgeSeconds = snapshot ? Math.round((Date.now() - snapshot.updatedAt.getTime()) / 1000) : null
    // The snapshot reads the finalized block itself, so this also catches a stalled block subscription.
    const lag = Math.max(status.finalizedBlock, snapshot?.block ?? 0) - status.indexedBlock
    const healthy = snapshotAgeSeconds !== null && snapshotAgeSeconds < STALE_AFTER_SECONDS && lag < MAX_LAG_BLOCKS
    return c.json({ ...status, lag, snapshotBlock: snapshot?.block ?? null, snapshotAgeSeconds }, healthy ? 200 : 503)
  })

  return app
}
