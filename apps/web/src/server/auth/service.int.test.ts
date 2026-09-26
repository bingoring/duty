import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { createUserWithPassword, createWard } from '../../test/fixtures'
import { credentials, sessions } from '../db/schema'
import { authenticate, changePassword, createSession, deleteSession, validateSession } from './service'
import { hashSessionToken } from './tokens'

const db = setupTestDb()
const T0 = new Date('2026-10-01T09:00:00+09:00')
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000)
const days = (n: number) => minutes(n * 24 * 60)

let wardId: string
beforeEach(async () => {
  await resetDb(db)
  wardId = (await createWard(db)).id
})

describe('authenticate', () => {
  it('올바른 사번·비밀번호로 성공한다 (사번 앞뒤 공백 허용)', async () => {
    const user = await createUserWithPassword(db, wardId)
    const r = await authenticate(db, { employeeNo: ' 00103 ', password: 'right-password', now: T0 })
    expect(r).toEqual({ ok: true, userId: user.id, mustChangePassword: false })
  })

  it('없는 사번·틀린 비밀번호·비활성 사용자는 같은 invalid 오류다 (R-AUTH-1)', async () => {
    await createUserWithPassword(db, wardId)
    await createUserWithPassword(db, wardId, { employeeNo: '00199', active: false })
    for (const [employeeNo, password] of [
      ['99999', 'right-password'],
      ['00103', 'wrong'],
      ['00199', 'right-password'],
    ] as const) {
      expect(await authenticate(db, { employeeNo, password, now: T0 })).toEqual({
        ok: false,
        error: 'invalid',
      })
    }
  })

  it('5회 연속 실패하면 15분 잠긴다 (R-AUTH-3)', async () => {
    const user = await createUserWithPassword(db, wardId)
    for (let i = 0; i < 5; i++) await authenticate(db, { employeeNo: '00103', password: 'wrong', now: T0 })
    const [cred] = await db.select().from(credentials).where(eq(credentials.userId, user.id))
    expect(cred!.lockedUntil).toEqual(minutes(15))
    expect(cred!.failedCount).toBe(0)
  })

  it('잠금 중에는 올바른 비밀번호도 locked로 거부한다 (R-AUTH-4)', async () => {
    await createUserWithPassword(db, wardId)
    for (let i = 0; i < 5; i++) await authenticate(db, { employeeNo: '00103', password: 'wrong', now: T0 })
    const r = await authenticate(db, { employeeNo: '00103', password: 'right-password', now: minutes(14) })
    expect(r).toEqual({ ok: false, error: 'locked', lockedUntil: minutes(15) })
  })

  it('잠금이 끝나면 다시 로그인할 수 있고 실패 횟수가 초기화된다 (R-AUTH-5)', async () => {
    const user = await createUserWithPassword(db, wardId)
    for (let i = 0; i < 5; i++) await authenticate(db, { employeeNo: '00103', password: 'wrong', now: T0 })
    await authenticate(db, { employeeNo: '00103', password: 'wrong', now: minutes(16) })
    const r = await authenticate(db, { employeeNo: '00103', password: 'right-password', now: minutes(17) })
    expect(r.ok).toBe(true)
    const [cred] = await db.select().from(credentials).where(eq(credentials.userId, user.id))
    expect([cred!.failedCount, cred!.lockedUntil]).toEqual([0, null])
  })

  it('임시 비밀번호 상태를 알려 준다', async () => {
    await createUserWithPassword(db, wardId, { mustChange: true })
    const r = await authenticate(db, { employeeNo: '00103', password: 'right-password', now: T0 })
    expect(r).toMatchObject({ ok: true, mustChangePassword: true })
  })
})

describe('세션', () => {
  it('DB에는 토큰 해시만 저장한다 (INV2)', async () => {
    const user = await createUserWithPassword(db, wardId)
    const s = await createSession(db, { userId: user.id, keep: true, userAgent: 'x', now: T0 })
    const rows = await db.select().from(sessions)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(hashSessionToken(s.token))
    expect(rows[0]!.id).not.toBe(s.token)
  })

  it('로그인 유지 = 30일, 미유지 = 12시간 (R-AUTH-7)', async () => {
    const user = await createUserWithPassword(db, wardId)
    expect((await createSession(db, { userId: user.id, keep: true, now: T0 })).expiresAt).toEqual(days(30))
    expect((await createSession(db, { userId: user.id, keep: false, now: T0 })).expiresAt).toEqual(
      minutes(12 * 60),
    )
  })

  it('유효한 세션은 사용자 정보를 돌려준다', async () => {
    const user = await createUserWithPassword(db, wardId, { role: 'admin' })
    const s = await createSession(db, { userId: user.id, keep: false, now: T0 })
    const v = await validateSession(db, s.token, minutes(60))
    expect(v?.user).toMatchObject({
      id: user.id,
      employeeNo: '00103',
      name: '정하늘',
      role: 'admin',
      wardName: '응급실',
    })
    expect(v?.renewedExpiresAt).toBeUndefined()
  })

  it('만료된 세션은 null이고 행을 삭제한다 (R-AUTH-10)', async () => {
    const user = await createUserWithPassword(db, wardId)
    const s = await createSession(db, { userId: user.id, keep: false, now: T0 })
    expect(await validateSession(db, s.token, minutes(12 * 60))).toBeNull()
    expect(await db.select().from(sessions)).toHaveLength(0)
  })

  it('비활성 사용자의 세션은 null이다 (INV3)', async () => {
    const user = await createUserWithPassword(db, wardId, { active: false })
    const s = await createSession(db, { userId: user.id, keep: true, now: T0 })
    expect(await validateSession(db, s.token, T0)).toBeNull()
  })

  it('모르는 토큰은 null이다', async () => {
    expect(await validateSession(db, 'nope', T0)).toBeNull()
  })

  it('로그인 유지 세션은 남은 기간이 15일 미만이면 30일로 갱신한다 (R-AUTH-8)', async () => {
    const user = await createUserWithPassword(db, wardId)
    const s = await createSession(db, { userId: user.id, keep: true, now: T0 })
    expect((await validateSession(db, s.token, days(14)))?.renewedExpiresAt).toBeUndefined()
    const v = await validateSession(db, s.token, days(16))
    expect(v?.renewedExpiresAt).toEqual(days(46))
    const [row] = await db.select().from(sessions)
    expect(row!.expiresAt).toEqual(days(46))
  })

  it('renew: false면 연장하지 않는다 (쿠키를 쓸 수 없는 서버 컴포넌트 렌더용)', async () => {
    const user = await createUserWithPassword(db, wardId)
    const s = await createSession(db, { userId: user.id, keep: true, now: T0 })
    const v = await validateSession(db, s.token, days(16), { renew: false })
    expect(v?.renewedExpiresAt).toBeUndefined()
    const [row] = await db.select().from(sessions)
    expect(row!.expiresAt).toEqual(days(30))
  })

  it('비유지 세션은 갱신하지 않는다', async () => {
    const user = await createUserWithPassword(db, wardId)
    const s = await createSession(db, { userId: user.id, keep: false, now: T0 })
    expect((await validateSession(db, s.token, minutes(11 * 60)))?.renewedExpiresAt).toBeUndefined()
  })

  it('로그아웃하면 그 세션만 사라진다 (R-AUTH-13)', async () => {
    const user = await createUserWithPassword(db, wardId)
    const a = await createSession(db, { userId: user.id, keep: true, now: T0 })
    const b = await createSession(db, { userId: user.id, keep: true, now: T0 })
    await deleteSession(db, a.token)
    expect(await validateSession(db, a.token, T0)).toBeNull()
    expect(await validateSession(db, b.token, T0)).not.toBeNull()
  })
})

describe('changePassword', () => {
  it('첫 로그인 강제 변경은 현재 비밀번호 없이 바꾸고 must_change를 해제한다', async () => {
    const user = await createUserWithPassword(db, wardId, { mustChange: true })
    const s = await createSession(db, { userId: user.id, keep: false, now: T0 })
    const r = await changePassword(db, {
      userId: user.id,
      sessionToken: s.token,
      next: 'new-pass-1',
      confirm: 'new-pass-1',
      now: T0,
    })
    expect(r).toEqual({ ok: true })
    const [cred] = await db.select().from(credentials).where(eq(credentials.userId, user.id))
    expect([cred!.mustChangePassword, cred!.passwordChangedAt]).toEqual([false, T0])
    expect((await authenticate(db, { employeeNo: '00103', password: 'new-pass-1', now: T0 })).ok).toBe(true)
  })

  it('자발적 변경은 현재 비밀번호가 맞아야 한다', async () => {
    const user = await createUserWithPassword(db, wardId)
    const s = await createSession(db, { userId: user.id, keep: false, now: T0 })
    const r = await changePassword(db, {
      userId: user.id,
      sessionToken: s.token,
      current: 'wrong',
      next: 'new-pass-1',
      confirm: 'new-pass-1',
      now: T0,
    })
    expect(r).toEqual({ ok: false, field: 'current', message: '현재 비밀번호가 올바르지 않습니다.' })
  })

  it('정책 위반은 필드 오류를 돌려준다', async () => {
    const user = await createUserWithPassword(db, wardId, { mustChange: true })
    const s = await createSession(db, { userId: user.id, keep: false, now: T0 })
    const r = await changePassword(db, {
      userId: user.id,
      sessionToken: s.token,
      next: '00103',
      confirm: '00103',
      now: T0,
    })
    expect(r).toMatchObject({ ok: false, field: 'next' })
  })

  it('첫 로그인 강제 변경에서 임시 비밀번호를 그대로 다시 쓸 수 없다', async () => {
    const user = await createUserWithPassword(db, wardId, { mustChange: true, password: 'temp-pass-9' })
    const s = await createSession(db, { userId: user.id, keep: false, now: T0 })
    const r = await changePassword(db, {
      userId: user.id,
      sessionToken: s.token,
      next: 'temp-pass-9',
      confirm: 'temp-pass-9',
      now: T0,
    })
    expect(r).toEqual({ ok: false, field: 'next', message: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.' })
  })

  it('다른 세션은 모두 삭제하고 현재 세션만 남긴다 (R-AUTH-12)', async () => {
    const user = await createUserWithPassword(db, wardId, { mustChange: true })
    const current = await createSession(db, { userId: user.id, keep: false, now: T0 })
    const other = await createSession(db, { userId: user.id, keep: true, now: T0 })
    await changePassword(db, {
      userId: user.id,
      sessionToken: current.token,
      next: 'new-pass-1',
      confirm: 'new-pass-1',
      now: T0,
    })
    expect(await validateSession(db, current.token, T0)).not.toBeNull()
    expect(await validateSession(db, other.token, T0)).toBeNull()
  })
})
