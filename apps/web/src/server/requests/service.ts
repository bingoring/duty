import {
  FAMILY_LEAVE_DAYS,
  OFFICIAL_LEAVE_REASONS,
  ShiftRequestInputSchema,
  checkSchedule,
  formatMD,
  formatViolation,
  leaveAccount,
  leaveDates,
  leaveDays,
  leaveEnd,
  leaveToCell,
  replacementCandidates,
  type GridCell,
  type LeaveType,
  isRedDay,
  monthDates,
  redDaySet,
  canNurseEditRequests,
  type HolidayKind,
  type RequestOption,
  type RequestSpecial,
} from '@duty/domain'
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  balanceEntries,
  cellEditLogs,
  holidays,
  leaveRequests,
  scheduleCells,
  shiftRequests,
  users,
} from '../db/schema'
import { latestRuleSet } from '../rules/service'
import type { YearMonth } from '../schedule/month'
import { fillProfiles } from '../generate/input'
import { INVALID_BY_ADMIN, invalidateSwapsForCells } from '../swaps/invalidate'
import { buildScheduleInput } from '../schedule/input'
import { lockPlansFor, Rejected, rejectable } from '../plans/lock'
import { projectedLeaveBalance } from './balance'
import { PRE_GENERATION, findPlan, type PlanRow } from './plan'

// Build Spec 2-5 business-rules §1 — 근무 신청·휴가
export type Actor = { id: string; role: 'nurse' | 'admin' }
export type Result = { ok: true } | { ok: false; message: string }

const ymOfDate = (d: string): YearMonth => ({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) })
const deny = (message: string) => ({ ok: false as const, message })

// R-REQ-EDIT-1·2: 근무 신청을 바꿀 수 있는 계획인지
export function canEditShiftRequests(plan: PlanRow | undefined, actor: Actor, today: string): boolean {
  if (!plan) return false
  // 관리자는 확정 전(생성안을 보는 DRAFTING 포함)까지 고친다. 바뀐 입력은 옛 생성안의 확정을 막는다(2-6 R-GEN-5)
  if (actor.role === 'admin') return [...PRE_GENERATION, 'DRAFTING'].includes(plan.status)
  return canNurseEditRequests(plan.status as 'REQUESTING', plan.requestDeadline, today)
}

async function guardShift(db: Db, actor: Actor, userId: string, date: string, today: string) {
  if (actor.role !== 'admin' && actor.id !== userId) return deny('다른 사람의 신청은 바꿀 수 없습니다.')
  const plan = await findPlan(db, ymOfDate(date))
  if (!canEditShiftRequests(plan, actor, today)) return deny('신청 기간이 아닙니다.')
  return null
}

const ACTIVE_LEAVE = ['DRAFT', 'SUBMITTED', 'APPROVED']

export async function saveShiftRequest(
  outer: Db,
  actor: Actor,
  input: {
    userId: string
    date: string
    options: RequestOption[]
    special?: RequestSpecial
    comment?: string
  },
  today: string,
): Promise<Result> {
  // R-1: 그 달 계획 행을 잠그고 검사·쓰기를 한다(확정·다른 저장과 직렬화, 더블 클릭 중복 방지)
  return outer.transaction(async (tx) => {
    const db = tx as unknown as Db
    await lockPlansFor(tx, [input.date])
    const denied = await guardShift(db, actor, input.userId, input.date, today)
    if (denied) return denied
    const parsed = ShiftRequestInputSchema.safeParse(input)
    if (!parsed.success) return deny(parsed.error.issues[0]?.message ?? '신청 내용을 확인해 주세요.')
    // 2-11 R-HEAD-2: 수간호사는 OFF 또는 D 하나만(평일 기본 S)
    const [target] = await db
      .select({ rotation: users.rotation })
      .from(users)
      .where(eq(users.id, input.userId))
    if (
      target?.rotation === 'fixed_weekday' &&
      !input.special &&
      !(input.options.length === 1 && (input.options[0] === 'OFF' || input.options[0] === 'D'))
    )
      return deny('수간호사는 OFF 또는 D 하나만 신청할 수 있습니다.')
    const leaveSameDay = await db.$count(
      leaveRequests,
      and(
        eq(leaveRequests.userId, input.userId),
        inArray(leaveRequests.status, ACTIVE_LEAVE),
        lte(leaveRequests.startDate, input.date),
        gte(leaveRequests.endDate, input.date),
      ),
    )
    if (leaveSameDay > 0) return deny('이 날은 휴가 신청이 있습니다.')
    if (input.special === 'EDU_CONT' || input.special === 'EDU_UNION') {
      const edu = await checkEdu(db, input.userId, input.date, input.special)
      if (edu) return deny(edu)
    }
    const values = {
      userId: input.userId,
      year: Number(input.date.slice(0, 4)),
      month: Number(input.date.slice(5, 7)),
      date: input.date,
      options: input.special ? [] : input.options,
      special: input.special ?? null,
      comment: input.comment?.trim() || null,
      // R-REQ-DRAFT-1·2: 간호사 저장은 임시(수정해도 다시 임시), 관리자 편집은 곧바로 제출
      submittedAt: actor.role === 'admin' ? new Date() : null,
      updatedAt: new Date(),
    }
    await db
      .insert(shiftRequests)
      .values(values)
      .onConflictDoUpdate({ target: [shiftRequests.userId, shiftRequests.date], set: values })
    return { ok: true }
  })
}

// R-REQ-SHIFT-3: 노조교육은 노조원·평일, 연 한도는 올해 이수 + 올해 신청
async function checkEdu(
  db: Db,
  userId: string,
  date: string,
  special: 'EDU_CONT' | 'EDU_UNION',
): Promise<string | null> {
  const year = Number(date.slice(0, 4))
  const rules = await latestRuleSet(db)
  const [u] = await db.select().from(users).where(eq(users.id, userId))
  const union = special === 'EDU_UNION'
  if (union && !u?.unionMember) return '노조교육은 노조원만 신청할 수 있습니다.'
  if (union) {
    const hol = await db.select({ date: holidays.date, kind: holidays.kind }).from(holidays)
    if (isRedDay(date, redDaySet(hol.map((h) => ({ date: h.date, kind: h.kind as HolidayKind })))))
      return '노조교육은 평일에만 신청할 수 있습니다.'
  }
  const account = union ? 'edu_union' : 'edu_cont'
  const [done] = await db
    .select({ n: sql<string>`coalesce(sum(${balanceEntries.delta}), 0)` })
    .from(balanceEntries)
    .where(
      and(
        eq(balanceEntries.userId, userId),
        eq(balanceEntries.account, account),
        eq(balanceEntries.refYear, year),
      ),
    )
  const requested = await db.$count(
    shiftRequests,
    and(
      eq(shiftRequests.userId, userId),
      eq(shiftRequests.special, special),
      eq(shiftRequests.year, year),
      ne(shiftRequests.date, date),
    ),
  )
  const limit = union ? rules.params.eduUnionPerYear : rules.params.eduContPerYear
  if (Number(done?.n ?? 0) + requested + 1 > limit)
    return `${union ? '노조교육' : '보수교육'}은 연 ${limit}회까지입니다.`
  return null
}

export async function deleteShiftRequest(
  outer: Db,
  actor: Actor,
  input: { userId: string; date: string },
  today: string,
): Promise<Result> {
  // R-1: 그 달 계획 행을 잠그고 검사·쓰기를 한다(확정·다른 저장과 직렬화, 더블 클릭 중복 방지)
  return outer.transaction(async (tx) => {
    const db = tx as unknown as Db
    await lockPlansFor(tx, [input.date])
    const denied = await guardShift(db, actor, input.userId, input.date, today)
    if (denied) return denied
    await db
      .delete(shiftRequests)
      .where(and(eq(shiftRequests.userId, input.userId), eq(shiftRequests.date, input.date)))
    return { ok: true }
  })
}

// R-REQ-DRAFT-1: 그달 내 임시 신청을 모두 제출
export async function submitRequests(
  outer: Db,
  actor: Actor,
  ym: YearMonth,
  today: string,
): Promise<{ ok: true; submitted: number } | { ok: false; message: string }> {
  // R-1: 그 달 계획 행을 잠그고 검사·쓰기를 한다(확정·다른 저장과 직렬화, 더블 클릭 중복 방지)
  return outer.transaction(async (tx) => {
    const db = tx as unknown as Db
    await lockPlansFor(tx, [`${ym.year}-${String(ym.month).padStart(2, '0')}-01`])
    const plan = await findPlan(db, ym)
    const shiftOpen = canEditShiftRequests(plan, actor, today)
    const leaveOpen = shiftOpen || plan?.status === 'CONFIRMED'
    if (!leaveOpen) return deny('신청 기간이 아닙니다.')
    const days = monthDates(ym.year, ym.month)
    let submitted = 0
    const now = new Date()
    if (shiftOpen) {
      const rows = await db
        .update(shiftRequests)
        .set({ submittedAt: now })
        .where(
          and(
            eq(shiftRequests.userId, actor.id),
            eq(shiftRequests.year, ym.year),
            eq(shiftRequests.month, ym.month),
            isNull(shiftRequests.submittedAt),
          ),
        )
        .returning({ id: shiftRequests.id })
      submitted += rows.length
    }
    const leaves = await db
      .update(leaveRequests)
      .set({ status: 'SUBMITTED' })
      .where(
        and(
          eq(leaveRequests.userId, actor.id),
          eq(leaveRequests.status, 'DRAFT'),
          gte(leaveRequests.startDate, days[0]!),
          lte(leaveRequests.startDate, days.at(-1)!),
        ),
      )
      .returning({ id: leaveRequests.id })
    return { ok: true, submitted: submitted + leaves.length }
  })
}

// ───────── 휴가 (Build Spec 2-5 business-rules §1.3) ─────────

export type LeaveInput = {
  userId: string
  type: LeaveType
  reasonCode?: string
  startDate: string
  endDate?: string
  comment?: string
}

const BALANCE_LABEL = {
  annual_leave: ['연차', 'annual'],
  special_leave: ['특별휴가', 'special'],
  checkup: ['검진 반차', 'checkup'],
  sick_leave: ['병가', 'sick'],
  founding_off: ['개원기념 OFF', 'founding'],
} as const

// R-LEAVE-8: 신청 중인 달(간호사는 기간 안) 또는 확정된 달
function canRequestLeave(plan: PlanRow | undefined, actor: Actor, today: string): boolean {
  if (!plan) return false
  if (plan.status === 'CONFIRMED') return true
  return canEditShiftRequests(plan, actor, today)
}

export async function saveLeave(
  outer: Db,
  actor: Actor,
  input: LeaveInput,
  today: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  // R-1: 그 달 계획 행을 잠그고 검사·쓰기를 한다(확정·다른 저장과 직렬화, 더블 클릭 중복 방지)
  return outer.transaction(async (tx) => {
    const db = tx as unknown as Db
    await lockPlansFor(tx, [input.startDate, input.endDate ?? input.startDate])
    if (actor.role !== 'admin' && actor.id !== input.userId)
      return deny('다른 사람의 신청은 바꿀 수 없습니다.')
    const plan = await findPlan(db, ymOfDate(input.startDate))
    if (!canRequestLeave(plan, actor, today)) return deny('휴가를 신청할 수 있는 달이 아닙니다.')
    if (input.type === 'family' && !(input.reasonCode && input.reasonCode in FAMILY_LEAVE_DAYS))
      return deny('사유를 선택해 주세요.')
    if (input.type === 'official' && !(input.reasonCode && input.reasonCode in OFFICIAL_LEAVE_REASONS))
      return deny('사유를 선택해 주세요.')
    const endDate = leaveEnd(input.type, input.startDate, input.reasonCode, input.endDate)
    if (!endDate) return deny('종료일을 확인해 주세요.')
    const days = leaveDays(input.type, input.startDate, endDate, input.reasonCode)

    // R-LEAVE-4: 겹침
    const overlapLeave = await db.$count(
      leaveRequests,
      and(
        eq(leaveRequests.userId, input.userId),
        inArray(leaveRequests.status, ACTIVE_LEAVE),
        lte(leaveRequests.startDate, endDate),
        gte(leaveRequests.endDate, input.startDate),
      ),
    )
    if (overlapLeave > 0) return deny('기간 안에 다른 휴가가 있습니다.')
    const overlapShift = await db.$count(
      shiftRequests,
      and(
        eq(shiftRequests.userId, input.userId),
        gte(shiftRequests.date, input.startDate),
        lte(shiftRequests.date, endDate),
      ),
    )
    if (overlapShift > 0) return deny('기간 안에 근무 신청이 있습니다.')

    // R-LEAVE-5: 예정 잔여
    const account = leaveAccount(input.type)
    if (account && account in BALANCE_LABEL) {
      const [label, field] = BALANCE_LABEL[account as keyof typeof BALANCE_LABEL]
      const bal = await projectedLeaveBalance(db, input.userId, today, {
        year: Number(input.startDate.slice(0, 4)),
      })
      const available = bal[field]
      if (!(field === 'annual' && bal.annualUnknown) && days > available)
        return deny(`${label} 잔여를 넘습니다 (신청 ${days}일 / 잔여 ${Math.max(0, available)}일).`)
    }
    const [row] = await db
      .insert(leaveRequests)
      .values({
        userId: input.userId,
        type: input.type,
        reasonCode: input.reasonCode ?? null,
        startDate: input.startDate,
        endDate,
        days: String(days),
        status: actor.role === 'admin' ? 'SUBMITTED' : 'DRAFT',
        comment: input.comment?.trim() || null,
      })
      .returning({ id: leaveRequests.id })
    return { ok: true, id: row!.id }
  })
}

async function planStatusOf(db: Db, date: string) {
  return (await findPlan(db, ymOfDate(date)))?.status
}

export async function cancelLeave(db: Db, actor: Actor, id: string, today: string): Promise<Result> {
  const [l] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id))
  if (!l) return deny('휴가를 찾을 수 없습니다.')
  if (actor.role !== 'admin') {
    if (l.userId !== actor.id) return deny('다른 사람의 신청은 바꿀 수 없습니다.')
    if (l.status === 'DRAFT') {
      await db.delete(leaveRequests).where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, 'DRAFT')))
      return { ok: true }
    }
    if (l.status !== 'SUBMITTED') return deny('취소할 수 없는 휴가입니다.')
    const plan = await findPlan(db, ymOfDate(l.startDate))
    if (!canRequestLeave(plan, actor, today)) return deny('취소할 수 있는 기간이 아닙니다.')
  } else if (l.status === 'APPROVED') {
    const st = await planStatusOf(db, l.startDate)
    if (st === 'CONFIRMED' || st === 'CLOSED')
      return deny('확정된 달의 승인된 휴가는 근무 조정에서 취소합니다.')
  } else if (!['DRAFT', 'SUBMITTED'].includes(l.status)) return deny('취소할 수 없는 휴가입니다.')
  // R-1: 본 상태 그대로일 때만(그사이 승인되면 칸이 휴가로 남은 채 취소로 덮이지 않게)
  const [done] = await db
    .update(leaveRequests)
    .set({ status: 'CANCELLED' })
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, l.status)))
    .returning({ id: leaveRequests.id })
  if (!done) return deny('그사이 처리된 휴가입니다. 새로 불러와 주세요.')
  return { ok: true }
}

type LeaveRow = typeof leaveRequests.$inferSelect

// R-APPROVE-2: 휴가 종류 → 칸
function applyLeave(cell: GridCell, type: LeaveType): GridCell {
  const f = leaveToCell(type)
  if (!f) return { ...cell, checkupHalf: true }
  return { userId: cell.userId, date: cell.date, checkupHalf: cell.checkupHalf, ...f }
}

export async function decideLeave(
  db: Db,
  actor: Actor,
  id: string,
  d: { decision: 'approve' | 'reject'; reason?: string },
): Promise<Result> {
  if (actor.role !== 'admin') return deny('권한이 없습니다.')
  const [l] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id))
  if (!l || l.status !== 'SUBMITTED') return deny('제출된 휴가만 처리할 수 있습니다.')
  // R-1: 상태 조건부 갱신으로 두 번 승인·승인과 반려 겹침을 막는다
  if (d.decision === 'reject') {
    if (!d.reason?.trim()) return deny('반려 사유를 입력해 주세요.')
    const [done] = await db
      .update(leaveRequests)
      .set({ status: 'REJECTED', rejectReason: d.reason.trim(), decidedBy: actor.id, decidedAt: new Date() })
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, 'SUBMITTED')))
      .returning({ id: leaveRequests.id })
    return done ? { ok: true } : deny('제출된 휴가만 처리할 수 있습니다.')
  }
  const dates = leaveDates(l.startDate, l.endDate)
  // R-1: 걸친 달의 계획 행을 잠근 뒤 마감 여부·칸을 다시 본다
  return rejectable(() =>
    db.transaction(async (tx) => {
      const plans = await lockPlansFor(tx, dates)
      const statusOf = (date: string) =>
        plans.find((p) => p.year === Number(date.slice(0, 4)) && p.month === Number(date.slice(5, 7)))
      if (dates.some((x) => statusOf(x)?.status === 'CLOSED'))
        throw new Rejected('마감된 달이 포함된 휴가입니다.')
      const now = new Date()
      const [done] = await tx
        .update(leaveRequests)
        .set({ status: 'APPROVED', decidedBy: actor.id, decidedAt: now })
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, 'SUBMITTED')))
        .returning({ id: leaveRequests.id })
      if (!done) throw new Rejected('제출된 휴가만 처리할 수 있습니다.')
      for (const date of dates) {
        const plan = statusOf(date)
        if (plan?.status !== 'CONFIRMED') continue
        const [c] = await tx
          .select()
          .from(scheduleCells)
          .where(
            and(
              eq(scheduleCells.monthPlanId, plan.id),
              eq(scheduleCells.userId, l.userId),
              eq(scheduleCells.date, date),
            ),
          )
        if (!c) continue
        const before = {
          code: c.code,
          offKind: c.offKind,
          leaveKind: c.leaveKind,
          checkupHalf: c.checkupHalf,
        }
        const next = applyLeave(
          {
            userId: c.userId,
            date,
            code: c.code as GridCell['code'],
            checkupHalf: c.checkupHalf,
            ...(c.offKind ? { offKind: c.offKind as GridCell['offKind'] } : {}),
            ...(c.leaveKind ? { leaveKind: c.leaveKind as GridCell['leaveKind'] } : {}),
          },
          l.type as LeaveType,
        )
        const after = {
          code: next.code,
          offKind: next.offKind ?? null,
          leaveKind: next.leaveKind ?? null,
          checkupHalf: next.checkupHalf,
        }
        // 2-11 R-MARK-2: 승인 휴가로 바뀐 칸은 관리자 개입이 아니라 신청 반영(빨간 실선)
        await tx
          .update(scheduleCells)
          .set({ ...after, source: 'requested', editedBy: actor.id, editedAt: now })
          .where(
            and(
              eq(scheduleCells.monthPlanId, plan.id),
              eq(scheduleCells.userId, l.userId),
              eq(scheduleCells.date, date),
            ),
          )
        await tx.insert(cellEditLogs).values({
          monthPlanId: plan.id,
          userId: l.userId,
          date,
          before,
          after,
          editedBy: actor.id,
          editedAt: now,
          reason: 'leave_approved',
        })
        await invalidateSwapsForCells(tx, plan.id, [{ userId: l.userId, date }], INVALID_BY_ADMIN)
      }
      return { ok: true as const }
    }),
  )
}

// Build Spec 2-7 R-LEAVE-C2·Q4: 확정된 달의 승인 휴가 취소 = 승인 전 칸으로 복원.
// 승인 뒤 그 칸을 다시 고쳤거나(현재 칸 ≠ 승인 이력의 after) 이력이 없으면(생성 때 고정 칸) 되돌리지 않고 알린다
export type CancelApprovedResult =
  | { ok: true; restored: string[]; skipped: { date: string; reason: string }[] }
  | { ok: false; message: string }

type CellSnapshot = { code: string; offKind: string | null; leaveKind: string | null; checkupHalf: boolean }
const sameCell = (a: CellSnapshot, b: CellSnapshot) =>
  a.code === b.code &&
  (a.offKind ?? null) === (b.offKind ?? null) &&
  (a.leaveKind ?? null) === (b.leaveKind ?? null) &&
  a.checkupHalf === b.checkupHalf

export async function cancelApprovedLeave(db: Db, actor: Actor, id: string): Promise<CancelApprovedResult> {
  if (actor.role !== 'admin') return deny('권한이 없습니다.')
  const [l] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id))
  if (!l || l.status !== 'APPROVED') return deny('승인된 휴가만 취소할 수 있습니다.')
  const dates = leaveDates(l.startDate, l.endDate)

  const restored: string[] = []
  const skipped: { date: string; reason: string }[] = []
  // R-1: 계획 행을 잠그고 휴가를 조건부로 먼저 취소한 뒤 칸을 되돌린다(두 번 취소·마감과 겹침 방지)
  const r = await rejectable(() =>
    db.transaction(async (tx) => {
      const plans = await lockPlansFor(tx, dates)
      const planOf = (date: string) =>
        plans.find((p) => p.year === Number(date.slice(0, 4)) && p.month === Number(date.slice(5, 7)))
      if (dates.some((d) => planOf(d)?.status === 'CLOSED'))
        throw new Rejected('마감한 달이 포함된 휴가입니다. 마감 취소 후 취소하세요.')
      const [done] = await tx
        .update(leaveRequests)
        .set({ status: 'CANCELLED' })
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, 'APPROVED')))
        .returning({ id: leaveRequests.id })
      if (!done) throw new Rejected('승인된 휴가만 취소할 수 있습니다.')
      const now = new Date()
      for (const date of dates) {
        const plan = planOf(date)
        if (plan?.status !== 'CONFIRMED') continue
        const where = and(
          eq(scheduleCells.monthPlanId, plan.id),
          eq(scheduleCells.userId, l.userId),
          eq(scheduleCells.date, date),
        )
        const [c] = await tx.select().from(scheduleCells).where(where)
        if (!c) continue
        const [log] = await tx
          .select()
          .from(cellEditLogs)
          .where(
            and(
              eq(cellEditLogs.monthPlanId, plan.id),
              eq(cellEditLogs.userId, l.userId),
              eq(cellEditLogs.date, date),
              eq(cellEditLogs.reason, 'leave_approved'),
            ),
          )
          .orderBy(desc(cellEditLogs.editedAt))
          .limit(1)
        const now_ = { code: c.code, offKind: c.offKind, leaveKind: c.leaveKind, checkupHalf: c.checkupHalf }
        if (!log) {
          skipped.push({
            date,
            reason: `${formatMD(date)}은 근무표를 만들 때 들어간 휴가라 근무 조정에서 칸을 정해 주세요.`,
          })
          continue
        }
        if (!sameCell(log.after as CellSnapshot, now_)) {
          skipped.push({ date, reason: `${formatMD(date)}은 승인 뒤 다시 바뀌어 되돌리지 않았습니다.` })
          continue
        }
        const before = log.before as CellSnapshot
        await tx
          .update(scheduleCells)
          .set({ ...before, source: 'admin', editedBy: actor.id, editedAt: now })
          .where(where)
        await tx.insert(cellEditLogs).values({
          monthPlanId: plan.id,
          userId: l.userId,
          date,
          before: now_,
          after: before,
          editedBy: actor.id,
          editedAt: now,
          reason: 'leave_cancelled',
        })
        await invalidateSwapsForCells(tx, plan.id, [{ userId: l.userId, date }], INVALID_BY_ADMIN)
        restored.push(date)
      }
      return null
    }),
  )
  if (r) return r
  return { ok: true, restored, skipped }
}

// R-APPROVE-3: 확정된 달이면 승인으로 새로 생기는 하드 위반과 대체 후보(그날 OFF인 교대 근무자, 표 순서 최대 3명).
// 신청 중인 달이면 null. 대체 지정 자체는 2-7 근무 조정에서 한다.
// focus: 2-7 「승인 · 대체 지정」이 여는 S9 대체 지정의 날짜·듀티(첫 인원·K-tass 부족)
export type LeaveImpact = {
  lines: string[]
  candidates: string[]
  focus: { date: string; shift: 'D' | 'E' | 'N' } | null
}
export async function leaveImpact(db: Db, id: string): Promise<LeaveImpact | null> {
  const [l]: LeaveRow[] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id))
  if (!l) return null
  const plan = await findPlan(db, ymOfDate(l.startDate))
  if (plan?.status !== 'CONFIRMED') return null
  const { input } = await buildScheduleInput(db, plan)
  const dates = new Set(leaveDates(l.startDate, l.endDate))
  const applied = {
    ...input,
    cells: input.cells.map((c) =>
      c.userId === l.userId && dates.has(c.date) ? applyLeave(c, l.type as LeaveType) : c,
    ),
  }
  const key = (v: { ruleId: string; dates: string[]; shift?: string; userIds: string[]; data: unknown }) =>
    [v.ruleId, v.dates.join(), v.shift ?? '', v.userIds.join(), JSON.stringify(v.data)].join('|')
  const before = new Set(checkSchedule(input).hardViolations.map(key))
  const people = await db
    .select({
      id: users.id,
      name: users.name,
      rotation: users.rotation,
      kTass: users.kTass,
      active: users.active,
    })
    .from(users)
    .orderBy(asc(users.seniorityRank))
  const names = new Map(people.map((u) => [u.id, u.name]))
  const added = checkSchedule(applied).hardViolations.filter(
    (v) => !before.has(key(v)) && v.dates.some((x) => dates.has(x)),
  )
  const lines = added.map((v) => {
    const f = formatViolation(v, { nameOf: (x) => names.get(x) ?? x, month: plan.month })
    return f.detail ? `${f.title} · ${f.detail}` : f.title
  })
  const staff = added.find((v) => (v.ruleId === 'H-STAFF' || v.ruleId === 'H-KTASS') && v.shift && v.dates[0])
  const focus = staff ? { date: staff.dates[0]!, shift: staff.shift as 'D' | 'E' | 'N' } : null
  // 대체 후보: 2-7 S9 대체 지정과 같은 기준(그날 쉬는 교대 근무자, K-tass 부족이면 K-tass 먼저, 덜 일한 사람 먼저,
  // 넣어도 새 필수 위반이 없는 사람) 상위 3명. 누적 OFF 비교를 위해 월초 잔여를 채운다
  const candidates: string[] = []
  if (focus) {
    await fillProfiles(db, applied, applied.rules)
    for (const c of replacementCandidates(applied, focus.date, focus.shift)) {
      if (candidates.length >= 3) break
      if (c.userId === l.userId || c.newHard.length) continue
      candidates.push(
        `${names.get(c.userId) ?? c.userId} (${formatMD(focus.date)} OFF${c.kTass ? ', K-tass' : ''})`,
      )
    }
  }
  return { lines, candidates, focus }
}
