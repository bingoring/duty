import {
  addDays,
  diffDays,
  employedDaysInYear,
  leaveAccount,
  specialLeaveDays,
  type LeaveType,
} from '@duty/domain'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { balanceEntries, leaveRequests, monthPlans, users } from '../db/schema'
import { yearReady } from '../balances/year-start'
import { loadLeaveBalance } from '../schedule/load'
import type { LeaveBalanceSummary } from '../schedule/types'

// Build Spec 2-5 R-LEAVE-5 — 예정 잔여 = 2-3 월말 예정 − 아직 칸에 반영되지 않은 대기·승인 휴가
const FIELD = {
  annual_leave: 'annual',
  special_leave: 'special',
  checkup: 'checkup',
  sick_leave: 'sick',
} as const

// R-1: 그해(year, 기본은 오늘의 해) 몫으로 본다. 연초 처리 전인 해(12월에 신청하는 다음 해 1월 휴가, 12월 마감 전의 1월)는
// 원장에 아직 그해 부여가 없으므로 연초 처리와 같은 부여(특휴 산식·검진 0.5·병가 60)를 가상으로 적용한다.
// 그해 연차는 연초에 관리자가 넣으므로 그때까지 모른다(annualUnknown — 신청 검사를 하지 않는다)
export async function projectedLeaveBalance(
  db: Db,
  userId: string,
  today: string,
  opts: { excludeLeaveId?: string; year?: number } = {},
): Promise<LeaveBalanceSummary & { annualUnknown?: boolean }> {
  const year = opts.year ?? Number(today.slice(0, 4))
  const base = await loadLeaveBalance(db, { viewerId: userId, today })
  const out: LeaveBalanceSummary & { annualUnknown?: boolean } = { ...base }
  const ready = await yearReady(db, year)
  if (!ready) {
    const [u] = await db.select({ hireDate: users.hireDate }).from(users).where(eq(users.id, userId))
    const pre = await db
      .select({ account: balanceEntries.account, sum: sql<string>`sum(${balanceEntries.delta})` })
      .from(balanceEntries)
      .where(and(eq(balanceEntries.userId, userId), eq(balanceEntries.refYear, year)))
      .groupBy(balanceEntries.account)
    const preOf = (a: string) => Number(pre.find((r) => r.account === a)?.sum ?? 0)
    const special = specialLeaveDays(employedDaysInYear(year, u?.hireDate ?? null, null))
    Object.assign(out, {
      annual: preOf('annual_leave'),
      annualGranted: preOf('annual_leave'),
      special: special + preOf('special_leave'),
      specialGranted: special + preOf('special_leave'),
      checkup: 0.5 + preOf('checkup'),
      sick: 60 + preOf('sick_leave'),
      annualUnknown: preOf('annual_leave') === 0,
    })
  }
  const leaves = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.userId, userId),
        inArray(leaveRequests.status, ['DRAFT', 'SUBMITTED', 'APPROVED']),
        opts.excludeLeaveId ? ne(leaveRequests.id, opts.excludeLeaveId) : undefined,
      ),
    )
  const plans = await db
    .select({ year: monthPlans.year, month: monthPlans.month, status: monthPlans.status })
    .from(monthPlans)
  const shown = new Set(
    plans.filter((p) => p.status === 'CONFIRMED' || p.status === 'CLOSED').map((p) => p.year * 12 + p.month),
  )
  const todayKey = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7))
  for (const l of leaves) {
    const account = leaveAccount(l.type as LeaveType)
    if (!account || !(account in FIELD)) continue
    const field = FIELD[account as keyof typeof FIELD]
    // 승인되어 칸에 들어갔고 base가 이미 투영한 달(확정·오늘 달 이하)의 날짜는 빼지 않는다
    // 다른 해의 휴가는 그해 잔여에서 빠지지 않는다(R-1). 연초 처리 전인 해는 칸 반영분도 원장에 없으므로 모두 뺀다
    const counted = (d: string) => {
      if (Number(d.slice(0, 4)) !== year) return true
      if (!ready) return false
      const key = Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7))
      return l.status === 'APPROVED' && shown.has(key) && key <= todayKey
    }
    if (l.type === 'checkup') {
      if (!counted(l.startDate)) out[field] = Math.round((out[field] - 0.5) * 10) / 10
      continue
    }
    for (let i = 0; i <= diffDays(l.startDate, l.endDate); i++) {
      if (!counted(addDays(l.startDate, i))) out[field] -= 1
    }
  }
  return out
}
