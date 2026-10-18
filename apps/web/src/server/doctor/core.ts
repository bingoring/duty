// 3-7 의사 근무표 공통 — 규칙 버전, 월 계획, 의사 명단, 확정 근무표 읽기
import {
  DEFAULT_DOCTOR_RULES,
  EMPTY_DOCTOR_PREFS,
  defaultExtras,
  doctorPlanDates,
  extraNeeded,
  monthDates,
  monthTargets,
  prevMonth,
  type DoctorExtras,
  type DoctorPrefs,
  type DoctorRuleParams,
  type DoctorShiftRow,
  type DoctorTarget,
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
  // 예전 버전(공개 여부 없음)은 기본값으로 채운다
  return r
    ? { version: r.version, params: { ...DEFAULT_DOCTOR_RULES, ...r.params } }
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
}

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

export async function proposedExtras(db: DbOrTx, ym: Ym, order: readonly string[], p: DoctorRuleParams) {
  return defaultExtras(order, extraNeeded(ym.year, ym.month, order.length, p), await lastExtras(db, ym))
}

// 신청 화면·생성 화면이 처음 열 때 계획을 만든다(REQUESTING). 이미 있으면 그대로
export async function ensureDoctorPlan(db: DbOrTx, ym: Ym): Promise<DoctorPlan> {
  const found = await findDoctorPlan(db, ym)
  if (found) return found
  const { params } = await currentDoctorRules(db)
  const order = (await listDoctors(db)).map((d) => d.id)
  const extras = await proposedExtras(db, ym, order, params)
  await db
    .insert(doctorMonthPlans)
    .values({ ...ym, status: 'REQUESTING', ...doctorPlanDates(ym.year, ym.month, params), extras })
    .onConflictDoNothing({ target: [doctorMonthPlans.year, doctorMonthPlans.month] })
  return (await findDoctorPlan(db, ym))!
}

export function targetsFor(
  ym: Ym,
  ids: readonly string[],
  params: DoctorRuleParams,
  extras: DoctorExtras,
): Map<string, DoctorTarget> {
  return monthTargets(ids, params, extraNeeded(ym.year, ym.month, ids.length, params), extras)
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

// 전월 마지막 날 Night (월초 N → D 피하기·검사용)
export async function prevLastNight(db: DbOrTx, ym: Ym): Promise<string | null> {
  const p = prevMonth(ym.year, ym.month)
  const plan = await findDoctorPlan(db, p)
  if (!plan || plan.status !== 'CONFIRMED') return null
  const last = monthDates(p.year, p.month).at(-1)!
  const [r] = await db
    .select({ night: doctorShifts.nightUser })
    .from(doctorShifts)
    .where(and(eq(doctorShifts.planId, plan.id), eq(doctorShifts.date, last)))
  return r?.night ?? null
}

// 공휴일은 표시만 (Q3). 개원기념일은 의사와 무관해 뺀다
export async function redHolidays(db: DbOrTx, from: IsoDate, to: IsoDate) {
  const rows = await db
    .select({ date: holidays.date, name: holidays.name, kind: holidays.kind })
    .from(holidays)
    .where(and(gte(holidays.date, from), lte(holidays.date, to)))
  return rows.filter((h) => h.kind !== 'founding_day')
}
