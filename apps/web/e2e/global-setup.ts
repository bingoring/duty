import { existsSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import { createDb } from '../src/server/db/client'
import { runMigrations } from '../src/server/db/migrate'
import { credentials, users } from '../src/server/db/schema'
import { seedDev } from '../src/server/seed/dev'
import { hashPassword } from '../src/server/auth/password'
import { E2E_TEMP_USER } from './fixtures'

export default async function globalSetup() {
  if (existsSync('.env')) process.loadEnvFile('.env')
  const url = process.env.E2E_DATABASE_URL
  if (!url) throw new Error('E2E_DATABASE_URL이 설정되지 않았습니다')
  const target = new URL(url)
  const dbName = target.pathname.slice(1)
  if (!dbName.includes('e2e')) throw new Error('E2E DB 이름에 e2e가 들어 있어야 합니다')

  // DB가 없으면 만든 뒤 스키마를 비우고 다시 채운다
  const admin = new URL(url)
  admin.pathname = '/postgres'
  const root = postgres(admin.toString(), { max: 1, onnotice: () => {} })
  const exists = await root`SELECT 1 FROM pg_database WHERE datname = ${dbName}`
  if (exists.length === 0) await root.unsafe(`CREATE DATABASE "${dbName}"`)
  await root.end()

  const sql = postgres(url, { max: 1, onnotice: () => {} })
  await sql`DROP SCHEMA IF EXISTS public CASCADE`
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`
  await sql`CREATE SCHEMA public`
  await sql.end()
  await runMigrations(url)

  const { db, close } = createDb(url)
  await seedDev(db)
  // 첫 로그인 흐름용: 한 명을 임시 비밀번호 상태로 만든다
  const [u] = await db.select().from(users).where(eq(users.employeeNo, E2E_TEMP_USER.employeeNo))
  await db
    .update(credentials)
    .set({ passwordHash: await hashPassword(E2E_TEMP_USER.tempPassword), mustChangePassword: true })
    .where(eq(credentials.userId, u!.id))
  await close()
}
