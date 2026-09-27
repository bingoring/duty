import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { users } from '../db/schema'
import { seedDev } from '../seed/dev'
import { loadRequestsRaw } from './load'
import { saveLeave, saveShiftRequest, submitRequests } from './service'

const db = setupTestDb()
const TODAY = '2026-10-05'

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('loadRequestsRaw', () => {
  it('11월: 계획을 만들고 교대 근무자 10명(수간호사 제외), 내 카드의 월초 값은 10월 투영', async () => {
    const me = await actor('00103')
    const r = await loadRequestsRaw(db, { ym: { year: 2026, month: 11 }, viewer: me, today: TODAY })
    expect(r.plan?.status).toBe('REQUESTING')
    expect(r.users).toHaveLength(10)
    // 11월 기준 OFF = 주말 9, 정하늘 10월 월말 누적 +4·잔여 N 3
    expect(r.viewerCard).toEqual({ baseline: 9, offCarry: 4, nightBank: 3, weekendMissedLastMonth: null })
  })

  it('확정된 10월은 칸 코드를 함께 싣는다', async () => {
    const me = await actor('00103')
    const r = await loadRequestsRaw(db, { ym: { year: 2026, month: 10 }, viewer: me, today: TODAY })
    expect(r.plan?.status).toBe('CONFIRMED')
    expect(r.scheduled.find((s) => s.userId === me.id && s.date === '2026-10-01')?.label).toBe('N')
  })

  it('관리자: 승인 대기 휴가와 인원 영향, 월 배지', async () => {
    const who = await actor('00106')
    const admin = await actor('00101')
    await loadRequestsRaw(db, { ym: { year: 2026, month: 11 }, viewer: admin, today: TODAY })
    await saveLeave(db, who, { userId: who.id, type: 'sick', startDate: '2026-10-02' }, TODAY)
    await saveLeave(db, who, { userId: who.id, type: 'annual', startDate: '2026-11-04' }, TODAY)
    await submitRequests(db, who, { year: 2026, month: 10 }, TODAY)
    await submitRequests(db, who, { year: 2026, month: 11 }, TODAY)
    const r = await loadRequestsRaw(db, { ym: { year: 2026, month: 11 }, viewer: admin, today: TODAY })
    expect(r.pending.map((p) => [p.monthLabel, p.confirmedMonth, p.kindLabel, p.impact])).toEqual([
      ['10월 · 확정된 달', true, '병가', ['10/2 (금) D 인원 1명 · 최소 2명']],
      ['11월 · 신청 중', false, '연차', null],
    ])
  })

  it('간호사에게는 승인 대기 목록을 싣지 않는다', async () => {
    const me = await actor('00103')
    await loadRequestsRaw(db, { ym: { year: 2026, month: 11 }, viewer: me, today: TODAY }) // 화면을 열면 계획이 생긴다
    expect(
      await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-13', options: ['OFF'] }, TODAY),
    ).toEqual({ ok: true })
    const r = await loadRequestsRaw(db, { ym: { year: 2026, month: 11 }, viewer: me, today: TODAY })
    expect(r.pending).toEqual([])
    expect(r.requests).toHaveLength(1)
  })

  it('로드 평균 < 300ms', async () => {
    const me = await actor('00103')
    await loadRequestsRaw(db, { ym: { year: 2026, month: 11 }, viewer: me, today: TODAY })
    const t0 = performance.now()
    for (let i = 0; i < 5; i++)
      await loadRequestsRaw(db, { ym: { year: 2026, month: 11 }, viewer: me, today: TODAY })
    expect((performance.now() - t0) / 5).toBeLessThan(300)
  })
})
