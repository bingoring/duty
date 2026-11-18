import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { createUserWithPassword, createWard } from '../../test/fixtures'
import { createSession, validateSession } from './service'
import { setSessionViewport } from './viewport'

// 3-13: Firebase Hosting은 duty_vp 쿠키를 넘기지 않으므로 화면 폭 보정값을 세션 행에 둔다
const db = setupTestDb()
const T0 = new Date('2026-10-01T09:00:00+09:00')

beforeEach(async () => {
  await resetDb(db)
})

describe('세션 화면 폭 보정값', () => {
  it('저장한 세션에만 보이고, 처음엔 없다', async () => {
    const ward = await createWard(db)
    const u = await createUserWithPassword(db, ward.id)
    const a = await createSession(db, { userId: u.id, keep: true, now: T0 })
    const b = await createSession(db, { userId: u.id, keep: true, now: T0 })
    expect((await validateSession(db, a.token, T0))?.viewport).toBeNull()
    await setSessionViewport(db, a.token, 'mobile')
    expect((await validateSession(db, a.token, T0))?.viewport).toBe('mobile')
    expect((await validateSession(db, b.token, T0))?.viewport).toBeNull()
    await setSessionViewport(db, a.token, 'desktop')
    expect((await validateSession(db, a.token, T0))?.viewport).toBe('desktop')
  })
})
