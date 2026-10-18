import { ktasStatus } from '@duty/domain'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema'

// 3-8: KTAS 자격 만료 6개월 전(갱신 신청 시기)부터 로그인하면 안내 팝업. 같은 만료일에 3회까지
export const KTAS_REMINDER_MAX = 3

export async function ktasReminder(db: Db, userId: string, today: string): Promise<{ until: string } | null> {
  const [u] = await db.select().from(users).where(eq(users.id, userId))
  if (!u) return null
  const st = ktasStatus(u.kTass, u.ktasCertifiedOn, today, u.ktasRenewedOn)
  if (st.kind !== 'renew') return null
  const count = u.ktasRemindedUntil === st.until ? u.ktasReminderCount : 0
  return count < KTAS_REMINDER_MAX ? { until: st.until } : null
}

// 「확인」을 누르면 1회로 센다
export async function ackKtasReminder(db: Db, userId: string, today: string): Promise<void> {
  const [u] = await db.select().from(users).where(eq(users.id, userId))
  if (!u) return
  const st = ktasStatus(u.kTass, u.ktasCertifiedOn, today, u.ktasRenewedOn)
  if (st.kind !== 'renew') return
  const count = u.ktasRemindedUntil === st.until ? u.ktasReminderCount : 0
  await db
    .update(users)
    .set({ ktasReminderCount: count + 1, ktasRemindedUntil: st.until })
    .where(eq(users.id, userId))
}
