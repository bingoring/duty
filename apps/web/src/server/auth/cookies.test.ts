import { describe, expect, it } from 'vitest'
import { SESSION_COOKIE, sessionCookie } from './cookies'

const now = new Date('2026-10-01T00:00:00Z')

describe('sessionCookie', () => {
  it('이름은 duty_session, httpOnly·SameSite=Lax·Path=/ (R-AUTH-9)', () => {
    const c = sessionCookie({ token: 't', persistent: false, expiresAt: now, secure: false, now })
    expect(c).toMatchObject({ name: SESSION_COOKIE, value: 't', httpOnly: true, sameSite: 'lax', path: '/' })
    expect(SESSION_COOKIE).toBe('duty_session')
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
