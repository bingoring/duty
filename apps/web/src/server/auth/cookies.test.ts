import { describe, expect, it } from 'vitest'
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE, pickSessionToken, sessionCookie } from './cookies'

const now = new Date('2026-10-01T00:00:00Z')

describe('sessionCookie', () => {
  it('이름은 __session(3-13 Firebase Hosting이 넘기는 유일한 쿠키), httpOnly·SameSite=Lax·Path=/ (R-AUTH-9)', () => {
    const c = sessionCookie({ token: 't', persistent: false, expiresAt: now, secure: false, now })
    expect(c).toMatchObject({ name: SESSION_COOKIE, value: 't', httpOnly: true, sameSite: 'lax', path: '/' })
    expect(SESSION_COOKIE).toBe('__session')
    expect(LEGACY_SESSION_COOKIE).toBe('duty_session')
  })
  it('로그인 유지면 만료까지 남은 초를 maxAge로 둔다 (R-AUTH-7)', () => {
    const expiresAt = new Date(now.getTime() + 30 * 86400_000)
    expect(sessionCookie({ token: 't', persistent: true, expiresAt, secure: false, now }).maxAge).toBe(
      30 * 86400,
    )
  })
  it('비유지면 maxAge 없이 브라우저 세션 쿠키다', () => {
    expect(
      sessionCookie({ token: 't', persistent: false, expiresAt: now, secure: false, now }),
    ).not.toHaveProperty('maxAge')
  })
  it('secure 플래그를 그대로 반영한다', () => {
    expect(sessionCookie({ token: 't', persistent: false, expiresAt: now, secure: true, now }).secure).toBe(
      true,
    )
  })
})

// 3-13: 새 이름으로 쓰고 옛 이름도 읽는다 — 머지·전환 때 아무도 로그아웃되지 않게
describe('pickSessionToken', () => {
  const jar = (m: Record<string, string>) => (n: string) => m[n]
  it('새 이름이 있으면 새 값', () =>
    expect(pickSessionToken(jar({ __session: 'new', duty_session: 'old' }))).toBe('new'))
  it('옛 이름만 있으면 옛 값', () => expect(pickSessionToken(jar({ duty_session: 'old' }))).toBe('old'))
  it('없으면 undefined', () => expect(pickSessionToken(jar({}))).toBeUndefined())
})
