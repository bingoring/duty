import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { balanceEntries, monthPlans, users } from '../db/schema'
import { ledgerSums } from '../schedule/balances'
import { seedDev } from '../seed/dev'
import { ensureYearStart } from './year-start'

const db = setupTestDb()

async function idOf(no: string) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.employeeNo, no))
  return u!.id
}
async function sums(no: string) {
  const id = await idOf(no)
  return (await ledgerSums(db, [id])).get(id)!
}
async function addDecember(status: string) {
  const [oct] = await db.select().from(monthPlans)
  await db.insert(monthPlans).values({
    wardId: oct!.wardId,
    year: 2026,
    month: 12,
    status,
    requestDeadline: '2026-11-15',
    negotiationStart: '2026-11-16',
    negotiationEnd: '2026-11-20',
  })
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('ensureYearStart (R-YEAR-1~5)', () => {
  it('연차 0, 특휴 산식 부여, 검진 0.5, 병가 60 — 누적 OFF·잔여 N은 그대로', async () => {
    const before = await sums('00103')
    expect(await ensureYearStart(db, '2027-01-05')).toBe('started')
    const after = await sums('00103')
    expect([after.annual_leave, after.special_leave, after.checkup, after.sick_leave]).toEqual([
      0, 5, 0.5, 60,
    ])
    expect([after.off_carry, after.night_bank]).toEqual([before.off_carry, before.night_bank])
    const reset = await db
      .select()
      .from(balanceEntries)
      .where(and(eq(balanceEntries.userId, await idOf('00103')), eq(balanceEntries.reason, 'year_reset')))
    expect(reset.map((r) => [r.account, Number(r.delta), r.refYear]).sort()).toEqual(
      [
        ['annual_leave', -15, 2027],
        ['checkup', -0.5, 2027],
        ['sick_leave', -60, 2027],
        ['special_leave', -5, 2027],
      ].sort(),
    )
  })

  it('연중 입사 예정자는 그해 재직 일수로 특휴', async () => {
    await db.update(users).set({ hireDate: '2027-03-01' }).where(eq(users.employeeNo, '00111'))
    await ensureYearStart(db, '2027-01-05')
    expect((await sums('00111')).special_leave).toBe(4) // 306일 → 4.19 → 4
  })

  it('두 번째 호출은 아무것도 하지 않는다', async () => {
    await ensureYearStart(db, '2027-01-05')
    const n = await db.$count(balanceEntries)
    expect(await ensureYearStart(db, '2027-02-01')).toBe('done')
    expect(await db.$count(balanceEntries)).toBe(n)
  })

  it('동시에 불러도 한 번만 실행', async () => {
    await Promise.all([
      ensureYearStart(db, '2027-01-05'),
      ensureYearStart(db, '2027-01-05'),
      ensureYearStart(db, '2027-01-05'),
    ])
    expect(await db.$count(balanceEntries, eq(balanceEntries.reason, 'year_reset'))).toBe(11 * 4)
  })

  it('전년 12월이 확정·미마감이면 미루고, 마감되면 실행', async () => {
    await addDecember('CONFIRMED')
    expect(await ensureYearStart(db, '2027-01-05')).toBe('deferred')
    expect(await db.$count(balanceEntries, eq(balanceEntries.reason, 'year_reset'))).toBe(0)
    await db.update(monthPlans).set({ status: 'CLOSED' }).where(eq(monthPlans.month, 12))
    expect(await ensureYearStart(db, '2027-01-06')).toBe('started')
  })

  it('시스템 첫해(원장이 모두 올해 생성)면 처리하지 않는다 (R-YEAR-7)', async () => {
    expect(await ensureYearStart(db, '2026-10-13')).toBe('first-year')
    expect(await db.$count(balanceEntries, eq(balanceEntries.reason, 'year_reset'))).toBe(0)
    expect((await sums('00103')).annual_leave).toBe(15)
  })

  it('12월이 생성 중이면 실행(12월 칸은 아직 사용분이 아님)', async () => {
    await addDecember('DRAFTING')
    expect(await ensureYearStart(db, '2027-01-05')).toBe('started')
  })
})
