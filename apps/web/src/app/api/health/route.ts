// 3-1: 컨테이너 헬스체크·운영 확인용. DB에 닿으면 200, 아니면 503(내용 없음)
import { sql } from 'drizzle-orm'
import { getDb } from '@/server/db/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await getDb().execute(sql`select 1`)
    return new Response(null, { status: 200 })
  } catch (e) {
    console.error('health_db_unreachable', e instanceof Error ? e.message : e)
    return new Response(null, { status: 503 })
  }
}
