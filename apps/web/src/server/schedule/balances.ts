import { BALANCE_ACCOUNTS, type BalanceAccount } from '@duty/domain'
import { and, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { balanceEntries } from '../db/schema'

// Build Spec 2-3 business-logic-model §2.1. 원장이 SoT이고 현재값은 합계로 파생한다 (1-2 §2)
export type Sums = Record<BalanceAccount, number>

export const emptySums = (): Sums => Object.fromEntries(BALANCE_ACCOUNTS.map((a) => [a, 0])) as Sums

// 0.5 단위 누적의 부동소수 오차 정리
export const round1 = (x: number) => Math.round(x * 10) / 10

export async function ledgerSums(db: Db, userIds: string[], asOf?: Date): Promise<Map<string, Sums>> {
  const out = new Map(userIds.map((id) => [id, emptySums()]))
  if (userIds.length === 0) return out
  const rows = await db
    .select({
      userId: balanceEntries.userId,
      account: balanceEntries.account,
      total: sql<string>`sum(${balanceEntries.delta})`,
    })
    .from(balanceEntries)
    .where(
      and(inArray(balanceEntries.userId, userIds), asOf ? lte(balanceEntries.createdAt, asOf) : undefined),
    )
    .groupBy(balanceEntries.userId, balanceEntries.account)
  for (const r of rows) {
    const s = out.get(r.userId)
    if (s && r.account in s) s[r.account as BalanceAccount] = round1(Number(r.total))
  }
  return out
}

// 올해 보수교육 이수 횟수(월 정산 항목의 ref_year 기준)
export async function eduContInYear(db: Db, userIds: string[], year: number, asOf?: Date) {
  const out = new Map(userIds.map((id) => [id, 0]))
  if (userIds.length === 0) return out
  const rows = await db
    .select({ userId: balanceEntries.userId, total: sql<string>`sum(${balanceEntries.delta})` })
    .from(balanceEntries)
    .where(
      and(
        inArray(balanceEntries.userId, userIds),
        eq(balanceEntries.account, 'edu_cont'),
        eq(balanceEntries.refYear, year),
        asOf ? lte(balanceEntries.createdAt, asOf) : undefined,
      ),
    )
    .groupBy(balanceEntries.userId)
  for (const r of rows) out.set(r.userId, Number(r.total))
  return out
}

// R-SHELL-2: 올해(서울) 생성된 양수 항목 합 = 올해 부여
export async function grantedInYear(db: Db, userId: string, year: number) {
  const from = new Date(`${year}-01-01T00:00:00+09:00`)
  const to = new Date(`${year + 1}-01-01T00:00:00+09:00`)
  const rows = await db
    .select({ account: balanceEntries.account, total: sql<string>`sum(${balanceEntries.delta})` })
    .from(balanceEntries)
    .where(
      and(
        eq(balanceEntries.userId, userId),
        inArray(balanceEntries.account, ['annual_leave', 'special_leave']),
        gt(balanceEntries.delta, '0'),
        gte(balanceEntries.createdAt, from),
        lt(balanceEntries.createdAt, to),
      ),
    )
    .groupBy(balanceEntries.account)
  const get = (a: string) => round1(Number(rows.find((r) => r.account === a)?.total ?? 0))
  return { annual: get('annual_leave'), special: get('special_leave') }
}
