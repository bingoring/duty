import { migrate } from 'drizzle-orm/postgres-js/migrator'
import path from 'node:path'
import { createDb } from './client'

export const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations')

export async function runMigrations(url: string): Promise<void> {
  const { db, close } = createDb(url)
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  } finally {
    await close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL이 설정되지 않았습니다')
  await runMigrations(url)
  console.log('마이그레이션 완료')
}
