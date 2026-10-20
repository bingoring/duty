// 3-7 의사 근무표 공통 — 규칙 버전, 월 계획, 의사 명단, 확정 근무표 읽기
import {
  DEFAULT_DOCTOR_RULES,
  EMPTY_DOCTOR_PREFS,
  baseTarget,
  daysInMonth,
  defaultExtras,
  doctorPlanDates,
  employedDaysInMonth,
  extraNeeded,
  monthDates,
  monthTargets,
  prevMonth,
  readDoctorRuleParams,
  type DoctorExtras,
  type DoctorPrefs,
  type DoctorRuleParams,
  type DoctorShiftRow,
  type DoctorTarget,
  type Employment,
  type IsoDate,
} from '@duty/domain'
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import {
  doctorMonthPlans,
  doctorPrefs,
  doctorRuleVersions,
  doctorShifts,
  holidays,
  users,
} from '../db/schema'
import { DOCTORS } from '../role-group'
import type { DbOrTx } from '../seed/core'

export type Ym = { year: number; month: number }
export type DoctorPlan = typeof doctorMonthPlans.$inferSelect

export async function ensureDoctorRuleV1(db: DbOrTx): Promise<void> {
  await db
    .insert(doctorRuleVersions)
    .values({ version: 1, params: DEFAULT_DOCTOR_RULES, diff: [], changedBy: null })
    .onConflictDoNothing({ target: doctorRuleVersions.version })
}

export async function currentDoctorRules(db: DbOrTx): Promise<{ version: number; params: DoctorRuleParams }> {
  const [r] = await db.select().from(doctorRuleVersions).orderBy(desc(doctorRuleVersions.version)).limit(1)
  // 예전 버전(공개 여부·3-11 필수/권고·금지 패턴 없음)은 기본값으로 채운다
  return r
    ? { version: r.version, params: readDoctorRuleParams(r.params) }
    : { version: 0, params: DEFAULT_DOCTOR_RULES }
}

export type DoctorPerson = {
  id: string
  name: string
  loginId: string
  loginIdKind: string
  role: string
  active: boolean
  rank: number
  // 3-11 8: 재직 기간(입사일 ~ 퇴사 예정일). null이면 제한 없음
  hireDate: IsoDate | null
  plannedEndDate: IsoDate | null
}

// 3-11 8: 재직 기간
export type DoctorEmploymentLike = { id: string; hireDate: IsoDate | null; plannedEndDate: IsoDate | null }
export const employmentOf = (d: Pick<DoctorEmploymentLike, 'hireDate' | 'plannedEndDate'>): Employment => ({
  employedFrom: d.hireDate,
  employedUntil: d.plannedEndDate,
})

// 표 순서(seniority_rank) — 관리자가 맨 위인 순서는 가져오기 때 정한다
export async function listDoctors(
  db: DbOrTx,
  opts: { includeInactive?: boolean } = {},
): Promise<DoctorPerson[]> {
  const rows = await db
    .select()
    .from(users)
    .where(opts.includeInactive ? DOCTORS : and(DOCTORS, eq(users.active, true)))
    .orderBy(asc(users.seniorityRank), asc(users.name))
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    loginId: u.employeeNo,
    loginIdKind: u.loginIdKind,
    role: u.role,
    active: u.active,
    rank: u.seniorityRank,
    hireDate: u.hireDate,
    plannedEndDate: u.plannedEndDate,
  }))
}

export async function prefsOf(db: DbOrTx, ids: readonly string[]): Promise<Map<string, DoctorPrefs>> {
  const rows = ids.length
    ? await db
        .select()
        .from(doctorPrefs)
        .where(inArray(doctorPrefs.userId, [...ids]))
    : []
  const m = new Map(ids.map((id) => [id, EMPTY_DOCTOR_PREFS]))
  for (const r of rows)
    m.set(r.userId, { allDayMin: r.allDayMin, allDayMax: r.allDayMax, fixedRules: r.fixedRules })
  return m
}

export async function findDoctorPlan(db: DbOrTx, ym: Ym): Promise<DoctorPlan | null> {
  const [p] = await db
    .select()
    .from(doctorMonthPlans)
    .where(and(eq(doctorMonthPlans.year, ym.year), eq(doctorMonthPlans.month, ym.month)))
  return p ?? null
}

// 직전 계획들의 ±1 대상(가장 최근 것) — 기본 대상을 그 다음 사람부터 돌린다
async function lastExtras(db: DbOrTx, ym: Ym): Promise<string[]> {
  const rows = await db
    .select({ year: doctorMonthPlans.year, month: doctorMonthPlans.month, extras: doctorMonthPlans.extras })
    .from(doctorMonthPlans)
    .orderBy(desc(doctorMonthPlans.year), desc(doctorMonthPlans.month))
  for (const r of rows) {
    if (r.year * 12 + r.month >= ym.year * 12 + ym.month) continue
    const ids = [...r.extras.D, ...r.extras.N]
    if (ids.length > 0) return ids
  }
  return []
}

// 3-11 8: 의사별 기준 개수(재직 비율)와 날짜 수의 차이
export function baseTargetsFor(ym: Ym, docs: readonly DoctorEmploymentLike[], p: DoctorRuleParams) {
  return new Map(docs.map((d) => [d.id, baseTarget(ym.year, ym.month, p, employmentOf(d))]))
}

export function needFor(ym: Ym, docs: readonly DoctorEmploymentLike[], p: DoctorRuleParams) {
  return extraNeeded(ym.year, ym.month, [...baseTargetsFor(ym, docs, p).values()], p)
}

// 3-11 8: ±1 대상 후보 — 한 달 내내 재직하는 의사(모자라면 그 달에 하루라도 재직하는 의사까지)
export function extraCandidates(ym: Ym, docs: readonly DoctorEmploymentLike[]): string[] {
  const days = daysInMonth(ym.year, ym.month)
  const k = (d: DoctorEmploymentLike) => employedDaysInMonth(ym.year, ym.month, employmentOf(d))
  const full = docs.filter((d) => k(d) >= days).map((d) => d.id)
  return full.length > 0 ? full : docs.filter((d) => k(d) > 0).map((d) => d.id)
}

export async function proposedExtras(
  db: DbOrTx,
  ym: Ym,
  docs: readonly DoctorEmploymentLike[],
  p: DoctorRuleParams,
) {
  return defaultExtras(extraCandidates(ym, docs), needFor(ym, docs, p), await lastExtras(db, ym))
}

// 신청 화면·생성 화면이 처음 열 때 계획을 만든다(REQUESTING). 이미 있으면 그대로
export async function ensureDoctorPlan(db: DbOrTx, ym: Ym): Promise<DoctorPlan> {
  const found = await findDoctorPlan(db, ym)
  if (found) return found
  const { params } = await currentDoctorRules(db)
  const extras = await proposedExtras(db, ym, await listDoctors(db), params)
  await db
    .insert(doctorMonthPlans)
    .values({ ...ym, status: 'REQUESTING', ...doctorPlanDates(ym.year, ym.month, params), extras })
    .onConflictDoNothing({ target: [doctorMonthPlans.year, doctorMonthPlans.month] })
  return (await findDoctorPlan(db, ym))!
}

// 3-11 8: 재직 기간이 그 달 일부면 기준 개수를 비율로 줄이고, 남는 만큼은 ±1 대상이 채운다
export function targetsFor(
  ym: Ym,
  docs: readonly DoctorEmploymentLike[],
  params: DoctorRuleParams,
  extras: DoctorExtras,
): Map<string, DoctorTarget> {
  const bases = baseTargetsFor(ym, docs, params)
  return monthTargets(
    docs.map((d) => d.id),
    params,
    extraNeeded(ym.year, ym.month, [...bases.values()], params),
    extras,
    bases,
  )
}

export async function confirmedShifts(db: DbOrTx, planId: string): Promise<DoctorShiftRow[]> {
  const rows = await db
    .select()
    .from(doctorShifts)
    .where(eq(doctorShifts.planId, planId))
    .orderBy(asc(doctorShifts.date))
  return rows.map((r) => ({ date: r.date, day: r.dayUser, night: r.nightUser }))
}

export async function shiftRowsWithSource(db: DbOrTx, planId: string) {
  return db.select().from(doctorShifts).where(eq(doctorShifts.planId, planId)).orderBy(asc(doctorShifts.date))
}

// 3-11 10: 전월 확정본의 마지막 며칠(월초 금지 패턴 검사·솔버용). 확정 전이면 빈 배열
export async function prevMonthTail(db: DbOrTx, ym: Ym, n = 3): Promise<DoctorShiftRow[]> {
  const p = prevMonth(ym.year, ym.month)
  const plan = await findDoctorPlan(db, p)
  if (!plan || plan.status !== 'CONFIRMED') return []
  const tail = monthDates(p.year, p.month).slice(-n)
  const rows = await db
    .select()
    .from(doctorShifts)
    .where(and(eq(doctorShifts.planId, plan.id), inArray(doctorShifts.date, tail)))
    .orderBy(asc(doctorShifts.date))
  return rows.map((r) => ({ date: r.date, day: r.dayUser, night: r.nightUser }))
}

// 전월 마지막 날 Night (예전 호출 호환)
export async function prevLastNight(db: DbOrTx, ym: Ym): Promise<string | null> {
  return (await prevMonthTail(db, ym, 1)).at(-1)?.night ?? null
}

// 공휴일은 표시만 (Q3). 개원기념일은 의사와 무관해 뺀다
export async function redHolidays(db: DbOrTx, from: IsoDate, to: IsoDate) {
  const rows = await db
    .select({ date: holidays.date, name: holidays.name, kind: holidays.kind })
    .from(holidays)
    .where(and(gte(holidays.date, from), lte(holidays.date, to)))
  return rows.filter((h) => h.kind !== 'founding_day')
}
