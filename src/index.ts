import { serve } from '@hono/node-server'
import { connectChain } from './chain/client.ts'
import { createMetadataCache } from './chain/metadata.ts'
import { config } from './config.ts'
import { createApp } from './http/server.ts'
import { openDb } from './indexer/db.ts'
import { createIndexer } from './indexer/indexer.ts'
import { createSnapshots } from './tickers/snapshot.ts'

const db = await openDb(config.databaseUrl)
const chain = await connectChain(config.rpcUrls)
const metadata = createMetadataCache(chain)
const indexer = await createIndexer(chain, db, { ...config, onMetadataChanged: metadata.invalidate })
const snapshots = createSnapshots(chain, db, indexer, metadata, config)

indexer.start()
snapshots.start()
serve({ fetch: createApp(snapshots, indexer).fetch, port: config.port }, ({ port }) => console.log(`listening on :${port}`))
