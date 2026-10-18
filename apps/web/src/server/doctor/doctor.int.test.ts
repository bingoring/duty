// 3-7 의사 근무표 통합 테스트. 솔버 결과는 보장되는 성질(하드 제약·재검사·확정 복사)만 검사한다 —
// 신청을 지켰는지 같은 최적화 품질은 시간·머신에 따라 달라 검사하지 않는다
import { checkDoctorMonth, dayOfWeek, monthDates } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { authenticate, createSession, validateSession } from '../auth/service'
import { doctorMonthPlans, doctorRequests, doctorShiftLogs, doctorSwapRequests, users } from '../db/schema'
import { loadMonthView } from '../schedule/load'
import { seedDev } from '../seed/dev'
import { importDoctorSchedule, importDoctors, parseDoctorCsv } from '../seed/doctors'
import { listStaff } from '../staff/service'
import { confirmedShifts, ensureDoctorPlan, findDoctorPlan, listDoctors } from './core'
import {
  confirmDoctorCandidate,
  doctorMonthInput,
  generateDoctorCandidate,
  loadDoctorGenerate,
} from './generate'
import { loadDoctorRequests, saveDoctorPrefs, saveDoctorRequests, type DoctorActor } from './requests'
import { loadDoctorSchedule } from './schedule'
import { changeDoctorLoginId, createDoctor } from './staff'
import {
  adminEditDoctorShift,
  createDoctorSwap,
  loadDoctorAdjust,
  pendingDoctorSwapCount,
  respondDoctorSwap,
} from './swaps'

const db = setupTestDb()
const OCT = { year: 2026, month: 10 }
const NOV = { year: 2026, month: 11 }
const TODAY = '2026-10-13'
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

describe('3-7a 직군 분리', () => {
  it('간호사 근무표·간호사 관리에는 의사가 없다', async () => {
    const nurse = await db.select().from(users).where(eq(users.employeeNo, '00103'))
    const v = await loadMonthView(db, { ...OCT, viewerId: nurse[0]!.id, today: TODAY })
    expect(v.users.length).toBe(11)
    expect(v.users.every((u) => !u.name.match(/허재민|고은서|노준호|백승우|진하람/))).toBe(true)
    expect((await listStaff(db, TODAY)).length).toBe(11)
    expect((await listDoctors(db)).map((d) => d.name)).toEqual([
      '허재민',
      '고은서',
      '노준호',
      '백승우',
      '진하람',
    ])
  })

  it('의사는 생년월일 ID로 로그인하고 초기 설정 단계가 없다', async () => {
    const now = new Date('2026-10-13T00:00:00Z')
    const r = await authenticate(db, { employeeNo: '820303', password: 'duty-dev-1234', now })
    expect(r.ok).toBe(true)
    const s = await createSession(db, { userId: (r as { userId: string }).userId, keep: false, now })
    const v = await validateSession(db, s.token, now)
    expect(v?.user.roleGroup).toBe('doctor')
    expect(v?.user.loginIdKind).toBe('birthdate')
    expect(v?.pendingStep).toBeNull()
  })

  it('「사번으로 변경」은 ID만 바꾸고 근무 기록은 그대로', async () => {
    const admin = await doc('800101')
    const target = await doc('830404')
    const before = (await confirmedShifts(db, (await findDoctorPlan(db, OCT))!.id)).filter(
      (s) => s.day === target.id,
    ).length
    ok(await changeDoctorLoginId(db, admin, target.id, '20260001'))
    const [u] = await db.select().from(users).where(eq(users.id, target.id))
    expect(u!.employeeNo).toBe('20260001')
    expect(u!.loginIdKind).toBe('employee_no')
    const after = (await confirmedShifts(db, (await findDoctorPlan(db, OCT))!.id)).filter(
      (s) => s.day === target.id,
    ).length
    expect(after).toBe(before)
    // 간호사 사번과 겹치면 거부
    expect((await changeDoctorLoginId(db, admin, target.id, '00103')).ok).toBe(false)
    expect((await changeDoctorLoginId(db, await doc('810202'), target.id, '20260002')).ok).toBe(false)
  })

  it('의사 추가는 임시 비밀번호·첫 로그인 변경', async () => {
    const r = ok(
      await createDoctor(db, await doc('800101'), { loginId: '850606', name: '가나다', admin: false }),
    )
    const a = await authenticate(db, { employeeNo: '850606', password: r.tempPassword, now: new Date() })
    expect(a).toMatchObject({ ok: true, mustChangePassword: true })
  })
})

describe('3-7a 가져오기', () => {
  it('CSV 검증: 머리글·역할·중복', () => {
    expect(parseDoctorCsv('login_id,name,role\n800101,가,admin\n800102,나,doctor').ok).toBe(true)
    expect(parseDoctorCsv('id,name\n1,가').ok).toBe(false)
    expect(parseDoctorCsv('login_id,name,role\n800101,가,boss').ok).toBe(false)
    expect(parseDoctorCsv('login_id,name,role\n800101,가,admin\n800101,나,doctor').ok).toBe(false)
  })

  it('간호사 사번과 겹치는 로그인 ID는 거부한다', async () => {
    await expect(
      importDoctors(db, [{ loginId: '00103', name: '가', role: 'nurse', loginIdKind: 'employee_no' }]),
    ).rejects.toThrow('간호사')
  })

  it('10월 확정본(가명) — 31일 확정, +1 대상 = D 백승우·N 진하람', async () => {
    const plan = (await findDoctorPlan(db, OCT))!
    expect(plan.status).toBe('CONFIRMED')
    expect((await confirmedShifts(db, plan.id)).length).toBe(31)
    const names = new Map((await listDoctors(db)).map((d) => [d.id, d.name]))
    expect(plan.extras.D.map((id) => names.get(id))).toEqual(['백승우'])
    expect(plan.extras.N.map((id) => names.get(id))).toEqual(['진하람'])
    const v = await loadDoctorSchedule(db, { ...OCT, viewerId: (await doc('820303')).id, today: TODAY })
    expect(v.badge).toBe('확정 · 담당 허재민')
    expect(v.calendar.tally.find((t) => t.name === '백승우')).toMatchObject({ D: 7, N: 6, extra: ['D +1'] })
    expect(v.calendar.next.length).toBe(4)
  })

  it('이미 있는 달은 --replace 없이 덮어쓰지 않고, 모르는 이름은 거부한다', async () => {
    const file = JSON.parse(
      readFileSync(new URL('../../../../../fixtures/doctor-2026-10.json', import.meta.url), 'utf8'),
    )
    expect((await importDoctorSchedule(db, file)).ok).toBe(false)
    expect((await importDoctorSchedule(db, file, { replace: true })).ok).toBe(true)
    const bad = {
      ...file,
      shifts: file.shifts.map((s: { date: string }, i: number) => (i === 0 ? { ...s, day: '없는사람' } : s)),
    }
    const r = await importDoctorSchedule(db, bad, { replace: true })
    expect(r.ok).toBe(false)
  })
})

describe('3-7c 신청·조건', () => {
  it('고정 조건과 부딪히는 신청은 묻고, 확인하면 그 날만 예외로 저장한다', async () => {
    const no = await doc('820303') // 노준호: 일요일 근무 금지
    const sunday = monthDates(2026, 11).find((d) => dayOfWeek(d) === 0)!
    const item = { date: sunday, options: ['D' as const], comment: '학회 대신' }
    const r = await saveDoctorRequests(
      db,
      no,
      { ...NOV, userId: no.id, items: [item], exceptions: [] },
      TODAY,
    )
    expect(r).toEqual({ ok: false, conflicts: [{ date: sunday, labels: ['일요일 근무 금지'] }] })
    ok(
      await saveDoctorRequests(db, no, { ...NOV, userId: no.id, items: [item], exceptions: [sunday] }, TODAY),
    )
    const [row] = await db.select().from(doctorRequests).where(eq(doctorRequests.userId, no.id))
    expect(row).toMatchObject({ options: ['D'], fixedException: true, byAdmin: false })
    // 예외로 한 날은 생성 입력의 고정 조건에서 빠진다
    const plan = await ensureDoctorPlan(db, NOV)
    const input = await doctorMonthInput(db, NOV, plan.extras)
    expect(input.check.find((d) => d.id === no.id)!.fixed.some((f) => f.date === sunday)).toBe(false)
  })

  it('복수 신청(or)은 조건 하나라도 지키면 충돌이 아니다, 코멘트는 다른 의사에게 안 보인다', async () => {
    const no = await doc('820303')
    const sunday = monthDates(2026, 11).find((d) => dayOfWeek(d) === 0)!
    ok(
      await saveDoctorRequests(
        db,
        no,
        {
          ...NOV,
          userId: no.id,
          items: [{ date: sunday, options: ['D', 'O'], comment: '비밀' }],
          exceptions: [],
        },
        TODAY,
      ),
    )
    const other = await doc('810202')
    const v = await loadDoctorRequests(db, { ...NOV, actor: other, userId: other.id, today: TODAY })
    expect(v.others[sunday]).toContainEqual({ name: '노준호', text: 'D/O', fixed: false })
    expect(JSON.stringify(v.others)).not.toContain('비밀')
    // 진하람 토요일 Night 필수가 「진하람 N · 고정」으로 보인다
    const sat = monthDates(2026, 11).find((d) => dayOfWeek(d) === 6)!
    expect(v.others[sat]).toContainEqual({ name: '진하람', text: 'N · 고정', fixed: true })
  })

  it('신청 마감(10/20) 뒤에는 본인은 못 바꾸고 관리자는 바꾼다, 남의 신청은 관리자만', async () => {
    const go = await doc('810202')
    const admin = await doc('800101')
    const item = { date: '2026-11-03', options: ['O' as const], comment: null }
    const input = { ...NOV, userId: go.id, items: [item], exceptions: [] }
    expect((await saveDoctorRequests(db, go, input, '2026-10-21')).ok).toBe(false)
    expect((await saveDoctorRequests(db, await doc('820303'), input, TODAY)).ok).toBe(false)
    ok(await saveDoctorRequests(db, admin, input, '2026-10-21'))
    const [row] = await db.select().from(doctorRequests).where(eq(doctorRequests.userId, go.id))
    expect(row!.byAdmin).toBe(true)
  })

  it('내 근무 조건 저장 — 범위 검증, 남의 조건은 관리자만', async () => {
    const go = await doc('810202')
    ok(await saveDoctorPrefs(db, go, go.id, { allDayMin: 1, allDayMax: 2, fixedRules: [] }))
    expect((await saveDoctorPrefs(db, go, go.id, { allDayMin: 3, allDayMax: 2, fixedRules: [] })).ok).toBe(
      false,
    )
    expect(
      (await saveDoctorPrefs(db, await doc('820303'), go.id, { allDayMin: 0, allDayMax: 0, fixedRules: [] }))
        .ok,
    ).toBe(false)
  })
})

describe('3-7d 생성·확정', { timeout: 60_000 }, () => {
  it('생성안은 매일 D1·N1·개수·고정 조건을 지키고, 확정하면 안의 칸이 그대로 근무표가 된다', async () => {
    const admin = await doc('800101')
    const g = ok(await generateDoctorCandidate(db, admin, NOV, { seed: 7, timeLimitSec: 4 }))
    const v = await loadDoctorGenerate(db, NOV, g.candidateId)
    expect(v.picked!.check.hard).toEqual([])
    const shifts = v.picked!.shifts
    expect(shifts.length).toBe(30)
    // 도메인 검사기로 다시: 하드 위반 없음(노준호 일요일 근무 없음, 진하람 토요일 Night)
    const r = checkDoctorMonth({ ...NOV, doctors: v.check, shifts, mode: 'generate' })
    expect(r.hard).toEqual([])
    const no = await doc('820303')
    const jin = await doc('840505')
    for (const s of shifts) {
      if (dayOfWeek(s.date) === 0) expect([s.day, s.night]).not.toContain(no.id)
      if (dayOfWeek(s.date) === 6) expect(s.night).toBe(jin.id)
    }
    expect((await findDoctorPlan(db, NOV))!.status).toBe('DRAFTING')

    const g2 = ok(await generateDoctorCandidate(db, admin, NOV, { seed: 8, timeLimitSec: 4 }))
    expect(g2.generationNo).toBe(2)
    ok(await confirmDoctorCandidate(db, admin, g.candidateId))
    const plan = (await findDoctorPlan(db, NOV))!
    expect(plan).toMatchObject({
      status: 'CONFIRMED',
      confirmedCandidateId: g.candidateId,
      confirmedBy: admin.id,
    })
    expect(await confirmedShifts(db, plan.id)).toEqual(shifts)
    expect((await confirmDoctorCandidate(db, admin, g2.candidateId)).ok).toBe(false)
    expect((await generateDoctorCandidate(db, admin, NOV)).ok).toBe(false)
    // 확정되면 간호사 화면(의사 탭)에도 보인다
    expect((await loadDoctorSchedule(db, { ...NOV, viewerId: null, today: TODAY })).confirmed).toBe(true)
  })

  it('의사(관리자 아님)는 생성할 수 없다, 확정 전 달은 근무표에 안 보인다', async () => {
    expect((await generateDoctorCandidate(db, await doc('810202'), NOV)).ok).toBe(false)
    expect((await loadDoctorSchedule(db, { ...NOV, viewerId: null, today: TODAY })).confirmed).toBe(false)
  })

  it('고정 조건끼리 부딪히면 원인 날짜와 함께 생성 불가', async () => {
    const admin = await doc('800101')
    const go = await doc('810202')
    // 고은서도 토요일 Night 필수 → 진하람과 부딪힌다
    ok(
      await saveDoctorPrefs(db, go, go.id, {
        allDayMin: null,
        allDayMax: null,
        fixedRules: [{ id: 'x', weekday: 6, shift: 'N', type: 'require', enabled: true }],
      }),
    )
    const r = await generateDoctorCandidate(db, admin, NOV, { seed: 1, timeLimitSec: 4 })
    expect(r.ok).toBe(false)
    expect((r as { message: string }).message).toContain('고정 조건')
  })

  it('12월(31일) 기본 ±1 대상은 10월 다음 순서 — D 허재민·N 고은서', async () => {
    const plan = await ensureDoctorPlan(db, { year: 2026, month: 12 })
    const names = new Map((await listDoctors(db)).map((d) => [d.id, d.name]))
    expect({ D: plan.extras.D.map((i) => names.get(i)), N: plan.extras.N.map((i) => names.get(i)) }).toEqual({
      D: ['허재민'],
      N: ['고은서'],
    })
    // 신청 마감·조정 마감 = 11/20·11/25
    expect(plan).toMatchObject({ requestDeadline: '2026-11-20', negotiationEnd: '2026-11-25' })
  })
})

describe('3-7e 조정·교환', () => {
  const chip = (date: string, slot: 'D' | 'N') => ({ date, slot })

  it('교환 요청 → 받는 사람 배지 → 수락하면 맞바뀌고 기록이 남는다', async () => {
    // 10/22 Day 백승우, 10/23 Day 진하람
    const baek = await doc('830404')
    const jin = await doc('840505')
    const r = ok(
      await createDoctorSwap(db, baek, OCT, chip('2026-10-22', 'D'), chip('2026-10-23', 'D'), '부탁', TODAY),
    )
    expect(await pendingDoctorSwapCount(db, jin.id, TODAY)).toBe(1)
    const view = await loadDoctorAdjust(db, OCT, jin, TODAY)
    expect(view.swaps[0]).toMatchObject({ received: true, status: 'PENDING', requester: '백승우' })
    ok(await respondDoctorSwap(db, jin, r.id, true, TODAY))
    const plan = (await findDoctorPlan(db, OCT))!
    const rows = await confirmedShifts(db, plan.id)
    expect(rows.find((s) => s.date === '2026-10-22')!.day).toBe(jin.id)
    expect(rows.find((s) => s.date === '2026-10-23')!.day).toBe(baek.id)
    expect((await db.select().from(doctorShiftLogs).where(eq(doctorShiftLogs.planId, plan.id))).length).toBe(
      2,
    )
    const marks = (await loadDoctorAdjust(db, OCT, jin, TODAY)).marks
    expect(marks['2026-10-22:D']).toBe('swap')
    expect(marks['2026-10-22:N']).toBeUndefined()
  })

  it('고정 조건을 깨는 교환은 보낼 수 없다 (노준호 일요일)', async () => {
    // 10/18(일) Day 고은서 ↔ 노준호 10/20 Day
    const no = await doc('820303')
    const r = await createDoctorSwap(
      db,
      no,
      OCT,
      chip('2026-10-20', 'D'),
      chip('2026-10-18', 'D'),
      null,
      TODAY,
    )
    expect(r.ok).toBe(false)
    expect((r as { message: string }).message).toContain('일요일 근무 금지')
  })

  it('내 칩이 아니거나 지난 날짜면 거부, 그사이 바뀐 요청은 수락할 때 무효', async () => {
    const go = await doc('810202')
    const baek = await doc('830404')
    expect(
      (await createDoctorSwap(db, go, OCT, chip('2026-10-22', 'D'), chip('2026-10-23', 'D'), null, TODAY)).ok,
    ).toBe(false)
    expect(
      (await createDoctorSwap(db, baek, OCT, chip('2026-10-02', 'D'), chip('2026-10-23', 'D'), null, TODAY))
        .ok,
    ).toBe(false)
    const r = ok(
      await createDoctorSwap(db, baek, OCT, chip('2026-10-22', 'D'), chip('2026-10-23', 'D'), null, TODAY),
    )
    // 관리자가 10/23 Day를 고은서로 바꾸면 대기 요청은 무효
    ok(
      await adminEditDoctorShift(
        db,
        await doc('800101'),
        OCT,
        { kind: 'assign', chip: chip('2026-10-23', 'D'), userId: go.id },
        null,
      ),
    )
    const [q] = await db.select().from(doctorSwapRequests).where(eq(doctorSwapRequests.id, r.id))
    expect(q!.status).toBe('INVALID')
  })

  it('관리자 편집이 필수 규칙을 깨면 사유가 있어야 적용된다', async () => {
    const admin = await doc('800101')
    const no = await doc('820303')
    const edit = { kind: 'assign' as const, chip: chip('2026-10-18', 'N'), userId: no.id }
    const r = await adminEditDoctorShift(db, admin, OCT, edit, null)
    expect(r).toMatchObject({ ok: false, needNote: true })
    ok(await adminEditDoctorShift(db, admin, OCT, edit, '본인 요청'))
    const [log] = await db
      .select()
      .from(doctorShiftLogs)
      .where(and(eq(doctorShiftLogs.date, '2026-10-18'), eq(doctorShiftLogs.reason, 'admin')))
    expect(log!.note).toBe('본인 요청')
    expect((await adminEditDoctorShift(db, await doc('810202'), OCT, edit, 'x')).ok).toBe(false)
  })

  it('확정 전 달은 조정할 수 없다', async () => {
    await db.update(doctorMonthPlans).set({ status: 'DRAFTING' }).where(eq(doctorMonthPlans.year, 2026))
    const baek = await doc('830404')
    expect(
      (await createDoctorSwap(db, baek, OCT, chip('2026-10-22', 'D'), chip('2026-10-23', 'D'), null, TODAY))
        .ok,
    ).toBe(false)
  })
})
