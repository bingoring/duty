// 3-7a 의사 명단·확정 근무표 가져오기. 실명·생년월일 파일은 .local/(gitignore)에 둔다 — 저장소에는 가명만.
import { EmployeeNoSchema, isIsoDate, monthDates, type DoctorShiftRow } from '@duty/domain'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { hashPassword } from '../auth/password'
import { generateTempPassword } from '../auth/tokens'
import { credentials, doctorMonthPlans, doctorShifts, users } from '../db/schema'
import { currentDoctorRules, ensureDoctorRuleV1, findDoctorPlan, listDoctors } from '../doctor/core'
import { DOCTORS } from '../role-group'
import { ensureWard, type DbOrTx } from './core'

export const DOCTOR_HEADER = ['login_id', 'name', 'role'] as const

export type DoctorRow = { loginId: string; name: string; role: 'admin' | 'nurse'; loginIdKind: string }

const RowSchema = z.object({
  login_id: EmployeeNoSchema,
  name: z.string().trim().min(1).max(20),
  // 의사 관리자 = admin, 그 밖의 의사 = doctor
  role: z.enum(['admin', 'doctor']),
})

const unquote = (cell: string) => cell.trim().replace(/^"(.*)"$/, '$1')

// 생년월일 6자리면 「생년월일」 ID, 아니면 사번으로 본다
export const loginIdKindOf = (id: string) => (/^\d{6}$/.test(id) ? 'birthdate' : 'employee_no')

export function parseDoctorCsv(text: string): { ok: true; rows: DoctorRow[] } | { ok: false; errors: string[] } {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
  const header = lines[0]?.split(',').map(unquote)
  if (!header || header.join(',') !== DOCTOR_HEADER.join(','))
    return { ok: false, errors: [`첫 줄은 ${DOCTOR_HEADER.join(',')} 이어야 합니다`] }
  const errors: string[] = []
  const rows: DoctorRow[] = []
  const seen = new Set<string>()
  lines.slice(1).forEach((line, i) => {
    const cells = line.split(',').map(unquote)
    const r = RowSchema.safeParse(Object.fromEntries(DOCTOR_HEADER.map((h, j) => [h, cells[j] ?? ''])))
    if (!r.success) {
      errors.push(`${i + 2}번째 줄: ${r.error.issues.map((x) => x.path.join('.')).join(', ')} 확인`)
      return
    }
    if (seen.has(r.data.login_id)) errors.push(`${i + 2}번째 줄: 로그인 ID가 겹칩니다`)
    seen.add(r.data.login_id)
    rows.push({
      loginId: r.data.login_id,
      name: r.data.name,
      role: r.data.role === 'admin' ? 'admin' : 'nurse',
      loginIdKind: loginIdKindOf(r.data.login_id),
    })
  })
  return errors.length ? { ok: false, errors } : { ok: true, rows }
}

export type DoctorImportResult = {
  created: { loginId: string; name: string; tempPassword: string }[]
  updated: number
}

// 로그인 ID로 맞춘다. 있으면 이름·역할·표 순서만 갱신(비밀번호는 그대로), 없으면 임시 비밀번호로 만든다
export async function importDoctors(
  db: DbOrTx,
  rows: DoctorRow[],
  opts: { password?: string; mustChange?: boolean } = {},
): Promise<DoctorImportResult> {
  const prepared = await Promise.all(
    rows.map(async (r) => {
      const tempPassword = opts.password ?? generateTempPassword()
      return { row: r, tempPassword, passwordHash: await hashPassword(tempPassword) }
    }),
  )
  const run = async (tx: DbOrTx) => {
    const wardId = await ensureWard(tx)
    await ensureDoctorRuleV1(tx)
    const existing = await tx
      .select({ id: users.id, no: users.employeeNo, group: users.roleGroup })
      .from(users)
      .where(
        inArray(
          users.employeeNo,
          rows.map((r) => r.loginId),
        ),
      )
    const nurse = existing.find((u) => u.group !== 'doctor')
    if (nurse) throw new Error(`로그인 ID ${nurse.no}는 간호사 사번과 겹칩니다`)
    const byNo = new Map(existing.map((u) => [u.no, u.id]))
    const result: DoctorImportResult = { created: [], updated: 0 }
    for (const [i, { row, tempPassword, passwordHash }] of prepared.entries()) {
      const attrs = { name: row.name, role: row.role, seniorityRank: i + 1, updatedAt: new Date() }
      const id = byNo.get(row.loginId)
      if (id) {
        await tx.update(users).set(attrs).where(eq(users.id, id))
        result.updated++
        continue
      }
      const [u] = await tx
        .insert(users)
        .values({
          ...attrs,
          wardId,
          employeeNo: row.loginId,
          loginIdKind: row.loginIdKind,
          roleGroup: 'doctor',
          rotation: 'rotating',
          seniorityTier: 'senior',
        })
        .returning({ id: users.id })
      await tx
        .insert(credentials)
        .values({ userId: u!.id, passwordHash, mustChangePassword: opts.mustChange ?? true })
      result.created.push({ loginId: row.loginId, name: row.name, tempPassword })
    }
    return result
  }
  return 'transaction' in db ? db.transaction(run) : run(db)
}

// ── 확정 근무표 가져오기 (첫 달 전 달 확정본, Q1) ─────────────────────────
const ScheduleFileSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  shifts: z.array(z.object({ date: z.string(), day: z.string().min(1), night: z.string().min(1) })),
})

export type ScheduleImportResult =
  | { ok: true; year: number; month: number; days: number; counts: { name: string; D: number; N: number }[] }
  | { ok: false; errors: string[] }

// day·night = 성명 또는 로그인 ID. 모든 날이 있어야 하고 그 달 계획은 확정(CONFIRMED)으로 만든다
export async function importDoctorSchedule(
  db: DbOrTx,
  file: unknown,
  opts: { replace?: boolean; actorId?: string | null } = {},
): Promise<ScheduleImportResult> {
  const parsed = ScheduleFileSchema.safeParse(file)
  if (!parsed.success) return { ok: false, errors: ['형식: { month: "YYYY-MM", shifts: [{ date, day, night }] }'] }
  const [year, month] = parsed.data.month.split('-').map(Number) as [number, number]
  const doctors = await listDoctors(db, { includeInactive: true })
  const idOf = (key: string) => {
    const hit = doctors.filter((d) => d.loginId === key || d.name === key)
    return hit.length === 1 ? hit[0]!.id : null
  }
  const days = monthDates(year, month)
  const errors: string[] = []
  const rows: DoctorShiftRow[] = []
  const byDate = new Map(parsed.data.shifts.map((s) => [s.date, s]))
  if (parsed.data.shifts.some((s) => !isIsoDate(s.date) || !s.date.startsWith(parsed.data.month)))
    errors.push('그 달이 아닌 날짜가 있습니다')
  for (const d of days) {
    const s = byDate.get(d)
    if (!s) {
      errors.push(`${d}: 없음`)
      continue
    }
    const day = idOf(s.day)
    const night = idOf(s.night)
    if (!day) errors.push(`${d} Day: 의사를 찾을 수 없습니다(${s.day.length}글자)`)
    if (!night) errors.push(`${d} Night: 의사를 찾을 수 없습니다(${s.night.length}글자)`)
    if (day && night) rows.push({ date: d, day, night })
  }
  if (errors.length) return { ok: false, errors }

  const existing = await findDoctorPlan(db, { year, month })
  if (existing && !opts.replace) return { ok: false, errors: [`${parsed.data.month} 계획이 이미 있습니다(--replace로 덮어쓰기)`] }
  const { version, params } = await currentDoctorRules(db)
  const counts = doctors.map((doc) => ({
    id: doc.id,
    name: doc.name,
    D: rows.filter((r) => r.day === doc.id).length,
    N: rows.filter((r) => r.night === doc.id).length,
  }))
  // 기준보다 많이 한 사람 = 그 달 +1 대상 (다음 31일 달 순환의 기준)
  const extras = {
    D: counts.filter((c) => c.D > params.dPerMonth).map((c) => c.id),
    N: counts.filter((c) => c.N > params.nPerMonth).map((c) => c.id),
  }
  const now = new Date()
  const run = async (tx: DbOrTx) => {
    let planId = existing?.id
    if (planId) {
      await tx.delete(doctorShifts).where(eq(doctorShifts.planId, planId))
      await tx
        .update(doctorMonthPlans)
        .set({ status: 'CONFIRMED', extras, ruleVersion: version, confirmedAt: now, confirmedBy: opts.actorId ?? null })
        .where(eq(doctorMonthPlans.id, planId))
    } else {
      const [p] = await tx
        .insert(doctorMonthPlans)
        .values({
          year,
          month,
          status: 'CONFIRMED',
          requestDeadline: days[0]!,
          negotiationEnd: days[0]!,
          extras,
          ruleVersion: version,
          confirmedAt: now,
          confirmedBy: opts.actorId ?? null,
        })
        .returning({ id: doctorMonthPlans.id })
      planId = p!.id
    }
    await tx.insert(doctorShifts).values(
      rows.map((r) => ({ planId: planId!, date: r.date, dayUser: r.day!, nightUser: r.night!, source: 'imported' })),
    )
  }
  await ('transaction' in db ? db.transaction(run) : run(db))
  return {
    ok: true,
    year,
    month,
    days: rows.length,
    counts: counts.filter((c) => c.D + c.N > 0).map(({ name, D, N }) => ({ name, D, N })),
  }
}

export async function doctorCount(db: DbOrTx): Promise<number> {
  return (await db.select({ id: users.id }).from(users).where(DOCTORS)).length
}
