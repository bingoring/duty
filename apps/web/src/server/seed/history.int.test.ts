import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { authenticate } from '../auth/service'
import { balanceEntries, monthPlans, monthSettlements, users } from '../db/schema'
import { ledgerSums } from '../schedule/balances'
import { loadMonthView } from '../schedule/load'
import { importHistory, type HistoryBundle, type HistoryCell } from './history'

// Build Spec 3-1 「이력 가져오기」 — 가명 데이터
const db = setupTestDb()

const month = (m: number, spec: string): HistoryCell[] =>
  spec.split(' ').flatMap((t, i): HistoryCell[] => {
    const date = `2026-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    if (t === '-') return []
    if (t === 'O') return [{ date, code: 'OFF', offKind: 'regular', source: 'auto' }]
    if (t === 'R') return [{ date, code: 'OFF', offKind: 'regular', source: 'requested' }]
    if (t === 'SP') return [{ date, code: 'OFF', offKind: 'special', source: 'requested' }]
    return [{ date, code: t as 'D', source: 'auto' }]
  })
// 9월 30일: 토·일·추석(9/24~26) 반영 기준 OFF는 시드 공휴일로 계산된다
const SEP = 'D D E E N N O O D D E E N N O O D D E E N N O O D D E E N N'
const OCT = 'O O D D E E N N O O D D E E N N O O D D E E N N O O D D E E N'

function bundle(): HistoryBundle {
  return {
    year: 2026,
    people: [
      {
        employeeNo: '00101',
        name: '한수정',
        role: 'admin',
        rotation: 'fixed_weekday',
        seniorityRank: 1,
        seniorityTier: 'senior',
        hireDate: null,
        kTass: true,
        unionMember: true,
        deactivatedOn: null,
        initialPassword: 'gkstnwjd',
      },
      {
        employeeNo: '00103',
        name: '정하늘',
        role: 'nurse',
        rotation: 'rotating',
        seniorityRank: 2,
        seniorityTier: 'senior',
        hireDate: null,
        kTass: true,
        unionMember: false,
        deactivatedOn: null,
        initialPassword: 'wjdgksmf',
      },
      {
        employeeNo: '00199',
        name: '서가람',
        role: 'nurse',
        rotation: 'rotating',
        seniorityRank: 3,
        seniorityTier: 'junior',
        hireDate: null,
        kTass: false,
        unionMember: false,
        deactivatedOn: '2026-10-01',
        initialPassword: 'tjrkfka',
      },
    ],
    months: [
      {
        month: 9,
        rows: [
          {
            employeeNo: '00103',
            offCarryBefore: 1,
            nightBankBefore: 2,
            offCarryAfter: 2,
            nightBankAfter: 2,
            specialAfter: 4,
            foundingAfter: 1,
            checkupAfter: 0.5,
            eduContAfter: 0,
            cells: month(9, SEP.replace(/^D/, 'SP')),
          },
          {
            employeeNo: '00199',
            offCarryBefore: 0,
            nightBankBefore: 0,
            offCarryAfter: -1,
            nightBankAfter: 2,
            specialAfter: 2,
            foundingAfter: 0,
            checkupAfter: 0,
            eduContAfter: 0,
            cells: month(9, SEP),
          },
        ],
      },
      {
        month: 10,
        // 종이에서 9월 말 누적 2를 10월 이월 3으로 고쳐 적음(수기 조정), 10월은 ⓡN 없음
        rows: [
          {
            employeeNo: '00103',
            offCarryBefore: 3,
            nightBankBefore: 2,
            offCarryAfter: 3,
            nightBankAfter: null,
            specialAfter: 4,
            foundingAfter: 1,
            checkupAfter: 0.5,
            eduContAfter: 0,
            cells: month(10, OCT),
          },
        ],
      },
    ],
  }
}

beforeEach(async () => {
  await resetDb(db)
})

describe('importHistory', () => {
  it('사람·자격 증명(초기 비밀번호, 변경 강제)·마감/확정 달을 넣는다', async () => {
    const r = await importHistory(db, bundle())
    expect(r).toMatchObject({ users: 3, active: 2, plans: { closed: 1, confirmed: 1 }, adjustments: 1 })
    expect(
      await authenticate(db, { employeeNo: '00103', password: 'wjdgksmf', now: new Date() }),
    ).toMatchObject({
      ok: true,
      mustChangePassword: true,
    })
    // 제거된 사람은 로그인할 수 없다
    expect((await authenticate(db, { employeeNo: '00199', password: 'tjrkfka', now: new Date() })).ok).toBe(
      false,
    )
    const plans = await db.select().from(monthPlans)
    expect(plans.map((p) => [p.month, p.status]).sort()).toEqual([
      [10, 'CONFIRMED'],
      [9, 'CLOSED'],
    ])
  })

  it('원장 합계 = 마지막 달 이월(수기 조정 포함), 마감 스냅샷은 엑셀 값', async () => {
    await importHistory(db, bundle())
    const [me] = await db.select().from(users).where(eq(users.employeeNo, '00103'))
    const s = (await ledgerSums(db, [me!.id])).get(me!.id)!
    expect([s.off_carry, s.night_bank, s.special_leave, s.founding_off]).toEqual([3, 2, 4, 1])
    const [snap] = await db.select().from(monthSettlements).where(eq(monthSettlements.userId, me!.id))
    expect([Number(snap!.offCarryBefore), Number(snap!.offCarryAfter), snap!.specialUsed]).toEqual([
      1,
      2,
      '1.0',
    ])
    expect(
      await db.$count(
        balanceEntries,
        and(eq(balanceEntries.userId, me!.id), eq(balanceEntries.reason, 'admin_adjust')),
      ),
    ).toBe(1)
    // 10월 근무표 화면: 월초 = 원장
    const v = await loadMonthView(db, { year: 2026, month: 10, viewerId: me!.id, today: '2026-10-09' })
    expect(v.balances.get(me!.id)!.offCarryBefore).toBe(3)
  })

  it('미리보기는 저장하지 않고, 사용자가 있는 DB에는 넣지 않는다', async () => {
    const preview = await importHistory(db, bundle(), { dryRun: true })
    expect(preview.users).toBe(3)
    expect(await db.$count(users)).toBe(0)
    await importHistory(db, bundle())
    await expect(importHistory(db, bundle())).rejects.toThrow('빈 운영 DB 전용')
  })
})
