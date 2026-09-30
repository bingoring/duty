import {
  formatMD,
  monthDates,
  requestLabel,
  weekdayKo,
  type DutyCode,
  type IsoDate,
  type LeaveType,
  type RequestOption,
  type RequestSpecial,
  type Rotation,
  type ScheduleInput,
} from '@duty/domain'
import { and, eq, gte, isNotNull, lte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { leaveRequests, monthPlans, shiftRequests, users } from '../db/schema'
import { leaveKindLabel } from '../requests/dto'
import { findPlan } from '../requests/plan'
import { loadMonthView } from '../schedule/load'
import type { YearMonth } from '../schedule/month'
import { buildScheduleView, type ScheduleView } from '../schedule/view'
import { closeState } from './close'
import { adjustCheckInput, editBlockReason } from './service'
import { daysLeft, inNegotiation } from '@duty/domain'
import { listSwaps, type SwapCard } from '../swaps/service'

// Build Spec 2-7 domain-entities §4 — S9 근무 조정 화면 원자료 (관리자 1j / 간호사 읽기 전용)
export type AdjustView = {
  year: number
  month: number
  ym: string
  today: IsoDate
  admin: boolean
  plan: {
    id: string
    status: string
    negotiationStart: IsoDate
    negotiationEnd: IsoDate
    requestDeadline: IsoDate
  } | null
  editable: boolean
  blockedReason: string | null
  grid: ScheduleView
  checkInput: ScheduleInput | null
  requests: Record<string, { label: string; comment: string | null }>
  leaveCells: Record<string, { leaveId: string; kindLabel: string; range: string }>
  names: Record<string, { name: string; kTass: boolean; rotation: Rotation }>
  close: { can: boolean; reason: string | null; canReopen: boolean; reopenReason: string | null } | null
  requestDeadlineDay: number
  focus: { date: IsoDate; shift: DutyCode | null } | null
  // 2-8 교환 요청 (간호사 3a, 관리자는 현황 읽기 전용)
  swap: {
    window: { open: boolean; label: string }
    selectable: string[]
    received: SwapCard[]
    sent: SwapCard[]
    pendingByCell: Record<string, string[]>
  } | null
}

const day = (d: IsoDate) => `${formatMD(d)} (${weekdayKo(d)})`

export async function loadAdjustView(
  db: Db,
  args: {
    ym: YearMonth
    viewer: { id: string; role: 'nurse' | 'admin' }
    today: IsoDate
    focus?: { date: string; shift?: string }
  },
): Promise<AdjustView> {
  const { ym, viewer, today } = args
  const admin = viewer.role === 'admin'
  const data = await loadMonthView(db, { ...ym, viewerId: viewer.id, today })
  // 1j: 관리자 시점은 내 줄 강조가 없다(수간호사 첫 행)
  const grid = buildScheduleView(admin ? { ...data, viewerId: '' } : data)
  const plan = (await findPlan(db, ym)) ?? null
  const blockedReason = editBlockReason(plan?.status)
  const editable = admin && blockedReason === null

  const people = await db
    .select({ id: users.id, name: users.name, kTass: users.kTass, rotation: users.rotation })
    .from(users)
  const names = Object.fromEntries(
    people.map((u) => [u.id, { name: u.name, kTass: u.kTass, rotation: u.rotation as Rotation }]),
  )

  let checkInput: ScheduleInput | null = null
  let swap: AdjustView['swap'] = null
  if (plan?.status === 'CONFIRMED') {
    const open = inNegotiation(plan, today)
    const range = `${formatMD(plan.negotiationStart)} – ${formatMD(plan.negotiationEnd)}`
    const list = await listSwaps(db, viewer, plan.id, today)
    swap = {
      window: {
        open,
        label: open ? `협의 기간 ${range} · ${daysLeft(plan, today)}일 남음` : `협의 기간 아님 (${range})`,
      },
      selectable: people.filter((u) => u.rotation === 'rotating').map((u) => u.id),
      ...list,
    }
    // 간호사도 재배정 팝업에서 규칙을 바로 검사한다
    if (!admin && open) checkInput = await adjustCheckInput(db, plan)
  }
  const requests: AdjustView['requests'] = {}
  const leaveCells: AdjustView['leaveCells'] = {}
  if (admin && plan) {
    if (editable) checkInput = await adjustCheckInput(db, plan)
    const days = monthDates(ym.year, ym.month)
    const reqs = await db
      .select()
      .from(shiftRequests)
      .where(
        and(
          eq(shiftRequests.year, ym.year),
          eq(shiftRequests.month, ym.month),
          isNotNull(shiftRequests.submittedAt),
        ),
      )
    for (const r of reqs)
      requests[`${r.userId}|${r.date}`] = {
        label: requestLabel(
          r.options as RequestOption[],
          (r.special ?? undefined) as RequestSpecial | undefined,
        ).replaceAll('/', ' or '),
        comment: r.comment,
      }
    const leaves = await db
      .select()
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.status, 'APPROVED'),
          lte(leaveRequests.startDate, days.at(-1)!),
          gte(leaveRequests.endDate, days[0]!),
        ),
      )
    for (const l of leaves) {
      const range = l.startDate === l.endDate ? day(l.startDate) : `${day(l.startDate)} – ${day(l.endDate)}`
      for (const d of days)
        if (l.startDate <= d && d <= l.endDate)
          leaveCells[`${l.userId}|${d}`] = {
            leaveId: l.id,
            kindLabel: leaveKindLabel(l.type as LeaveType, l.reasonCode),
            range,
          }
    }
  }

  const f = args.focus
  const focus =
    f &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.date) &&
    f.date.startsWith(`${ym.year}-${String(ym.month).padStart(2, '0')}`)
      ? {
          date: f.date,
          shift: f.shift === 'D' || f.shift === 'E' || f.shift === 'N' ? (f.shift as DutyCode) : null,
        }
      : null

  return {
    ...ym,
    ym: `${ym.year}-${String(ym.month).padStart(2, '0')}`,
    today,
    admin,
    plan: plan
      ? {
          id: plan.id,
          status: plan.status,
          negotiationStart: plan.negotiationStart,
          negotiationEnd: plan.negotiationEnd,
          requestDeadline: plan.requestDeadline,
        }
      : null,
    editable,
    blockedReason: admin ? blockedReason : null,
    grid,
    checkInput,
    requests,
    leaveCells,
    names,
    close: admin && plan ? await closeState(db, plan, today) : null,
    requestDeadlineDay: data.rules.params.requestDeadlineDay,
    focus: editable ? focus : null,
    swap,
  }
}

// 2-8: 간호사 기본 달 = 오늘이 협의 기간인 확정된 달, 없으면 이번 달
export async function defaultAdjustYm(db: Db, today: IsoDate): Promise<YearMonth | null> {
  const plans = await db.select().from(monthPlans).where(eq(monthPlans.status, 'CONFIRMED'))
  const p = plans.find((x) => inNegotiation(x, today))
  return p ? { year: p.year, month: p.month } : null
}
