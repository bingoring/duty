import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { balanceEntries, holidays, users } from '../db/schema'
import { seedDev } from '../seed/dev'
import { addHoliday, deleteHoliday, importHolidays, listHolidays } from './service'

const db = setupTestDb()

async function adminId() {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.employeeNo, '00101'))
  return u!.id
}
async function foundingSum(employeeNo: string) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.employeeNo, employeeNo))
  const rows = await db
    .select()
    .from(balanceEntries)
    .where(and(eq(balanceEntries.userId, u!.id), eq(balanceEntries.account, 'founding_off')))
  return rows.reduce((s, r) => s + Number(r.delta), 0)
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('관리자 입력 (R-HOL-EDIT-1·2)', () => {
  it('병원 지정일 추가, 같은 날짜는 거부', async () => {
    expect(
      await addHoliday(db, { date: '2026-10-20', name: '병원 창립 행사', kind: 'hospital' }, await adminId()),
    ).toEqual({
      ok: true,
    })
    expect((await listHolidays(db, 2026)).find((h) => h.date === '2026-10-20')).toMatchObject({
      source: 'admin',
      kind: 'hospital',
    })
    expect(
      await addHoliday(db, { date: '2026-10-09', name: '중복', kind: 'hospital' }, await adminId()),
    ).toEqual({
      ok: false,
      errors: { date: '이미 등록된 날짜입니다.' },
    })
  })

  it('개원기념일은 연도당 1개, 추가하면 재직자에게 개원오프 1, 삭제하면 회수 (R-HOL-FOUND-1)', async () => {
    const r = await addHoliday(
      db,
      { date: '2026-11-10', name: '개원기념일', kind: 'founding_day' },
      await adminId(),
    )
    expect(r).toEqual({ ok: true })
    expect(await foundingSum('00103')).toBe(1)
    expect(
      await addHoliday(db, { date: '2026-12-01', name: '개원기념일', kind: 'founding_day' }, await adminId()),
    ).toEqual({
      ok: false,
      errors: { date: '2026년 개원기념일이 이미 있습니다.' },
    })
    const [h] = await db.select().from(holidays).where(eq(holidays.date, '2026-11-10'))
    await deleteHoliday(db, h!.id, await adminId())
    expect(await foundingSum('00103')).toBe(0)
  })

  it('개원기념일 이후 입사자는 대상 아님', async () => {
    await db.update(users).set({ hireDate: '2026-11-15' }).where(eq(users.employeeNo, '00111'))
    await addHoliday(db, { date: '2026-11-10', name: '개원기념일', kind: 'founding_day' }, await adminId())
    expect(await foundingSum('00111')).toBe(0)
  })
})

describe('공공데이터 가져오기 (R-HOL-API-2)', () => {
  const fake = (items: { dateName: string; locdate: number }[]) =>
    (async () =>
      new Response(
        JSON.stringify({
          response: {
            header: { resultCode: '00' },
            body: { items: { item: items.map((i) => ({ ...i, isHoliday: 'Y' })) } },
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch

  it('새 날짜 추가, 시드 항목은 이름 갱신, 관리자 항목과 API에 없는 항목은 그대로', async () => {
    await addHoliday(db, { date: '2026-12-31', name: '병원 휴무', kind: 'hospital' }, await adminId())
    const before = (await listHolidays(db, 2026)).length
    const r = await importHolidays(db, 2026, 'key', {
      fetchImpl: fake([
        { dateName: '개천절', locdate: 20261003 }, // 시드와 같음 → 유지
        { dateName: '대체공휴일', locdate: 20261005 }, // 시드 이름과 다름 → 갱신
        { dateName: '임시공휴일', locdate: 20261002 }, // 새 날짜 → 추가
        { dateName: '연말', locdate: 20261231 }, // 관리자 항목 → 유지
      ]),
    })
    expect(r).toEqual({ ok: true, added: 1, updated: 1, kept: 2 })
    const list = await listHolidays(db, 2026)
    expect(list).toHaveLength(before + 1)
    expect(list.find((h) => h.date === '2026-10-05')).toMatchObject({
      name: '대체공휴일',
      kind: 'substitute',
      source: 'api',
    })
    expect(list.find((h) => h.date === '2026-10-02')).toMatchObject({
      name: '임시공휴일',
      kind: 'public',
      source: 'api',
    })
    expect(list.find((h) => h.date === '2026-12-31')).toMatchObject({ name: '병원 휴무', source: 'admin' })
    expect(list.find((h) => h.date === '2026-05-01')).toBeDefined() // API에 없는 시드 항목(노동절) 유지
  })

  it('API 오류면 아무것도 쓰지 않는다', async () => {
    const before = await listHolidays(db, 2026)
    const bad = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch
    expect(await importHolidays(db, 2026, 'key', { fetchImpl: bad })).toEqual({
      ok: false,
      message: '공공데이터 API 응답 오류(503)',
    })
    expect(await listHolidays(db, 2026)).toEqual(before)
  })
})
