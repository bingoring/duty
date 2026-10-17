import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { users } from '../db/schema'
import { saveOnboarding } from '../onboarding/service'
import { listStaff } from '../staff/service'
import { seedDev } from '../seed/dev'
import { weekendPairOptOuts, weekendPairPreference } from './service'

// 3-6: 개인 주말 통 OFF · 내 설정 KTAS
const db = setupTestDb()
const TODAY = '2026-10-18'

async function idOf(no: string) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.employeeNo, no))
  return u!.id
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('주말 통 OFF 개인 설정 (3-6)', () => {
  it('처음엔 모두 받음, 끈 사람은 규칙 설정 목록에 보인다', async () => {
    const me = await idOf('00103')
    expect(await weekendPairPreference(db, me)).toEqual({ wanted: true, rotating: true })
    expect(await weekendPairOptOuts(db)).toEqual([])
    await db.update(users).set({ weekendPairWanted: false }).where(eq(users.id, me))
    expect(await weekendPairOptOuts(db)).toEqual(['정하늘'])
  })
})

describe('내 설정 KTAS (3-6)', () => {
  it('취득일·갱신일을 고치면 바로 반영되고 만료일은 늦은 날 + 3년, 관리자 확인 요청이 남는다', async () => {
    const me = await idOf('00103')
    const r = await saveOnboarding(db, {
      userId: me,
      today: TODAY,
      mode: 'ktas_edit',
      input: { kTass: true, ktasCertifiedOn: '2020-03-01', ktasRenewedOn: '2024-03-01' },
    })
    expect(r).toMatchObject({ ok: true, changed: 2 })
    const row = (await listStaff(db, TODAY)).find((x) => x.id === me)!
    expect(row).toMatchObject({ ktasCertifiedOn: '2020-03-01', ktasRenewedOn: '2024-03-01' })
    expect(row.ktas).toEqual({ kind: 'renew', until: '2027-02-28' })
  })
})
