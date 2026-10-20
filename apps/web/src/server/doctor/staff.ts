// 3-7a S-D3 의사 관리 — 의사 추가(임시 비밀번호), 「사번으로 변경」(로그인 ID만 교체, 기록 유지), 역할·제거,
// 규칙 설정(의사 규칙 버전)
import {
  DoctorRuleParamsSchema,
  EmployeeNoSchema,
  allDayRangeLabel,
  isIsoDate,
  doctorPlanDates,
  fixedRuleLabel,
  type DoctorRuleParams,
} from '@duty/domain'
import { and, eq, ne, sql } from 'drizzle-orm'
import { hashPassword } from '../auth/password'
import { generateTempPassword } from '../auth/tokens'
import type { Db } from '../db/client'
import {
  credentials,
  doctorMonthPlans,
  doctorRuleVersions,
  doctorSwapRequests,
  sessions,
  users,
} from '../db/schema'
import { DOCTORS } from '../role-group'
import { ensureWard } from '../seed/core'
import { loginIdKindOf } from '../seed/doctors'
import { currentDoctorRules, listDoctors, prefsOf } from './core'
import type { DoctorActor } from './requests'

type Fail = { ok: false; message: string }
const fail = (message: string): Fail => ({ ok: false, message })
const adminOnly = (a: DoctorActor) => (a.role === 'admin' ? null : fail('권한이 없습니다.'))

export async function loadDoctorStaff(db: Db) {
  const doctors = await listDoctors(db)
  const prefs = await prefsOf(
    db,
    doctors.map((d) => d.id),
  )
  return doctors.map((d) => {
    const p = prefs.get(d.id)!
    return {
      ...d,
      allDay: allDayRangeLabel(p),
      fixed: p.fixedRules.filter((r) => r.enabled).map((r) => fixedRuleLabel(r)),
    }
  })
}

async function doctorById(db: Db, id: string) {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), DOCTORS))
  return u?.active ? u : null
}

async function loginIdTaken(db: Db, loginId: string, except?: string) {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(except ? and(eq(users.employeeNo, loginId), ne(users.id, except)) : eq(users.employeeNo, loginId))
  return !!u
}

// 3-11 8: 입사일·퇴사 예정일 검사 (빈 값 = 제한 없음)
export type DoctorEmploymentInput = { hireDate: string | null; plannedEndDate: string | null }
function employmentError(e: DoctorEmploymentInput): string | null {
  if ((e.hireDate && !isIsoDate(e.hireDate)) || (e.plannedEndDate && !isIsoDate(e.plannedEndDate)))
    return '날짜 형식이 올바르지 않습니다.'
  if (e.hireDate && e.plannedEndDate && e.plannedEndDate < e.hireDate)
    return '퇴사 예정일은 입사일과 같거나 뒤여야 합니다.'
  return null
}

export async function createDoctor(
  db: Db,
  actor: DoctorActor,
  input: { loginId: string; name: string; admin: boolean } & Partial<DoctorEmploymentInput>,
): Promise<{ ok: true; tempPassword: string } | Fail> {
  const denied = adminOnly(actor)
  if (denied) return denied
  const emp = { hireDate: input.hireDate || null, plannedEndDate: input.plannedEndDate || null }
  const empErr = employmentError(emp)
  if (empErr) return fail(empErr)
  const id = EmployeeNoSchema.safeParse(input.loginId)
  const name = input.name.trim()
  if (!id.success || !/^\d{4,12}$/.test(id.data)) return fail('로그인 ID는 숫자 4~12자리로 입력해 주세요.')
  if (!name || name.length > 20) return fail('성명을 입력해 주세요.')
  if (await loginIdTaken(db, id.data)) return fail('이미 쓰는 로그인 ID입니다.')
  const tempPassword = generateTempPassword()
  const passwordHash = await hashPassword(tempPassword)
  await db.transaction(async (tx) => {
    const [{ max }] = (await tx
      .select({ max: sql<number>`coalesce(max(${users.seniorityRank}), 0)` })
      .from(users)
      .where(DOCTORS)) as [{ max: number }]
    const [u] = await tx
      .insert(users)
      .values({
        wardId: await ensureWard(tx),
        employeeNo: id.data,
        loginIdKind: loginIdKindOf(id.data),
        roleGroup: 'doctor',
        name,
        role: input.admin ? 'admin' : 'nurse',
        rotation: 'rotating',
        seniorityRank: Number(max) + 1,
        seniorityTier: 'senior',
        hireDate: emp.hireDate,
        plannedEndDate: emp.plannedEndDate,
      })
      .returning({ id: users.id })
    await tx.insert(credentials).values({ userId: u!.id, passwordHash, mustChangePassword: true })
  })
  return { ok: true, tempPassword }
}

// 「사번으로 변경」 — 로그인 ID만 바꾼다(근무·신청 기록은 사용자 id에 붙어 그대로). 다시 로그인해야 한다
export async function changeDoctorLoginId(
  db: Db,
  actor: DoctorActor,
  userId: string,
  loginId: string,
): Promise<{ ok: true } | Fail> {
  const denied = adminOnly(actor)
  if (denied) return denied
  const u = await doctorById(db, userId)
  if (!u) return fail('의사를 찾을 수 없습니다.')
  const id = loginId.trim()
  if (!/^\d{4,12}$/.test(id)) return fail('사번은 숫자 4~12자리로 입력해 주세요.')
  if (id === u.employeeNo) return fail('지금과 같은 ID입니다.')
  if (await loginIdTaken(db, id, userId)) return fail('이미 쓰는 로그인 ID입니다.')
  await db
    .update(users)
    .set({ employeeNo: id, loginIdKind: 'employee_no', updatedAt: new Date() })
    .where(eq(users.id, userId))
  return { ok: true }
}

export async function setDoctorRole(
  db: Db,
  actor: DoctorActor,
  userId: string,
  admin: boolean,
): Promise<{ ok: true } | Fail> {
  const denied = adminOnly(actor)
  if (denied) return denied
  if (userId === actor.id && !admin) return fail('자기 자신의 관리자 권한은 뺄 수 없습니다.')
  if (!(await doctorById(db, userId))) return fail('의사를 찾을 수 없습니다.')
  await db
    .update(users)
    .set({ role: admin ? 'admin' : 'nurse', updatedAt: new Date() })
    .where(eq(users.id, userId))
  return { ok: true }
}

// 3-11 8: 입사일·퇴사 예정일 — 재직 기간 밖 날에는 배정하지 않고, 그 달 개수는 재직 날짜 비율
export async function setDoctorEmployment(
  db: Db,
  actor: DoctorActor,
  userId: string,
  input: DoctorEmploymentInput,
): Promise<{ ok: true } | Fail> {
  const denied = adminOnly(actor)
  if (denied) return denied
  const emp = { hireDate: input.hireDate || null, plannedEndDate: input.plannedEndDate || null }
  const empErr = employmentError(emp)
  if (empErr) return fail(empErr)
  if (!(await doctorById(db, userId))) return fail('의사를 찾을 수 없습니다.')
  await db
    .update(users)
    .set({ ...emp, updatedAt: new Date() })
    .where(eq(users.id, userId))
  return { ok: true }
}

export async function reissueDoctorPassword(
  db: Db,
  actor: DoctorActor,
  userId: string,
): Promise<{ ok: true; tempPassword: string } | Fail> {
  const denied = adminOnly(actor)
  if (denied) return denied
  if (!(await doctorById(db, userId))) return fail('의사를 찾을 수 없습니다.')
  const tempPassword = generateTempPassword()
  const passwordHash = await hashPassword(tempPassword)
  await db.transaction(async (tx) => {
    await tx
      .update(credentials)
      .set({ passwordHash, mustChangePassword: true, failedCount: 0, lockedUntil: null })
      .where(eq(credentials.userId, userId))
    await tx.delete(sessions).where(eq(sessions.userId, userId))
  })
  return { ok: true, tempPassword }
}

export async function removeDoctor(db: Db, actor: DoctorActor, userId: string): Promise<{ ok: true } | Fail> {
  const denied = adminOnly(actor)
  if (denied) return denied
  if (userId === actor.id) return fail('자기 자신은 제거할 수 없습니다.')
  if (!(await doctorById(db, userId))) return fail('이미 제거된 의사입니다.')
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ active: false, deactivatedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
    await tx.delete(sessions).where(eq(sessions.userId, userId))
    for (const col of [doctorSwapRequests.requesterId, doctorSwapRequests.targetId])
      await tx
        .update(doctorSwapRequests)
        .set({ status: 'INVALID', closedReason: '의사가 제거되었습니다', closedAt: new Date() })
        .where(and(eq(col, userId), eq(doctorSwapRequests.status, 'PENDING')))
  })
  return { ok: true }
}

export async function saveDoctorRules(
  db: Db,
  actor: DoctorActor,
  input: { params: unknown; baseVersion: number },
): Promise<{ ok: true; version: number } | Fail> {
  const denied = adminOnly(actor)
  if (denied) return denied
  const parsed = DoctorRuleParamsSchema.safeParse(input.params)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? '입력을 확인해 주세요.')
  return db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${doctorRuleVersions} in share row exclusive mode`)
    const cur = await currentDoctorRules(tx)
    if (cur.version !== input.baseVersion)
      return fail('그사이 규칙이 바뀌었습니다. 새로고침 뒤 다시 저장해 주세요.')
    const keys = Object.keys(parsed.data) as (keyof DoctorRuleParams)[]
    // 3-11: 필수/권고·금지 패턴은 객체라 값으로 비교한다
    const same = (k: keyof DoctorRuleParams) =>
      JSON.stringify(cur.params[k]) === JSON.stringify(parsed.data[k])
    const diff = keys
      .filter((k) => !same(k))
      .map((k) => ({ key: k, before: cur.params[k], after: parsed.data[k] }))
    if (diff.length === 0) return fail('바뀐 값이 없습니다.')
    const version = cur.version + 1
    await tx.insert(doctorRuleVersions).values({ version, params: parsed.data, diff, changedBy: actor.id })
    // 아직 확정 전인 달은 새 마감일을 따른다
    for (const p of await tx.select().from(doctorMonthPlans).where(ne(doctorMonthPlans.status, 'CONFIRMED')))
      await tx
        .update(doctorMonthPlans)
        .set(doctorPlanDates(p.year, p.month, parsed.data))
        .where(eq(doctorMonthPlans.id, p.id))
    return { ok: true as const, version }
  })
}
