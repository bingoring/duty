import { sql } from 'drizzle-orm'
import { afterAll } from 'vitest'
import { createDb } from '../server/db/client'

// 통합 테스트용 DB 핸들. 파일마다 한 번 만들고 파일이 끝나면 닫는다.
export function setupTestDb() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL이 설정되지 않았습니다')
  const { db, close } = createDb(url)
  afterAll(close)
  return db
}

export async function resetDb(db: ReturnType<typeof setupTestDb>) {
  await db.execute(sql`
    DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;`)
}
