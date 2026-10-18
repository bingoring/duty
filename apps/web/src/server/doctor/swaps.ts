// 3-7e 의사 근무 조정 — 관리자 칸 편집 + 의사 간 교환 요청 (간호사 S9 패턴, 의사 규칙만 검사).
// 교환 = 두 칩(날짜·D|N)의 주인을 맞바꾼다. 받는 사람이 수락하면 재검사 뒤 바로 반영한다
import {
  checkDoctorMonth,
  formatMD,
  ownerOf,
  swapChips,
  weekdayKo,
  type DoctorChip,
  type DoctorShiftRow,
  type DoctorViolation,
  type IsoDate,
} from '@duty/domain'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import { doctorMonthPlans, doctorShiftLogs, doctorShifts, doctorSwapRequests, users } from '../db/schema'
import type { DbOrTx } from '../seed/core'
import { confirmedShifts, findDoctorPlan, type DoctorPlan, type Ym } from './core'
import { doctorMonthInput } from './generate'
import type { DoctorActor } from './requests'

type Fail = { ok: false; message: string }
const fail = (message: string): Fail => ({ ok: false, message })
export type Checked = { ok: false; violations: DoctorViolation[]; needNote: true }

const chipLabel = (c: DoctorChip) => `${formatMD(c.date)}(${weekdayKo(c.date)}) ${c.slot === 'D' ? 'Day' : 'Night'}`

async function adjustCheck(db: DbOrTx, plan: DoctorPlan, shifts: DoctorShiftRow[], dates: IsoDate[]) {
  const input = await doctorMonthInput(db as Db, plan, plan.extras)
  const r = checkDoctorMonth({ ...plan, doctors: input.check, shifts, mode: 'adjust', prevLastNight: input.prevNight })
  const before = checkDoctorMonth({
    ...plan,
    doctors: input.check,
    shifts: await confirmedShifts(db, plan.id),
    mode: 'adjust',
    prevLastNight: input.prevNight,
  })
  const key = (v: DoctorViolation) => `${v.rule}|${v.userId ?? ''}|${v.dates.join(',')}|${v.message}`
  const had = new Set([...before.hard, ...before.soft].map(key))
  const touched = new Set(dates)
  // 이 변경으로 새로 생긴 위반만 (이미 있던 것은 묻지 않는다)
  const fresh = (vs: DoctorViolation[]) =>
    vs.filter((v) => !had.has(key(v)) && (v.dates.length === 0 || v.dates.some((d) => touched.has(d))))
  return { hard: fresh(r.hard), soft: fresh(r.soft) }
}

async function confirmedPlan(db: DbOrTx, ym: Ym): Promise<DoctorPlan | null> {
  const p = await findDoctorPlan(db, ym)
  return p?.status === 'CONFIRMED' ? p : null
}

async function applyRows(
  tx: DbOrTx,
  plan: DoctorPlan,
  before: DoctorShiftRow[],
  after: DoctorShiftRow[],
  a: { actorId: string; reason: 'admin' | 'swap'; note: string | null },
) {
  const now = new Date()
  for (const r of after) {
    const b = before.find((x) => x.date === r.date)!
    if (b.day === r.day && b.night === r.night) continue
    await tx
      .update(doctorShifts)
      .set({ dayUser: r.day!, nightUser: r.night!, source: a.reason, editedBy: a.actorId, editedAt: now })
      .where(and(eq(doctorShifts.planId, plan.id), eq(doctorShifts.date, r.date)))
    await tx.insert(doctorShiftLogs).values({
      planId: plan.id,
      date: r.date,
      before: { day: b.day!, night: b.night! },
      after: { day: r.day!, night: r.night! },
      editedBy: a.actorId,
      reason: a.reason,
      note: a.note,
    })
  }
  await invalidateStale(tx, plan.id, after)
}

// 칩 주인이 바뀐 대기 교환은 무효
async function invalidateStale(tx: DbOrTx, planId: string, rows: DoctorShiftRow[]) {
  const pending = await tx
    .select()
    .from(doctorSwapRequests)
    .where(and(eq(doctorSwapRequests.planId, planId), eq(doctorSwapRequests.status, 'PENDING')))
  for (const q of pending)
    if (ownerOf(rows, q.chipA) !== q.requesterId || ownerOf(rows, q.chipB) !== q.targetId)
      await tx
        .update(doctorSwapRequests)
        .set({ status: 'INVALID', closedReason: '그사이 근무가 바뀌었습니다', closedAt: new Date() })
        .where(eq(doctorSwapRequests.id, q.id))
}

// ── 관리자 ───────────────────────────────────────────────────────────
export type AdminEdit =
  | { kind: 'assign'; chip: DoctorChip; userId: string }
  | { kind: 'swap'; a: DoctorChip; b: DoctorChip }

export async function adminEditDoctorShift(
  db: Db,
  actor: DoctorActor,
  ym: Ym,
  edit: AdminEdit,
  note: string | null,
): Promise<{ ok: true } | Fail | Checked> {
  if (actor.role !== 'admin') return fail('권한이 없습니다.')
  return db.transaction(async (tx) => {
    const plan = await confirmedPlan(tx, ym)
    if (!plan) return fail('확정된 근무표만 조정할 수 있습니다.')
    await tx.select().from(doctorMonthPlans).where(eq(doctorMonthPlans.id, plan.id)).for('update')
    const before = await confirmedShifts(tx, plan.id)
    let after: DoctorShiftRow[] | null
    if (edit.kind === 'assign') {
      const [u] = await tx.select().from(users).where(eq(users.id, edit.userId))
      if (!u || u.roleGroup !== 'doctor' || !u.active) return fail('의사를 찾을 수 없습니다.')
      after = before.map((r) =>
        r.date === edit.chip.date ? { ...r, [edit.chip.slot === 'D' ? 'day' : 'night']: edit.userId } : r,
      )
      if (ownerOf(before, edit.chip) === edit.userId) after = null
    } else after = swapChips(before, edit.a, edit.b)
    if (!after) return fail('바뀌는 근무가 없습니다.')
    const dates = edit.kind === 'assign' ? [edit.chip.date] : [edit.a.date, edit.b.date]
    const c = await adjustCheck(tx, plan, after, dates)
    // 필수 규칙(매일 D1·N1·고정 조건)을 어기면 사유를 받아야 적용한다
    if (c.hard.length && !note?.trim()) return { ok: false as const, violations: c.hard, needNote: true as const }
    await applyRows(tx, plan, before, after, { actorId: actor.id, reason: 'admin', note: note?.trim() || null })
    return { ok: true as const }
  })
}

// ── 의사 간 교환 ────────────────────────────────────────────────────
export type SwapPreview = { ok: true; hard: DoctorViolation[]; soft: DoctorViolation[] } | Fail

async function prepareSwap(db: DbOrTx, actor: DoctorActor, ym: Ym, a: DoctorChip, b: DoctorChip, today: IsoDate) {
  const plan = await confirmedPlan(db, ym)
  if (!plan) return fail('확정된 근무표만 교환할 수 있습니다.')
  const before = await confirmedShifts(db, plan.id)
  if (a.date < today || b.date < today) return fail('지난 날짜는 교환할 수 없습니다.')
  if (ownerOf(before, a) !== actor.id) return fail('내 근무를 먼저 고른 뒤 맞바꿀 칩을 골라 주세요.')
  const target = ownerOf(before, b)
  if (!target || target === actor.id) return fail('다른 의사의 근무를 골라 주세요.')
  const after = swapChips(before, a, b)
  if (!after) return fail('맞바꿀 수 없습니다.')
  const c = await adjustCheck(db, plan, after, [a.date, b.date])
  return { ok: true as const, plan, target, after, before, ...c }
}

export async function previewDoctorSwap(
  db: Db,
  actor: DoctorActor,
  ym: Ym,
  a: DoctorChip,
  b: DoctorChip,
  today: IsoDate,
): Promise<SwapPreview> {
  const p = await prepareSwap(db, actor, ym, a, b, today)
  return p.ok ? { ok: true, hard: p.hard, soft: p.soft } : p
}

export async function createDoctorSwap(
  db: Db,
  actor: DoctorActor,
  ym: Ym,
  a: DoctorChip,
  b: DoctorChip,
  comment: string | null,
  today: IsoDate,
): Promise<{ ok: true; id: string } | Fail> {
  const p = await prepareSwap(db, actor, ym, a, b, today)
  if (!p.ok) return p
  if (p.hard.length) return fail(`규칙 위반 · ${p.hard[0]!.message}`)
  const dup = await db
    .select({ id: doctorSwapRequests.id, a: doctorSwapRequests.chipA, b: doctorSwapRequests.chipB })
    .from(doctorSwapRequests)
    .where(and(eq(doctorSwapRequests.planId, p.plan.id), eq(doctorSwapRequests.status, 'PENDING')))
  const same = (x: DoctorChip, y: DoctorChip) => x.date === y.date && x.slot === y.slot
  if (dup.some((q) => [q.a, q.b].some((c) => same(c, a) || same(c, b))))
    return fail('이 근무에 대기 중인 교환 요청이 이미 있습니다.')
  const [q] = await db
    .insert(doctorSwapRequests)
    .values({
      planId: p.plan.id,
      requesterId: actor.id,
      targetId: p.target,
      chipA: a,
      chipB: b,
      comment: comment?.trim() || null,
      status: 'PENDING',
    })
    .returning({ id: doctorSwapRequests.id })
  return { ok: true, id: q!.id }
}

export async function respondDoctorSwap(
  db: Db,
  actor: DoctorActor,
  id: string,
  accept: boolean,
  today: IsoDate,
): Promise<{ ok: true; status: string } | Fail> {
  return db.transaction(async (tx) => {
    const [q] = await tx.select().from(doctorSwapRequests).where(eq(doctorSwapRequests.id, id)).for('update')
    if (!q || q.targetId !== actor.id) return fail('요청을 찾을 수 없습니다.')
    if (q.status !== 'PENDING') return fail('이미 처리된 요청입니다.')
    const close = async (status: string, reason: string | null) => {
      await tx
        .update(doctorSwapRequests)
        .set({ status, closedReason: reason, closedAt: new Date() })
        .where(eq(doctorSwapRequests.id, q.id))
      return { ok: true as const, status }
    }
    if (!accept) return close('REJECTED', null)
    const [plan] = await tx.select().from(doctorMonthPlans).where(eq(doctorMonthPlans.id, q.planId)).for('update')
    if (!plan || plan.status !== 'CONFIRMED') return close('INVALID', '근무표가 확정 상태가 아닙니다')
    if (q.chipA.date < today || q.chipB.date < today) return close('EXPIRED', '날짜가 지났습니다')
    const before = await confirmedShifts(tx, plan.id)
    if (ownerOf(before, q.chipA) !== q.requesterId || ownerOf(before, q.chipB) !== q.targetId)
      return close('INVALID', '그사이 근무가 바뀌었습니다')
    const after = swapChips(before, q.chipA, q.chipB)!
    const c = await adjustCheck(tx, plan, after, [q.chipA.date, q.chipB.date])
    if (c.hard.length) return close('INVALID', `규칙 위반 · ${c.hard[0]!.message}`)
    await applyRows(tx, plan, before, after, { actorId: actor.id, reason: 'swap', note: q.comment })
    return close('APPLIED', null)
  })
}

export async function cancelDoctorSwap(db: Db, actor: DoctorActor, id: string): Promise<{ ok: true } | Fail> {
  const r = await db
    .update(doctorSwapRequests)
    .set({ status: 'CANCELLED', closedAt: new Date() })
    .where(
      and(
        eq(doctorSwapRequests.id, id),
        eq(doctorSwapRequests.requesterId, actor.id),
        eq(doctorSwapRequests.status, 'PENDING'),
      ),
    )
    .returning({ id: doctorSwapRequests.id })
  return r.length ? { ok: true } : fail('취소할 수 없는 요청입니다.')
}

// 날짜가 지난 대기 요청은 만료
async function expireOld(db: DbOrTx, today: IsoDate) {
  const pending = await db.select().from(doctorSwapRequests).where(eq(doctorSwapRequests.status, 'PENDING'))
  const old = pending.filter((q) => q.chipA.date < today || q.chipB.date < today).map((q) => q.id)
  if (old.length)
    await db
      .update(doctorSwapRequests)
      .set({ status: 'EXPIRED', closedReason: '날짜가 지났습니다', closedAt: new Date() })
      .where(inArray(doctorSwapRequests.id, old))
}

export async function pendingDoctorSwapCount(db: Db, userId: string, today: IsoDate): Promise<number> {
  const rows = await db
    .select({ a: doctorSwapRequests.chipA, b: doctorSwapRequests.chipB })
    .from(doctorSwapRequests)
    .where(and(eq(doctorSwapRequests.targetId, userId), eq(doctorSwapRequests.status, 'PENDING')))
  return rows.filter((r) => r.a.date >= today && r.b.date >= today).length
}

export type SwapItem = {
  id: string
  requester: string
  target: string
  mine: boolean
  received: boolean
  a: DoctorChip & { label: string }
  b: DoctorChip & { label: string }
  comment: string | null
  status: string
  closedReason: string | null
}

export async function loadDoctorAdjust(db: Db, ym: Ym, viewer: DoctorActor, today: IsoDate) {
  await expireOld(db, today)
  const plan = await confirmedPlan(db, ym)
  // 칩 표시: 관리자 수정 = 파란 실선, 교환 = 빨간 점선 (마지막으로 바뀐 이유)
  const logs = plan
    ? await db
        .select()
        .from(doctorShiftLogs)
        .where(eq(doctorShiftLogs.planId, plan.id))
        .orderBy(doctorShiftLogs.editedAt)
    : []
  const marks: Record<string, 'admin' | 'swap'> = {}
  for (const l of logs) {
    if (l.before.day !== l.after.day) marks[`${l.date}:D`] = l.reason as 'admin' | 'swap'
    if (l.before.night !== l.after.night) marks[`${l.date}:N`] = l.reason as 'admin' | 'swap'
  }
  const swaps = plan
    ? await db
        .select()
        .from(doctorSwapRequests)
        .where(
          and(
            eq(doctorSwapRequests.planId, plan.id),
            viewer.role === 'admin'
              ? undefined
              : or(eq(doctorSwapRequests.requesterId, viewer.id), eq(doctorSwapRequests.targetId, viewer.id)),
          ),
        )
        .orderBy(desc(doctorSwapRequests.createdAt))
        .limit(40)
    : []
  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]))
  const items: SwapItem[] = swaps.map((q) => ({
    id: q.id,
    requester: names.get(q.requesterId) ?? '?',
    target: names.get(q.targetId) ?? '?',
    mine: q.requesterId === viewer.id,
    received: q.targetId === viewer.id,
    a: { ...q.chipA, label: chipLabel(q.chipA) },
    b: { ...q.chipB, label: chipLabel(q.chipB) },
    comment: q.comment,
    status: q.status,
    closedReason: q.closedReason,
  }))
  return {
    plan,
    marks,
    swaps: items,
  }
}
