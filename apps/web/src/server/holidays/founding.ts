import { addDays, isEmployed } from '@duty/domain'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import type { DbOrTx } from '../seed/core'
import { balanceEntries, holidays, users } from '../db/schema'
import { todaySeoul } from '../schedule/month'

// R-HOL-FOUND-1: 그해 개원오프 부여를 목표(개원기념일 재직 = 1, 아니면 0)에 맞춘다. 멱등
export async function reconcileFoundingOff(
  db: DbOrTx,
  year: number,
  opts: { userIds?: string[]; createdBy?: string | null } = {},
) {
  const [day] = await db
    .select({ date: holidays.date })
    .from(holidays)
    .where(
      and(
        eq(holidays.kind, 'founding_day'),
        gte(holidays.date, `${year}-01-01`),
        lte(holidays.date, `${year}-12-31`),
      ),
    )
  const people = await db.select().from(users).where(eq(users.active, true))
  for (const u of people) {
    if (opts.userIds && !opts.userIds.includes(u.id)) continue
    const employment = {
      employedFrom: u.hireDate,
      employedUntil: u.deactivatedAt ? addDays(todaySeoul(u.deactivatedAt), -1) : null,
    }
    const target = day && isEmployed(employment, day.date) ? 1 : 0
    const [row] = await db
      .select({ have: sql<string>`coalesce(sum(${balanceEntries.delta}), 0)` })
      .from(balanceEntries)
      .where(
        and(
          eq(balanceEntries.userId, u.id),
          eq(balanceEntries.account, 'founding_off'),
          eq(balanceEntries.reason, 'year_grant'),
          eq(balanceEntries.refYear, year),
        ),
      )
    const delta = target - Number(row?.have ?? 0)
    if (delta !== 0)
      await db.insert(balanceEntries).values({
        userId: u.id,
        account: 'founding_off',
        delta: String(delta),
        reason: 'year_grant',
        refYear: year,
        createdBy: opts.createdBy ?? null,
      })
  }
}
