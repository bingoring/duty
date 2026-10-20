// 3-11 의사 규칙 통합 테스트 — 필수/권고·금지 패턴(규칙 버전), 격주 고정 조건, 재직 기간(비례 개수·배정 금지)
import { DEFAULT_DOCTOR_RULES, checkDoctorMonth, dayOfWeek, monthDates, weekOfMonth } from '@duty/domain'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { doctorRuleVersions, users } from '../db/schema'
import { seedDev } from '../seed/dev'
import { currentDoctorRules, ensureDoctorPlan, listDoctors, needFor, targetsFor } from './core'
import { doctorMonthInput, generateDoctorCandidate, loadDoctorGenerate } from './generate'
import { saveDoctorPrefs, type DoctorActor } from './requests'
import { createDoctor, loadDoctorStaff, saveDoctorRules, setDoctorEmployment } from './staff'

const db = setupTestDb()
const NOV = { year: 2026, month: 11 }
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(JSON.stringify(r))
  return r as Extract<T, { ok: true }>
}

async function doc(loginId: string): Promise<DoctorActor & { name: string }> {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, loginId))
  return { id: u!.id, role: u!.role === 'admin' ? 'admin' : 'member', name: u!.name }
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('3-11 6/7·10 필수/권고·금지 패턴', () => {
  it('예전 규칙 버전은 기본값으로 읽고, 바꾸면 새 버전에 diff와 함께 저장한다', async () => {
    const admin = await doc('800101')
    const cur = await currentDoctorRules(db)
    expect(cur.params.severity).toEqual(DEFAULT_DOCTOR_RULES.severity)
    expect(cur.params.patterns).toEqual(DEFAULT_DOCTOR_RULES.patterns)
    const params = {
      ...cur.params,
      severity: { ...cur.params.severity, REQUEST: 'hard' as const },
      patterns: [
        ...cur.params.patterns,
        { pattern: ['N', 'O', 'D'] as ('N' | 'O' | 'D')[], severity: 'soft' as const },
      ],
    }
    const r = ok(await saveDoctorRules(db, admin, { params, baseVersion: cur.version }))
    const [row] = await db.select().from(doctorRuleVersions).where(eq(doctorRuleVersions.version, r.version))
    expect(row!.diff.map((d) => d.key).sort()).toEqual(['patterns', 'severity'])
    expect((await currentDoctorRules(db)).params.severity.REQUEST).toBe('hard')
    // 같은 값으로 다시 저장하면 바뀐 것이 없다(객체도 값으로 비교)
    expect((await saveDoctorRules(db, admin, { params, baseVersion: r.version })).ok).toBe(false)
    // 같은 패턴 두 번은 거부
    const dup = { ...params, patterns: [...params.patterns, params.patterns[0]!] }
    expect((await saveDoctorRules(db, admin, { params: dup, baseVersion: r.version })).ok).toBe(false)
  })

  it(
    '생성 입력에 규칙의 필수/권고·금지 패턴이 실리고, 생성안은 필수 패턴을 지킨다',
    { timeout: 60_000 },
    async () => {
      const admin = await doc('800101')
      const plan = await ensureDoctorPlan(db, NOV)
      const input = await doctorMonthInput(db, NOV, plan.extras)
      expect(input.checkCtx.patterns).toEqual(DEFAULT_DOCTOR_RULES.patterns)
      // 10월 확정본의 마지막 사흘이 월초 패턴 검사에 들어간다
      expect(input.prevShifts.map((s) => s.date)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31'])
      const g = ok(await generateDoctorCandidate(db, admin, NOV, { seed: 3, timeLimitSec: 4 }))
      const v = await loadDoctorGenerate(db, NOV, g.candidateId)
      const r = checkDoctorMonth({
        ...NOV,
        doctors: v.check,
        shifts: v.picked!.shifts,
        mode: 'generate',
        ...input.checkCtx,
      })
      expect(r.hard).toEqual([])
    },
  )
})

describe('3-11 3 격주 고정 조건', () => {
  it('홀수 주 조건은 그 주에만 펼쳐지고, 의사 관리에 「홀수 주」로 보인다', async () => {
    const go = await doc('810202')
    ok(
      await saveDoctorPrefs(db, go, go.id, {
        allDayMin: null,
        allDayMax: null,
        fixedRules: [{ id: 'odd-mon', weekday: 1, shift: 'D', type: 'forbid', enabled: true, cycle: 'odd' }],
      }),
    )
    const plan = await ensureDoctorPlan(db, NOV)
    const input = await doctorMonthInput(db, NOV, plan.extras)
    const dates = input.check.find((d) => d.id === go.id)!.fixed.map((f) => f.date)
    const mondays = monthDates(2026, 11).filter((d) => dayOfWeek(d) === 1)
    expect(dates).toEqual(mondays.filter((d) => weekOfMonth(d) % 2 === 1))
    const staff = await loadDoctorStaff(db)
    expect(staff.find((s) => s.id === go.id)!.fixed).toEqual(['홀수 주 월요일 Day 금지'])
  })
})

describe('3-11 8 재직 기간', () => {
  it('입사일·퇴사 예정일 검사, 추가·변경', async () => {
    const admin = await doc('800101')
    const bad = await createDoctor(db, admin, {
      loginId: '900101',
      name: '가나다',
      admin: false,
      hireDate: '2026-11-20',
      plannedEndDate: '2026-11-10',
    })
    expect(bad.ok).toBe(false)
    ok(
      await createDoctor(db, admin, {
        loginId: '900101',
        name: '가나다',
        admin: false,
        hireDate: '2026-11-16',
        plannedEndDate: null,
      }),
    )
    const added = (await listDoctors(db)).find((d) => d.loginId === '900101')!
    expect(added).toMatchObject({ hireDate: '2026-11-16', plannedEndDate: null })
    const go = await doc('810202')
    expect((await setDoctorEmployment(db, go, added.id, { hireDate: null, plannedEndDate: null })).ok).toBe(
      false,
    )
    ok(
      await setDoctorEmployment(db, admin, added.id, {
        hireDate: '2026-11-16',
        plannedEndDate: '2027-02-28',
      }),
    )
    expect((await loadDoctorStaff(db)).find((s) => s.id === added.id)).toMatchObject({
      hireDate: '2026-11-16',
      plannedEndDate: '2027-02-28',
    })
  })

  it(
    '그 달 일부만 재직하면 개수는 비율, 합은 날짜 수, 기간 밖에는 배정하지 않는다',
    { timeout: 60_000 },
    async () => {
      const admin = await doc('800101')
      const jin = await doc('840505')
      // 진하람 11/16 입사 → 15/30일 → D·N 3, 나머지 4명이 27개를 나눈다
      ok(await setDoctorEmployment(db, admin, jin.id, { hireDate: '2026-11-16', plannedEndDate: null }))
      const docs = await listDoctors(db)
      const { params } = await currentDoctorRules(db)
      expect(needFor(NOV, docs, params)).toEqual({ D: 3, N: 3 })
      const plan = await ensureDoctorPlan(db, NOV)
      // 기본 ±1 대상은 한 달 내내 재직하는 의사에서 고른다
      expect(plan.extras.D).not.toContain(jin.id)
      expect(plan.extras.D.length).toBe(3)
      const t = targetsFor(NOV, docs, params, plan.extras)
      expect(t.get(jin.id)).toEqual({ D: 3, N: 3 })
      expect([...t.values()].reduce((s, x) => s + x.D, 0)).toBe(30)
      expect([...t.values()].reduce((s, x) => s + x.N, 0)).toBe(30)
      const g = ok(await generateDoctorCandidate(db, admin, NOV, { seed: 5, timeLimitSec: 4 }))
      const v = await loadDoctorGenerate(db, NOV, g.candidateId)
      expect(v.picked!.check.hard).toEqual([])
      for (const s of v.picked!.shifts)
        if (s.date < '2026-11-16') expect([s.day, s.night]).not.toContain(jin.id)
    },
  )
})
