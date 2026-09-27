import {
  defaultPlanDates,
  isoOf,
  monthDates,
  nextPlanStatus,
  type MonthPlanStatus,
  type RuleSet,
} from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { monthPlans } from '../db/schema'
import { ensureWard } from '../seed/core'
import { shiftYm, type YearMonth } from '../schedule/month'

export type PlanRow = typeof monthPlans.$inferSelect

// R-REQ-PERIOD-1: 대상 월 M의 신청은 M−1월 1일부터
export function requestOpensOn(ym: YearMonth): string {
  const p = shiftYm(ym, -1)
  return isoOf(p.year, p.month, 1)
}

export async function findPlan(db: Db, ym: YearMonth): Promise<PlanRow | undefined> {
  const [p] = await db
    .select()
    .from(monthPlans)
    .where(and(eq(monthPlans.year, ym.year), eq(monthPlans.month, ym.month)))
  return p
}

// R-REQ-PLAN-1·2: 신청 기간이 열린 달은 계획을 만들고, 마감이 지나면 REQUEST_CLOSED로
export async function ensureRequestPlan(
  db: Db,
  ym: YearMonth,
  today: string,
  rules: RuleSet,
): Promise<PlanRow | null> {
  const existing = await findPlan(db, ym)
  if (existing) {
    if (existing.status === 'REQUESTING' && today > existing.requestDeadline) {
      const status = nextPlanStatus('REQUESTING', 'CLOSE_REQUESTS', { today, ...ym })
      const [p] = await db
        .update(monthPlans)
        .set({ status })
        .where(eq(monthPlans.id, existing.id))
        .returning()
      return p!
    }
    return existing
  }
  if (today < requestOpensOn(ym) || today > monthDates(ym.year, ym.month).at(-1)!) return null
  const dates = defaultPlanDates(ym.year, ym.month, rules.params)
  const status: MonthPlanStatus = today <= dates.requestDeadline ? 'REQUESTING' : 'REQUEST_CLOSED'
  const [p] = await db
    .insert(monthPlans)
    .values({ wardId: await ensureWard(db), ...ym, status, ...dates })
    .onConflictDoNothing()
    .returning()
  return p ?? (await findPlan(db, ym))!
}

export const PRE_GENERATION: MonthPlanStatus[] = ['REQUESTING', 'REQUEST_CLOSED']
