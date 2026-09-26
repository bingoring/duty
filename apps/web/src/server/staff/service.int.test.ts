import { DEFAULT_RULES } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { authenticate, createSession } from '../auth/service'
import { verifyPassword } from '../auth/password'
import { balanceEntries, credentials, sessions, trainings, users } from '../db/schema'
import { seedDev } from '../seed/dev'
import { adjustBalances, createStaff, listStaff, reissuePassword, removeStaff, updateStaff } from './service'

const db = setupTestDb()
const TODAY = '2026-10-13'
const NOW = new Date('2026-10-13T09:00:00+09:00')

async function idOf(no: string) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.employeeNo, no))
  return u!.id
}
async function ctx() {
  return { adminId: await idOf('00101'), today: TODAY, rules: DEFAULT_RULES }
}
const base = {
  employeeNo: '00120',
  name: '신입가',
  hireDate: '2026-10-01',
  kTass: false,
  seniorityTier: 'junior' as const,
  unionMember: false,
  rotation: 'rotating' as const,
  role: 'nurse' as const,
  annualLeave: 0,
  nightBank: 0,
  offCarry: 0,
}
const { employeeNo: _no, annualLeave: _a, nightBank: _n, offCarry: _o, ...updateBase } = base
void [_no, _a, _n, _o]

async function ledger(userId: string) {
  const rows = await db.select().from(balanceEntries).where(eq(balanceEntries.userId, userId))
  return rows.map((r) => [r.account, Number(r.delta), r.reason]).sort()
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('listStaff', () => {
  it('활성 11명, 표 순서, 수간호사 역할 표기', async () => {
    const rows = await listStaff(db, TODAY)
    expect(rows).toHaveLength(11)
    expect(rows[0]).toMatchObject({
      name: '한수정',
      roleLabel: '수간호사 · 관리자',
      years: null,
      trainingText: '—',
    })
    expect(rows[2]!.balances.off_carry).toBe(4)
  })
})

describe('createStaff (R-STAFF-ADD-1~5)', () => {
  it('계정·임시 비밀번호(해시만 저장)·표 맨 아래·초기 원장과 자동 부여', async () => {
    const r = await createStaff(db, { ...base, annualLeave: 15, nightBank: 2, offCarry: -1 }, await ctx())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tempPassword).toHaveLength(12)
    const [u] = await db.select().from(users).where(eq(users.id, r.userId))
    expect(u!.seniorityRank).toBe(12)
    const [c] = await db.select().from(credentials).where(eq(credentials.userId, r.userId))
    expect(c!.mustChangePassword).toBe(true)
    expect(c!.passwordHash).not.toContain(r.tempPassword)
    expect(await verifyPassword(c!.passwordHash, r.tempPassword)).toBe(true)
    // 10/1 입사 → 그해 92일 → 특휴 1
    expect(await ledger(r.userId)).toEqual(
      [
        ['annual_leave', 15, 'initial_input'],
        ['checkup', 0.5, 'year_grant'],
        ['night_bank', 2, 'initial_input'],
        ['off_carry', -1, 'initial_input'],
        ['sick_leave', 60, 'year_grant'],
        ['special_leave', 1, 'year_grant'],
      ].sort(),
    )
  })

  it('사번 중복은 제거된 사용자까지 거부', async () => {
    await db.update(users).set({ active: false }).where(eq(users.employeeNo, '00111'))
    const r = await createStaff(db, { ...base, employeeNo: ' 00111 ' }, await ctx())
    expect(r).toEqual({ ok: false, errors: { employeeNo: '이미 등록된 사번입니다.' } })
  })

  it('신규: 트레이닝 3개월, 3인 배정 기간(완전 신규 3주·경력자 2주)', async () => {
    const preceptorId = await idOf('00103')
    const a = await createStaff(
      db,
      { ...base, training: { kind: 'new_grad', preceptorId, tripleWeeks: 3 } },
      await ctx(),
    )
    const b = await createStaff(
      db,
      { ...base, employeeNo: '00121', training: { kind: 'experienced', preceptorId, tripleWeeks: 2 } },
      await ctx(),
    )
    const t = await db.select().from(trainings)
    const of = (id: string) => t.find((x) => x.traineeId === id)!
    if (!a.ok || !b.ok) throw new Error('생성 실패')
    expect(of(a.userId)).toMatchObject({
      kind: 'new_grad',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      tripleStaffUntil: '2026-10-21',
    })
    expect(of(b.userId)).toMatchObject({ kind: 'experienced', tripleStaffUntil: '2026-10-14' })
  })

  it('신규인데 입사일이 없거나 프리셉터가 부적절하면 거부', async () => {
    const preceptorId = await idOf('00103')
    const t = { kind: 'new_grad' as const, preceptorId, tripleWeeks: 3 }
    expect(await createStaff(db, { ...base, hireDate: null, training: t }, await ctx())).toEqual({
      ok: false,
      errors: { hireDate: '신규 간호사는 입사일(트레이닝 시작일)이 필요합니다.' },
    })
    const head = { ...t, preceptorId: await idOf('00101') }
    expect(await createStaff(db, { ...base, training: head }, await ctx())).toEqual({
      ok: false,
      errors: { preceptorId: '프리셉터를 선택해 주세요.' },
    })
  })
})

describe('updateStaff (R-STAFF-EDIT-1·2)', () => {
  it('표 순서를 옮기면 사이 사람들이 한 칸씩 밀린다', async () => {
    const id = await idOf('00111')
    const r = await updateStaff(
      db,
      id,
      { ...updateBase, name: '문가을', seniorityRank: 2, hireDate: null },
      await ctx(),
    )
    expect(r.ok).toBe(true)
    const rows = await listStaff(db, TODAY)
    expect(rows.slice(0, 4).map((x) => x.employeeNo)).toEqual(['00101', '00111', '00102', '00103'])
    expect(rows.map((x) => x.seniorityRank)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1))
  })

  it('트레이닝 해제는 끝을 어제로 당긴다', async () => {
    const preceptorId = await idOf('00103')
    const r = await createStaff(
      db,
      { ...base, hireDate: '2026-10-01', training: { kind: 'new_grad', preceptorId, tripleWeeks: 3 } },
      await ctx(),
    )
    if (!r.ok) throw new Error()
    await updateStaff(db, r.userId, { ...updateBase, seniorityRank: 12 }, await ctx())
    const [t] = await db.select().from(trainings).where(eq(trainings.traineeId, r.userId))
    expect(t!.endDate).toBe('2026-10-12')
    expect((await listStaff(db, TODAY)).find((x) => x.id === r.userId)!.roleLabel).toBe('간호사')
  })
})

describe('removeStaff (R-STAFF-DEL-1·2)', () => {
  it('소프트 삭제와 세션 삭제, 목록에서 빠짐', async () => {
    const id = await idOf('00110')
    await createSession(db, { userId: id, keep: true, now: NOW })
    expect(await removeStaff(db, id, await ctx())).toEqual({ ok: true })
    const [u] = await db.select().from(users).where(eq(users.id, id))
    expect(u!.active).toBe(false)
    expect(u!.deactivatedAt).not.toBeNull()
    expect(await db.$count(sessions, eq(sessions.userId, id))).toBe(0)
    expect((await listStaff(db, TODAY)).map((x) => x.id)).not.toContain(id)
  })

  it('자기 자신·마지막 관리자·진행 중 트레이닝의 프리셉터는 제거할 수 없다', async () => {
    const c = await ctx()
    expect(await removeStaff(db, c.adminId, c)).toEqual({
      ok: false,
      message: '자기 자신은 제거할 수 없습니다.',
    })
    const other = await idOf('00102')
    expect(await removeStaff(db, c.adminId, { ...c, adminId: other })).toEqual({
      ok: false,
      message: '마지막 관리자는 제거할 수 없습니다.',
    })
    const preceptorId = await idOf('00103')
    await createStaff(db, { ...base, training: { kind: 'new_grad', preceptorId, tripleWeeks: 3 } }, c)
    expect(await removeStaff(db, preceptorId, c)).toEqual({
      ok: false,
      message: '진행 중 트레이닝의 프리셉터입니다. 트레이닝을 먼저 수정해 주세요.',
    })
  })
})

describe('reissuePassword (R-STAFF-PW-1)', () => {
  it('새 임시 비밀번호로 로그인되고 변경이 강제되며 기존 세션은 사라진다', async () => {
    const id = await idOf('00103')
    await createSession(db, { userId: id, keep: false, now: NOW })
    await db.update(credentials).set({ failedCount: 3 }).where(eq(credentials.userId, id))
    const r = await reissuePassword(db, id)
    expect(await db.$count(sessions, eq(sessions.userId, id))).toBe(0)
    const auth = await authenticate(db, { employeeNo: '00103', password: r.tempPassword, now: NOW })
    expect(auth).toMatchObject({ ok: true, mustChangePassword: true })
  })
})

describe('adjustBalances (R-STAFF-BAL-1)', () => {
  it('새 값과 원장 합계의 차이를 메모와 함께 admin_adjust로, 같으면 넣지 않음', async () => {
    const id = await idOf('00103')
    const c = await ctx()
    await adjustBalances(
      db,
      { userId: id, values: { annual_leave: 12, night_bank: 3 }, note: '초기 입력 정정' },
      c.adminId,
    )
    const rows = await db
      .select()
      .from(balanceEntries)
      .where(and(eq(balanceEntries.userId, id), eq(balanceEntries.reason, 'admin_adjust')))
    expect(rows.map((r) => [r.account, Number(r.delta), r.note, r.createdBy])).toEqual([
      ['annual_leave', -3, '초기 입력 정정', c.adminId],
    ])
  })
})
