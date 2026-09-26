import { addDays } from '@duty/domain'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { balanceEntries, monthPlans, monthSettlements, scheduleCells, users } from '../db/schema'
import { seedDev } from '../seed/dev'
import { loadLeaveBalance, loadMonthView } from './load'

const db = setupTestDb()

// 종이 근무표 2026-10의 누적 off (fixtures/paper-2026-10.json, 가명)
const PAPER_ACC: Record<string, number> = {
  '00102': 0,
  '00103': 4,
  '00104': 2,
  '00105': 3,
  '00106': 0,
  '00107': 1,
  '00108': 2,
  '00109': 3,
  '00110': 2,
  '00111': 0,
}

async function userId(employeeNo: string) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.employeeNo, employeeNo))
  return u!.id
}

async function oct(viewer = '00103', today = '2026-10-01') {
  return loadMonthView(db, { year: 2026, month: 10, viewerId: await userId(viewer), today })
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('loadMonthView — 종이 2026-10', () => {
  it('확정 계획·11명·칸 330개·오늘 칸', async () => {
    const d = await oct()
    expect(d.plan).toMatchObject({ status: 'CONFIRMED', confirmedByName: '한수정' })
    expect(d.users).toHaveLength(11)
    expect(d.cells).toHaveLength(330)
    expect(d.todayCell?.code).toBe('N') // 정하늘 10/1
  })

  it('10명의 누적 off(월말)가 종이와 같고, 월초는 이월 off다 (INV3)', async () => {
    const d = await oct()
    const byNo = new Map(d.users.map((u) => [u.id, u.employeeNo]))
    for (const [id, b] of d.balances) {
      const no = byNo.get(id)!
      if (no === '00101') continue
      expect([no, b.offCarryAfter]).toEqual([no, PAPER_ACC[no]])
    }
    const me = d.balances.get(await userId('00103'))!
    expect([me.offCarryBefore, me.nightBankBefore, me.nightBankAfter]).toEqual([4, 3, 3])
    expect([me.annual, me.special, me.checkup, me.eduContThisYear]).toEqual([15, 5, 0.5, 0])
  })

  it('계획이 없는 달은 plan = null, 칸 없음', async () => {
    const d = await loadMonthView(db, {
      year: 2026,
      month: 9,
      viewerId: await userId('00103'),
      today: '2026-09-27',
    })
    expect(d.plan).toBeNull()
    expect(d.cells).toEqual([])
  })

  it('비활성이고 칸이 없는 사용자는 행에서 빠진다 (R-VIEW-3)', async () => {
    await db
      .update(users)
      .set({ active: false, deactivatedAt: new Date('2026-09-01T00:00:00+09:00') })
      .where(eq(users.employeeNo, '00111'))
    await db.delete(scheduleCells).where(eq(scheduleCells.userId, await userId('00111')))
    expect((await oct()).users.map((u) => u.employeeNo)).not.toContain('00111')
  })
})

describe('이월 체인 — 마감 전 달이 여러 개 (R-VIEW-12)', () => {
  it('11월(확정)의 월초 = 10월(확정·미마감) 투영 월말', async () => {
    const [octPlan] = await db.select().from(monthPlans)
    const [nov] = await db
      .insert(monthPlans)
      .values({
        wardId: octPlan!.wardId,
        year: 2026,
        month: 11,
        status: 'CONFIRMED',
        requestDeadline: '2026-10-15',
        negotiationStart: '2026-10-16',
        negotiationEnd: '2026-10-20',
        ruleVersion: 1,
      })
      .returning()
    const me = await userId('00103')
    // 11월: 앞 10일 OFF, 나머지 D (11월 기준 OFF = 주말 9)
    const cells = Array.from({ length: 30 }, (_, i) => ({
      monthPlanId: nov!.id,
      userId: me,
      date: addDays('2026-11-01', i),
      code: i < 10 ? 'OFF' : 'D',
      offKind: i < 10 ? 'regular' : null,
      source: 'auto',
    }))
    await db.insert(scheduleCells).values(cells)
    const d = await loadMonthView(db, { year: 2026, month: 11, viewerId: me, today: '2026-11-01' })
    const b = d.balances.get(me)!
    expect([b.offCarryBefore, b.offCarryAfter]).toEqual([4, 4 + 10 - 9])
    expect([b.nightBankBefore, b.nightBankAfter]).toEqual([3, 3])
  })
})

describe('마감된 달 (R-VIEW-12·13)', () => {
  it('월초·월말은 정산 스냅샷, 잔여는 마감 시점까지의 원장', async () => {
    const [plan] = await db.select().from(monthPlans)
    const me = await userId('00103')
    const closedAt = new Date('2026-11-02T09:00:00+09:00')
    await db.update(monthPlans).set({ status: 'CLOSED', closedAt }).where(eq(monthPlans.id, plan!.id))
    await db.insert(monthSettlements).values({
      monthPlanId: plan!.id,
      userId: me,
      baselineOff: 11,
      actualOff: 11,
      sleepingOff: 1,
      nightCount: 6,
      offCarryBefore: '4',
      offCarryAfter: '7', // 스냅샷이 우선함을 보이려고 계산과 다른 값
      nightBankBefore: 3,
      nightBankAfter: 3,
      weekendPairAchieved: true,
      specialUsed: '0',
      foundingUsed: '0',
      checkupUsed: '0',
      eduCont: 0,
    })
    await db.insert(balanceEntries).values({
      userId: me,
      account: 'special_leave',
      delta: '-2',
      reason: 'admin_adjust',
      createdAt: new Date('2026-11-05T09:00:00+09:00'),
    })
    const b = (await oct()).balances.get(me)!
    expect([b.offCarryBefore, b.offCarryAfter]).toEqual([4, 7])
    expect(b.special).toBe(5) // 마감 뒤 조정은 반영하지 않는다
  })
})

describe('loadLeaveBalance — 사이드바 「내 휴가 잔여」 (R-SHELL-2)', () => {
  it('오늘이 속한 확정 달의 월말 예정 + 올해 부여', async () => {
    const s = await loadLeaveBalance(db, { viewerId: await userId('00103'), today: '2026-10-15' })
    expect(s).toEqual({
      annual: 15,
      annualGranted: 15,
      special: 5,
      specialGranted: 5,
      checkup: 0.5,
      sick: 60,
      offCarry: 4,
      nightBank: 3,
    })
  })

  it('오늘의 달이 확정 전이면 월초 값(= 원장 + 앞선 확정 달 투영)', async () => {
    const s = await loadLeaveBalance(db, { viewerId: await userId('00103'), today: '2026-12-01' })
    expect([s.offCarry, s.nightBank]).toEqual([4, 3])
  })
})

describe('성능 (1-3 §7)', () => {
  it('10월 로드 평균 < 300ms', async () => {
    const viewer = await userId('00103')
    await loadMonthView(db, { year: 2026, month: 10, viewerId: viewer, today: '2026-10-01' })
    const t0 = performance.now()
    for (let i = 0; i < 5; i++)
      await loadMonthView(db, { year: 2026, month: 10, viewerId: viewer, today: '2026-10-01' })
    expect((performance.now() - t0) / 5).toBeLessThan(300)
  })
})
