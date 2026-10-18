import { and, asc, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema'

// 3-6: 주말 통 OFF 개인 설정
export async function weekendPairPreference(db: Db, userId: string) {
  const [u] = await db
    .select({ wanted: users.weekendPairWanted, rotation: users.rotation })
    .from(users)
    .where(eq(users.id, userId))
  return { wanted: u?.wanted ?? true, rotating: u?.rotation === 'rotating' }
}

// 규칙 설정: 주말 통 OFF를 끈 사람(활성 교대 근무자)
export async function weekendPairOptOuts(db: Db): Promise<string[]> {
  const rows = await db
    .select({ name: users.name })
    .from(users)
    .where(and(eq(users.active, true), eq(users.rotation, 'rotating'), eq(users.weekendPairWanted, false)))
    .orderBy(asc(users.seniorityRank))
  return rows.map((r) => r.name)
}
