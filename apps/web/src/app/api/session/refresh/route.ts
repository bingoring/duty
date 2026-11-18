// R-AUTH-8: 로그인 유지 세션 연장. 셸이 페이지 진입 시 한 번 호출한다(서버 컴포넌트는 쿠키를 쓸 수 없으므로).
import { getDb } from '@/server/db/client'
import { validateSession } from '@/server/auth/service'
import { cookies } from 'next/headers'
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE } from '@/server/auth/cookies'
import { getSessionToken, writeSessionCookie } from '@/server/auth/session'

export async function POST() {
  const token = await getSessionToken()
  if (!token) return new Response(null, { status: 401 })
  const s = await validateSession(getDb(), token, new Date(), { renew: true })
  if (!s) return new Response(null, { status: 401 })
  // 3-13: 옛 이름 쿠키만 있으면 연장 시점이 아니어도 새 이름(__session)으로 옮긴다 — Firebase Hosting 전환 전에 미리
  const jar = await cookies()
  const legacyOnly = !jar.has(SESSION_COOKIE)
  if (s.renewedExpiresAt || legacyOnly)
    await writeSessionCookie(token, true, s.renewedExpiresAt ?? s.expiresAt)
  if (legacyOnly) jar.delete(LEGACY_SESSION_COOKIE)
  return new Response(null, { status: 204 })
}
