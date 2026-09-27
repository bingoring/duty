import { addDays, diffDays, leaveAccount, type LeaveType } from '@duty/domain'
import { and, eq, inArray, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { leaveRequests, monthPlans } from '../db/schema'
import { loadLeaveBalance } from '../schedule/load'
import type { LeaveBalanceSummary } from '../schedule/types'

// Build Spec 2-5 R-LEAVE-5 — 예정 잔여 = 2-3 월말 예정 − 아직 칸에 반영되지 않은 대기·승인 휴가
const FIELD = {
  annual_leave: 'annual',
  special_leave: 'special',
  checkup: 'checkup',
  sick_leave: 'sick',
} as const

export async function projectedLeaveBalance(
  db: Db,
  userId: string,
  today: string,
  opts: { excludeLeaveId?: string } = {},
): Promise<LeaveBalanceSummary> {
  const base = await loadLeaveBalance(db, { viewerId: userId, today })
  const out = { ...base }
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
    const counted = (d: string) => {
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
