// 3-7c S-D2 의사 근무 신청 + 내 근무 조건. 신청은 D/N/O/올데이 복수(= or), 코멘트는 본인·관리자만 본다.
// 고정 조건과 부딪히는 신청은 저장 전에 알려 주고, 확인하면 그 날만 조건 예외로 저장한다
import {
  DoctorPrefsSchema,
  diffDays,
  expandFixedRules,
  isIsoDate,
  monthDates,
  requestConflicts,
  type DoctorOption,
  type DoctorPrefs,
  type FixedOnDate,
  type IsoDate,
} from '@duty/domain'
import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { doctorPrefs, doctorRequests, users } from '../db/schema'
import {
  currentDoctorRules,
  ensureDoctorPlan,
  listDoctors,
  prefsOf,
  targetsFor,
  type DoctorPlan,
  type Ym,
} from './core'

export type DoctorActor = { id: string; role: 'admin' | 'member' }
type Deny = { ok: false; message: string }
const deny = (message: string): Deny => ({ ok: false, message })

export type MyRequest = { options: DoctorOption[]; comment: string | null; fixedException: boolean }
export type OtherMark = { name: string; text: string; fixed: boolean }

export type DoctorRequestsView = {
  year: number
  month: number
  plan: Pick<DoctorPlan, 'status' | 'requestDeadline' | 'negotiationEnd'>
  editable: boolean
  daysLeft: number
  days: IsoDate[]
  userId: string
  people: { id: string; name: string }[]
  mine: Record<IsoDate, MyRequest>
  myFixed: FixedOnDate[]
  others: Record<IsoDate, OtherMark[]>
  prefs: DoctorPrefs
  target: { D: number; N: number }
  perMonth: number
}

export function canDoctorEdit(
  plan: Pick<DoctorPlan, 'status' | 'requestDeadline'>,
  actor: DoctorActor,
  today: IsoDate,
) {
  if (plan.status === 'CONFIRMED') return false
  return actor.role === 'admin' || today <= plan.requestDeadline
}

export async function loadDoctorRequests(
  db: Db,
  a: Ym & { actor: DoctorActor; userId: string; today: IsoDate },
): Promise<DoctorRequestsView> {
  const plan = await ensureDoctorPlan(db, a)
  const days = monthDates(a.year, a.month)
  const doctors = await listDoctors(db)
  const prefs = await prefsOf(
    db,
    doctors.map((d) => d.id),
  )
  const rows = await db
    .select()
    .from(doctorRequests)
    .where(and(eq(doctorRequests.year, a.year), eq(doctorRequests.month, a.month)))
  const mine: Record<IsoDate, MyRequest> = {}
  const others: Record<IsoDate, OtherMark[]> = {}
  const name = new Map(doctors.map((d) => [d.id, d.name]))
  const exceptionsOf = (uid: string) =>
    new Set(rows.filter((r) => r.userId === uid && r.fixedException).map((r) => r.date))
  for (const r of rows) {
    if (r.options.length === 0 && !r.comment) continue
    if (r.userId === a.userId)
      mine[r.date] = {
        options: r.options as DoctorOption[],
        comment: r.comment,
        fixedException: r.fixedException,
      }
    else if (name.has(r.userId) && r.options.length)
      (others[r.date] ??= []).push({
        name: name.get(r.userId)!,
        text: r.options.map(optText).join('/'),
        fixed: false,
      })
  }
  // 다른 의사의 고정 조건도 그 날 칸에 「진하람 N · 고정」으로 보인다
  for (const d of doctors) {
    if (d.id === a.userId) continue
    for (const f of expandFixedRules(prefs.get(d.id)!.fixedRules, days, exceptionsOf(d.id)))
      (others[f.date] ??= []).push({ name: d.name, text: fixedText(f), fixed: true })
  }
  const { params } = await currentDoctorRules(db)
  const ids = doctors.map((d) => d.id)
  const target = targetsFor(a, ids, params, plan.extras).get(a.userId) ?? {
    D: params.dPerMonth,
    N: params.nPerMonth,
  }
  const myPrefs = prefs.get(a.userId) ?? (await prefsOf(db, [a.userId])).get(a.userId)!
  return {
    year: a.year,
    month: a.month,
    plan: { status: plan.status, requestDeadline: plan.requestDeadline, negotiationEnd: plan.negotiationEnd },
    editable: canDoctorEdit(plan, a.actor, a.today),
    daysLeft: Math.max(0, diffDays(a.today, plan.requestDeadline)),
    days,
    userId: a.userId,
    people: doctors.map((d) => ({ id: d.id, name: d.name })),
    mine,
    myFixed: expandFixedRules(myPrefs.fixedRules, days),
    others,
    prefs: myPrefs,
    target,
    perMonth: params.dPerMonth,
  }
}

const optText = (o: string) => (o === 'ALLDAY' ? '올데이' : o)
const fixedText = (f: FixedOnDate) =>
  f.type === 'forbid'
    ? `${f.shift === 'ANY' ? '근무' : f.shift} 금지 · 고정`
    : `${f.shift === 'ANY' ? '근무' : f.shift} · 고정`

export type SaveItem = { date: IsoDate; options: DoctorOption[]; comment: string | null }
export type SaveResult =
  { ok: true; saved: number } | { ok: false; conflicts: { date: IsoDate; labels: string[] }[] } | Deny

export async function saveDoctorRequests(
  db: Db,
  actor: DoctorActor,
  input: Ym & { userId: string; items: SaveItem[]; exceptions: IsoDate[] },
  today: IsoDate,
): Promise<SaveResult> {
  if (actor.role !== 'admin' && actor.id !== input.userId) return deny('다른 의사의 신청은 바꿀 수 없습니다.')
  const [target] = await db.select().from(users).where(eq(users.id, input.userId))
  if (!target || target.roleGroup !== 'doctor' || !target.active) return deny('의사를 찾을 수 없습니다.')
  const plan = await ensureDoctorPlan(db, input)
  if (!canDoctorEdit(plan, actor, today))
    return deny(
      plan.status === 'CONFIRMED' ? '확정된 달은 신청을 바꿀 수 없습니다.' : '신청 마감일이 지났습니다.',
    )
  const month = new Set(monthDates(input.year, input.month))
  if (input.items.some((i) => !isIsoDate(i.date) || !month.has(i.date)))
    return deny('그 달의 날짜가 아닙니다.')
  const prefs = (await prefsOf(db, [input.userId])).get(input.userId)!
  const fixed = expandFixedRules(prefs.fixedRules, [...month])
  const exceptions = new Set(input.exceptions)
  const conflicts = input.items
    .map((i) => ({
      date: i.date,
      labels: requestConflicts(
        i.options,
        fixed.filter((f) => f.date === i.date),
      ),
    }))
    .filter((c) => c.labels.length > 0)
  const unconfirmed = conflicts.filter((c) => !exceptions.has(c.date))
  if (unconfirmed.length) return { ok: false, conflicts: unconfirmed }
  const conflictDates = new Set(conflicts.map((c) => c.date))
  const now = new Date()
  await db.transaction(async (tx) => {
    const dates = input.items.map((i) => i.date)
    if (dates.length)
      await tx
        .delete(doctorRequests)
        .where(and(eq(doctorRequests.userId, input.userId), inArray(doctorRequests.date, dates)))
    const keep = input.items.filter((i) => i.options.length > 0 || (i.comment ?? '').trim())
    if (keep.length)
      await tx.insert(doctorRequests).values(
        keep.map((i) => ({
          userId: input.userId,
          year: input.year,
          month: input.month,
          date: i.date,
          options: [...new Set(i.options)],
          comment: i.comment?.trim() || null,
          fixedException: conflictDates.has(i.date),
          byAdmin: actor.id !== input.userId,
          submittedAt: now,
          updatedAt: now,
        })),
      )
  })
  return { ok: true, saved: input.items.length }
}

export async function saveDoctorPrefs(
  db: Db,
  actor: DoctorActor,
  userId: string,
  input: unknown,
): Promise<{ ok: true } | Deny> {
  if (actor.role !== 'admin' && actor.id !== userId) return deny('다른 의사의 조건은 바꿀 수 없습니다.')
  const parsed = DoctorPrefsSchema.safeParse(input)
  if (!parsed.success) return deny(parsed.error.issues[0]?.message ?? '입력을 확인해 주세요.')
  const [target] = await db.select({ g: users.roleGroup }).from(users).where(eq(users.id, userId))
  if (target?.g !== 'doctor') return deny('의사를 찾을 수 없습니다.')
  const v = { ...parsed.data, updatedAt: new Date() }
  await db
    .insert(doctorPrefs)
    .values({ userId, ...v })
    .onConflictDoUpdate({ target: doctorPrefs.userId, set: v })
  return { ok: true }
}
