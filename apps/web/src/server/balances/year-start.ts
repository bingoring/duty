import { employedDaysInYear, specialLeaveDays } from '@duty/domain'
import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { balanceEntries, monthPlans, users } from '../db/schema'
import { reconcileFoundingOff } from '../holidays/founding'
import { lockMonthClosing } from '../plans/lock'
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

// 원장이 그해 값을 담고 있는가: 연초 처리를 했거나, 시스템 첫해(원장이 모두 그해에 생성 — R-YEAR-7)
export async function yearReady(db: Db, year: number): Promise<boolean> {
  if (await alreadyStarted(db, year)) return true
  const older = await db.$count(
    balanceEntries,
    lt(balanceEntries.createdAt, new Date(`${year}-01-01T00:00:00+09:00`)),
  )
  return older === 0
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
  const decConfirmed = async (d: Db) => {
    const [dec] = await d
      .select({ status: monthPlans.status })
      .from(monthPlans)
      .where(and(eq(monthPlans.year, year - 1), eq(monthPlans.month, 12)))
    return dec?.status === 'CONFIRMED'
  }
  if (await decConfirmed(db)) return 'deferred'

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as Db
    // R-YEAR-5: 동시 요청 중 하나만
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`duty-year-start-${year}`}))`)
    if (await alreadyStarted(tdb, year)) return 'done' as const
    // R-1: 12월 마감 취소와 겹치지 않게 마감 순서 잠금 안에서 12월 상태를 다시 본다
    await lockMonthClosing(tx)
    if (await decConfirmed(tdb)) return 'deferred' as const
    const people = await tx.select().from(users).where(eq(users.active, true))
    const ids = people.map((u) => u.id)
    const sums = await ledgerSums(tdb, ids)
    // R-1: 올해 몫으로 미리 들어간 항목(12월에 등록한 올해 개원기념일의 개원오프 등)은 리셋하지 않는다
    const pre = ids.length
      ? await tx
          .select({
            userId: balanceEntries.userId,
            account: balanceEntries.account,
            sum: sql<string>`sum(${balanceEntries.delta})`,
          })
          .from(balanceEntries)
          .where(and(inArray(balanceEntries.userId, ids), eq(balanceEntries.refYear, year)))
          .groupBy(balanceEntries.userId, balanceEntries.account)
      : []
    const preOf = (userId: string, account: string) =>
      Number(pre.find((r) => r.userId === userId && r.account === account)?.sum ?? 0)
    for (const u of people) {
      const s = sums.get(u.id)!
      const leftover = (a: (typeof RESET)[number]) => Math.round((s[a] - preOf(u.id, a)) * 10) / 10
      // R-YEAR-3: 0이어도 표식이 되도록 연차 리셋은 항상 넣는다
      const resets = RESET.filter((a) => a === 'annual_leave' || leftover(a) !== 0).map((a) => ({
        account: a,
        delta: String(-leftover(a)),
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
