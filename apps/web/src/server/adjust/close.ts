import { monthDates, nextPlanStatus, reverseEntries, type BalanceAccount } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { balanceEntries, monthPlans, monthSettlements } from '../db/schema'
import { planSettlements } from '../schedule/load'
import { shiftYm } from '../schedule/month'
import { lockMonthClosing, lockPlan } from '../plans/lock'

const RESET_ACCOUNTS = new Set<string>([
  'annual_leave',
  'special_leave',
  'founding_off',
  'checkup',
  'sick_leave',
])

// Build Spec 2-7 business-rules §3 (R-CLOSE-1~5), business-logic-model §4
type Actor = { id: string; role: 'nurse' | 'admin' }
type PlanRow = typeof monthPlans.$inferSelect
type Result = { ok: true } | { ok: false; message: string }

async function planAt(db: Db, ym: { year: number; month: number }) {
  const [p] = await db
    .select()
    .from(monthPlans)
    .where(and(eq(monthPlans.year, ym.year), eq(monthPlans.month, ym.month)))
  return p
}

export async function closeState(
  db: Db,
  plan: PlanRow,
  today: string,
): Promise<{ can: boolean; reason: string | null; canReopen: boolean; reopenReason: string | null }> {
  const prev = await planAt(db, shiftYm(plan, -1))
  const next = await planAt(db, shiftYm(plan, 1))
  let reason: string | null = null
  if (plan.status !== 'CONFIRMED')
    reason = plan.status === 'CLOSED' ? '이미 마감한 달입니다.' : '확정된 달만 마감합니다.'
  else if (today <= monthDates(plan.year, plan.month).at(-1)!)
    reason = `${plan.month}월이 끝난 뒤 마감할 수 있습니다.`
  else if (prev?.status === 'CONFIRMED') reason = `${prev.month}월을 먼저 마감하세요.`
  let reopenReason: string | null = null
  if (plan.status !== 'CLOSED') reopenReason = '마감한 달이 아닙니다.'
  else if (next?.status === 'CLOSED') reopenReason = `${next.month}월을 먼저 마감 취소하세요.`
  else if (plan.month === 12 && (await yearStarted(db, plan.year + 1)))
    reopenReason = '연초 처리 뒤에는 12월 마감을 취소할 수 없습니다.'
  return { can: reason === null, reason, canReopen: reopenReason === null, reopenReason }
}

async function yearStarted(db: Db, year: number) {
  const rows = await db
    .select({ id: balanceEntries.id })
    .from(balanceEntries)
    .where(and(eq(balanceEntries.reason, 'year_reset'), eq(balanceEntries.refYear, year)))
    .limit(1)
  return rows.length > 0
}

// R-CLOSE-2: 확인 창 표
export async function previewClose(db: Db, plan: PlanRow) {
  return (await planSettlements(db, plan)).map(({ userId, name, result: r }) => ({
    userId,
    name,
    actualOff: r.actualOff,
    baselineOff: r.baselineOff,
    offCarryBefore: r.offCarryBefore,
    offCarryAfter: r.offCarryAfter,
    nightCount: r.nightCount,
    sleepingOff: r.sleepingOff,
    nightBankBefore: r.nightBankBefore,
    nightBankAfter: r.nightBankAfter,
  }))
}

export async function closeMonth(db: Db, actor: Actor, planId: string, today: string): Promise<Result> {
  if (actor.role !== 'admin') return { ok: false, message: '권한이 없습니다.' }
  // R-1: 마감 순서 잠금 → 계획 행 잠금 뒤 앞뒤 달 상태·정산을 계산한다(편집·교환·휴가 승인·다른 마감과 직렬화)
  return db.transaction(async (tx) => {
    const tdb = tx as unknown as Db
    await lockMonthClosing(tx)
    const plan = await lockPlan(tx, planId)
    if (!plan) return { ok: false as const, message: '계획을 찾을 수 없습니다.' }
    const state = await closeState(tdb, plan, today)
    if (!state.can) return { ok: false as const, message: state.reason! }
    const status = nextPlanStatus('CONFIRMED', 'CLOSE', { today, year: plan.year, month: plan.month })
    // R-1: 연초 처리가 이미 끝난 뒤 12월을 마감하면, 리셋된 휴가 계정(연차·특휴·개원·검진·병가)에서 12월 사용분을 빼지 않는다
    const afterYearStart = plan.month === 12 && (await yearStarted(tdb, plan.year + 1))
    const results = (await planSettlements(tdb, plan)).map((x) =>
      afterYearStart
        ? {
            ...x,
            result: { ...x.result, entries: x.result.entries.filter((e) => !RESET_ACCOUNTS.has(e.account)) },
          }
        : x,
    )
    if (results.length)
      await tx.insert(monthSettlements).values(
        results.map(({ userId, result: r }) => ({
          monthPlanId: plan.id,
          userId,
          baselineOff: r.baselineOff,
          actualOff: r.actualOff,
          sleepingOff: r.sleepingOff,
          nightCount: r.nightCount,
          offCarryBefore: String(r.offCarryBefore),
          offCarryAfter: String(r.offCarryAfter),
          nightBankBefore: r.nightBankBefore,
          nightBankAfter: r.nightBankAfter,
          weekendPairAchieved: r.weekendPairAchieved,
          specialUsed: String(r.specialUsed),
          foundingUsed: String(r.foundingUsed),
          checkupUsed: String(r.checkupUsed),
          eduCont: r.eduCont,
        })),
      )
    const entries = results.flatMap(({ userId, result: r }) =>
      r.entries.map((e) => ({
        userId,
        account: e.account,
        delta: String(e.delta),
        reason: 'month_settlement',
        refYear: plan.year,
        refMonth: plan.month,
        refId: plan.id,
        createdBy: actor.id,
      })),
    )
    if (entries.length) await tx.insert(balanceEntries).values(entries)
    await tx
      .update(monthPlans)
      .set({ status, closedBy: actor.id, closedAt: new Date() })
      .where(eq(monthPlans.id, plan.id))
    return { ok: true as const }
  })
}

export async function reopenMonth(db: Db, actor: Actor, planId: string): Promise<Result> {
  if (actor.role !== 'admin') return { ok: false, message: '권한이 없습니다.' }
  // R-1: 마감 순서 잠금 안에서 뒷 달 상태·연초 처리 여부를 다시 본다
  return db.transaction(async (tx) => {
    await lockMonthClosing(tx)
    const plan = await lockPlan(tx, planId)
    if (!plan) return { ok: false as const, message: '계획을 찾을 수 없습니다.' }
    const state = await closeState(tx as unknown as Db, plan, '9999-12-31')
    if (!state.canReopen) return { ok: false as const, message: state.reopenReason! }
    const settled = await tx
      .select()
      .from(balanceEntries)
      .where(and(eq(balanceEntries.refId, plan.id), eq(balanceEntries.reason, 'month_settlement')))
    // 이미 한 번 취소·재마감한 달이면 그 뒤의 마감 항목만 남아 있으므로, 이전 취소분과 짝지어 남은 순증감을 뒤집는다
    const reversedBefore = await tx
      .select()
      .from(balanceEntries)
      .where(and(eq(balanceEntries.refId, plan.id), eq(balanceEntries.reason, 'settlement_reversed')))
    const net = new Map<string, number>()
    for (const e of [...settled, ...reversedBefore]) {
      const k = `${e.userId}|${e.account}`
      net.set(k, Math.round(((net.get(k) ?? 0) + Number(e.delta)) * 10) / 10)
    }
    const byUser = new Map<string, { account: BalanceAccount; delta: number }[]>()
    for (const [k, delta] of net) {
      if (delta === 0) continue
      const [userId, account] = k.split('|') as [string, BalanceAccount]
      byUser.set(userId, [...(byUser.get(userId) ?? []), { account, delta }])
    }
    const rows = [...byUser].flatMap(([userId, list]) =>
      reverseEntries(list).map((e) => ({
        userId,
        account: e.account,
        delta: String(e.delta),
        reason: 'settlement_reversed',
        refYear: plan.year,
        refMonth: plan.month,
        refId: plan.id,
        createdBy: actor.id,
      })),
    )
    if (rows.length) await tx.insert(balanceEntries).values(rows)
    await tx.delete(monthSettlements).where(eq(monthSettlements.monthPlanId, plan.id))
    await tx
      .update(monthPlans)
      .set({ status: 'CONFIRMED', closedBy: null, closedAt: null })
      .where(eq(monthPlans.id, plan.id))
    return { ok: true as const }
  })
}
