import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { getDb } from '../db/client'
import { SESSION_COOKIE, sessionCookie } from './cookies'
import { validateSession, type ValidSession } from './service'

export const isProd = () => process.env.NODE_ENV === 'production'

// 요청당 1회. 서버 컴포넌트 렌더 중에는 쿠키를 쓸 수 없으므로 연장하지 않는다(연장은 /api/session/refresh).
export const getSession = cache(async (): Promise<ValidSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return validateSession(getDb(), token, new Date(), { renew: false })
})

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value
}

// Server Action / Route Handler 문맥에서만 호출
export async function writeSessionCookie(token: string, persistent: boolean, expiresAt: Date) {
  const c = sessionCookie({ token, persistent, expiresAt, secure: isProd(), now: new Date() })
  const { name, value, ...options } = c
  ;(await cookies()).set(name, value, options)
}

export async function clearSessionCookie() {
  ;(await cookies()).delete(SESSION_COOKIE)
}
