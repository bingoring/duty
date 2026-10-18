// 3-7 개발 시드: 의사 5명(가명·가상 로그인 ID, 핸드오프 저장소 사본과 같음)과 2026-10 확정 근무표(가명).
// 실명·생년월일은 절대 넣지 않는다(공개 저장소). 운영은 db:import-doctors · db:import-doctor-schedule
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { doctorPrefs, privacyConsents, users } from '../db/schema'
import type { DbOrTx } from './core'
import { importDoctorSchedule, importDoctors, type DoctorRow } from './doctors'

const FIXTURE = fileURLToPath(new URL('../../../../../fixtures/doctor-2026-10.json', import.meta.url))

const doc = (loginId: string, name: string, admin = false): DoctorRow => ({
  loginId,
  name,
  role: admin ? 'admin' : 'nurse',
  loginIdKind: 'birthdate',
})

export const DEV_DOCTORS: DoctorRow[] = [
  doc('800101', '허재민', true),
  doc('810202', '고은서'),
  doc('820303', '노준호'),
  doc('830404', '백승우'),
  doc('840505', '진하람'),
]

export async function seedDevDoctors(tx: DbOrTx, password: string, consentVersion: string) {
  const r = await importDoctors(tx, DEV_DOCTORS, { password, mustChange: false })
  const now = new Date()
  for (const c of r.created) {
    const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.employeeNo, c.loginId))
    await tx.insert(privacyConsents).values({ userId: u!.id, version: consentVersion, requiredAt: now, sensitiveAt: now })
  }
  if (r.created.length === 0) return
  const id = async (no: string) =>
    (await tx.select({ id: users.id }).from(users).where(eq(users.employeeNo, no)))[0]!.id
  // 핸드오프 예시: 노준호 일요일 근무 금지, 진하람 토요일 Night 필수, 고은서 올데이 2~3
  await tx.insert(doctorPrefs).values([
    {
      userId: await id('820303'),
      allDayMin: null,
      allDayMax: null,
      fixedRules: [{ id: 'sun-off', weekday: 0, shift: 'ANY', type: 'forbid', enabled: true }],
    },
    {
      userId: await id('840505'),
      allDayMin: null,
      allDayMax: null,
      fixedRules: [{ id: 'sat-n', weekday: 6, shift: 'N', type: 'require', enabled: true }],
    },
    { userId: await id('810202'), allDayMin: 2, allDayMax: 3, fixedRules: [] },
  ])
  const sched = await importDoctorSchedule(tx, JSON.parse(readFileSync(FIXTURE, 'utf8')))
  if (!sched.ok) throw new Error(`의사 시드 근무표: ${sched.errors.join(', ')}`)
}
