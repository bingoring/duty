import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Db = PostgresJsDatabase<typeof schema>

// R-1: 끝없이 기다리지 않게 연결·유휴·문장 시간 한도를 둔다(잠금 대기도 statement_timeout 안).
// 3-13: Cloud Run은 Cloud SQL에 유닉스 소켓으로 붙는다(DB_SOCKET_HOST). postgres.js는 URL의 host 쿼리로는 소켓을 쓰지 않는다
export function pgOptions(env: Record<string, string | undefined>) {
  return {
    max: Number(env.DB_POOL_MAX ?? 10),
    connect_timeout: 10,
    idle_timeout: 60,
    connection: { statement_timeout: 30_000 },
    ...(env.DB_SOCKET_HOST ? { host: env.DB_SOCKET_HOST } : {}),
  }
}

export function createDb(url: string): { db: Db; close: () => Promise<void> } {
  const client = postgres(url, pgOptions(process.env))
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
