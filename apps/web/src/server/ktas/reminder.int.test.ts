import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { users } from '../db/schema'
import { seedDev } from '../seed/dev'
import { ackKtasReminder, ktasReminder } from './reminder'

// 3-8 KTAS 갱신 안내 팝업
const db = setupTestDb()
const TODAY = '2026-10-19'

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('KTAS 갱신 안내 (3-8)', () => {
  it('만료 6개월 이내면 보이고, 확인 3번 뒤엔 안 보이며, 갱신일을 넣어 만료일이 바뀌면 다시 센다', async () => {
    const [u] = await db.select().from(users).where(eq(users.employeeNo, '00103'))
    const id = u!.id
    await db.update(users).set({ ktasCertifiedOn: '2024-01-01' }).where(eq(users.id, id))
    expect(await ktasReminder(db, id, TODAY)).toEqual({ until: '2026-12-31' })
    for (let i = 0; i < 3; i++) await ackKtasReminder(db, id, TODAY)
    expect(await ktasReminder(db, id, TODAY)).toBeNull()

    // 갱신했지만 다음 만료도 6개월 이내면(예: 늦게 입력) 다시 3번
    await db.update(users).set({ ktasRenewedOn: '2024-02-01' }).where(eq(users.id, id))
    expect(await ktasReminder(db, id, TODAY)).toEqual({ until: '2027-01-31' })
    // 갱신 시기 밖이면 안 보인다
    await db.update(users).set({ ktasRenewedOn: '2026-10-01' }).where(eq(users.id, id))
    expect(await ktasReminder(db, id, TODAY)).toBeNull()
  })
})
