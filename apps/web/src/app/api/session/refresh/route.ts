// R-AUTH-8: 로그인 유지 세션 연장. 셸이 페이지 진입 시 한 번 호출한다(서버 컴포넌트는 쿠키를 쓸 수 없으므로).
import { getDb } from '@/server/db/client'
import { validateSession } from '@/server/auth/service'
import { getSessionToken, writeSessionCookie } from '@/server/auth/session'

export async function POST() {
  const token = await getSessionToken()
  if (!token) return new Response(null, { status: 401 })
  const s = await validateSession(getDb(), token, new Date(), { renew: true })
  if (!s) return new Response(null, { status: 401 })
  if (s.renewedExpiresAt) await writeSessionCookie(token, true, s.renewedExpiresAt)
  return new Response(null, { status: 204 })
}
