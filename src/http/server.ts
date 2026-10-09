import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Indexer } from '../indexer/indexer.ts'
import { isFresh, type Snapshots } from '../tickers/snapshot.ts'
import { unavailablePage } from './page.ts'

export function createApp(snapshots: Snapshots, indexer: Indexer) {
  const app = new Hono()
  app.use('*', cors())

  /** The current snapshot, if it is recent enough to serve. Stale data is never served. */
  function fresh() {
    const snapshot = snapshots.current()
    return snapshot && isFresh(snapshot) ? snapshot : undefined
  }

  app.get('/tickers', (c) => {
    const snapshot = fresh()
    if (!snapshot) return c.json({ error: 'No up-to-date data, try again in a few minutes' }, 503)
    return c.body(snapshot.json, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' })
  })

  app.get('/', (c) => {
    const snapshot = fresh()
    return snapshot ? c.html(snapshot.html) : c.html(unavailablePage, 503)
  })

  app.get('/health', (c) => {
    const snapshot = snapshots.current()
    return c.json(
      {
        ...indexer.status(),
        snapshotBlock: snapshot?.block ?? null,
        snapshotLag: snapshot ? snapshot.head - snapshot.block : null,
        snapshotAgeSeconds: snapshot ? Math.round((Date.now() - snapshot.updatedAt.getTime()) / 1000) : null,
      },
      fresh() ? 200 : 503,
    )
  })

  return app
}
