import { employedDaysInYear, specialLeaveDays } from '@duty/domain'
import { and, eq, lt, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { balanceEntries, monthPlans, users } from '../db/schema'
import { reconcileFoundingOff } from '../holidays/founding'
import { ledgerSums } from '../schedule/balances'

// Build Spec 2-4 business-rules §1.4 — 연초 잔여치 자동 처리. 인증된 요청마다 호출되므로 빠르게 끝나야 한다
export type YearStartResult = 'done' | 'deferred' | 'first-year' | 'started'

const RESET = ['annual_leave', 'special_leave', 'founding_off', 'checkup', 'sick_leave'] as const

async function alreadyStarted(db: Db, year: number) {
  return (
    (await db.$count(
      balanceEntries,
      and(eq(balanceEntries.reason, 'year_reset'), eq(balanceEntries.refYear, year)),
    )) > 0
  )
}

export async function ensureYearStart(db: Db, today: string): Promise<YearStartResult> {
  const year = Number(today.slice(0, 4))
  if (await alreadyStarted(db, year)) return 'done'
  // R-YEAR-7: 시스템 첫해 — 원장이 모두 올해 생성됐으면 초기 입력이 이미 올해 값이다
  const older = await db.$count(
    balanceEntries,
    lt(balanceEntries.createdAt, new Date(`${year}-01-01T00:00:00+09:00`)),
  )
  if (older === 0) return 'first-year'
  // R-YEAR-2: 전년 12월 사용분이 원장에 들어간 뒤에만
  const [dec] = await db
    .select({ status: monthPlans.status })
    .from(monthPlans)
    .where(and(eq(monthPlans.year, year - 1), eq(monthPlans.month, 12)))
  if (dec?.status === 'CONFIRMED') return 'deferred'

  return db.transaction(async (tx) => {
    // R-YEAR-5: 동시 요청 중 하나만
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`duty-year-start-${year}`}))`)
    if (await alreadyStarted(tx as unknown as Db, year)) return 'done' as const
    const people = await tx.select().from(users).where(eq(users.active, true))
    const sums = await ledgerSums(
      tx as unknown as Db,
      people.map((u) => u.id),
    )
    for (const u of people) {
      const s = sums.get(u.id)!
      // R-YEAR-3: 0이어도 표식이 되도록 연차 리셋은 항상 넣는다
      const resets = RESET.filter((a) => a === 'annual_leave' || s[a] !== 0).map((a) => ({
        account: a,
        delta: String(-s[a]),
        reason: 'year_reset',
      }))
      const grants = [
        {
          account: 'special_leave',
          delta: String(specialLeaveDays(employedDaysInYear(year, u.hireDate, null))),
          reason: 'year_grant',
        },
        { account: 'checkup', delta: '0.5', reason: 'year_grant' },
        { account: 'sick_leave', delta: '60', reason: 'year_grant' },
      ]
      await tx
        .insert(balanceEntries)
        .values([...resets, ...grants].map((e) => ({ ...e, userId: u.id, refYear: year })))
    }
    await reconcileFoundingOff(tx, year)
    return 'started' as const
  })
}
