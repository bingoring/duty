import './load-env'
import postgres from 'postgres'
import { runMigrations } from '../server/db/migrate'

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL이 설정되지 않았습니다')
  if (!/test/.test(new URL(url).pathname))
    throw new Error('TEST_DATABASE_URL의 DB 이름에 test가 들어 있어야 합니다')
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  await sql`DROP SCHEMA IF EXISTS public CASCADE`
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`
  await sql`CREATE SCHEMA public`
  await sql.end()
  await runMigrations(url)
}
