import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Db = PostgresJsDatabase<typeof schema>

export function createDb(url: string): { db: Db; close: () => Promise<void> } {
  // R-1: 끝없이 기다리지 않게 연결·유휴·문장 시간 한도를 둔다(잠금 대기도 statement_timeout 안)
  const client = postgres(url, {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    connect_timeout: 10,
    idle_timeout: 60,
    connection: { statement_timeout: 30_000 },
  })
  return { db: drizzle(client, { schema }), close: () => client.end() }
}

// 앱 전역 연결. 개발 모드의 HMR에서 연결이 누적되지 않도록 globalThis에 둔다.
const globalForDb = globalThis as unknown as { __dutyDb?: Db }

export function getDb(): Db {
  if (!globalForDb.__dutyDb) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL이 설정되지 않았습니다')
    globalForDb.__dutyDb = createDb(url).db
  }
  return globalForDb.__dutyDb
}
